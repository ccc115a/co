//! hackserve 的 Jack 全鏈路（v1.0，網頁版）：`.jack → .vm → .asm → .hack → hackemu` 執行。
//!
//! - `jack-list`：列內建 Jack 程式（`../11/jack/*`，含 OS）＋無 OS 案例（`../11/jackNoOs/*`）
//!   ＋虛擬 e2e 入口（`gen/chain`）。
//! - `jack-source{program}`：回該程式各 `.jack` 檔全文（前端預覽）。
//! - `jack-run{program}`｜`{files, withOS}`：把來源寫進暫存目錄，依序 spawn 既有 CLI
//!   （`jack2vm → vm2asm → hackasm → hackemu --headless`），逐階段抓回產物與 exit code。
//!
//! v1.0 邊界：只動網頁版，自用單人機器；工具鏈引擎與既有 CLI 一律不改，當子程序呼叫。

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::reply;

/// 內建 Jack 程式（`../11/jack/<NAME>/`）。第二欄＝needsOS（教材程式都要用 OS）。
const JACK_PROGRAMS: &[(&str, bool)] = &[
    ("Seven", true),
    ("Average", true),
    ("ComplexArrays", true),
    ("ConvertToBin", true),
    ("Square", true),
    ("Pong", true),
];
/// 無 OS 案例（`../11/jackNoOs/<NAME>/`）：自帶 Sys.init、不呼叫任何 OS 服務，needsOS=false。
const JACK_NOOS_PROGRAMS: &[&str] =
    &["Sum", "Factorial", "Fib", "GCD", "PrimeUnder100"];
/// 虛擬 e2e 入口：`gen/chain`（自帶 Main+Sys，needsOS=false；oracle `RAM[16]=5`）。
const VIRTUAL_PROGRAMS: &[(&str, bool)] = &[("chain", false)];

/// 裁剪版 OS 的 VM 檔名：組 `.asm` 時 OS 排最前（對應 Sys.init bootstrap）。
const OS_VM_NAMES: &[&str] =
    &["Array", "Keyboard", "Math", "Memory", "Output", "Screen", "String", "Sys"];

/// 產物顯示的截斷上限（行數）。
const MAX_OUT_LINES: usize = 400;
/// 錯誤訊息截斷（字元數）。
const MAX_ERR_CHARS: usize = 1200;
/// 單一子程序逾時。
const RUN_TIMEOUT: Duration = Duration::from_secs(300);

static RUN_SEQ: AtomicU64 = AtomicU64::new(0);
static RUN_LOCK: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();

fn eda_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}
fn lesson_root() -> PathBuf {
    eda_root().parent().unwrap().to_path_buf()
}
fn jack_dir() -> PathBuf {
    lesson_root().join("11/jack")
}
fn jack_noos_dir() -> PathBuf {
    lesson_root().join("11/jackNoOs")
}
fn os_src_dir() -> PathBuf {
    eda_root().join("gen/os_src")
}
fn chain_dir() -> PathBuf {
    eda_root().join("gen/chain")
}

fn find_tool(name: &str) -> Option<PathBuf> {
    for rel in [format!("target/release/{name}"), format!("target/debug/{name}")] {
        let p = eda_root().join(rel);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn all_tools() -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let mut v = Vec::new();
    for n in ["jack2vm", "vm2asm", "hackasm", "hackemu"] {
        v.push(find_tool(n).ok_or_else(|| format!("找不到既有 CLI {n}（請先 `cargo build -p {n}`）"))?);
    }
    Ok((v[0].clone(), v[1].clone(), v[2].clone(), v[3].clone()))
}

fn program_dir(name: &str) -> Option<PathBuf> {
    JACK_PROGRAMS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(n, _)| jack_dir().join(n))
        .or_else(|| {
            JACK_NOOS_PROGRAMS
                .iter()
                .find(|n| **n == name)
                .map(|n| jack_noos_dir().join(n))
        })
        .or_else(|| VIRTUAL_PROGRAMS.iter().find(|(n, _)| *n == name).map(|_| chain_dir()))
}

fn program_needs_os(name: &str) -> bool {
    JACK_PROGRAMS
        .iter()
        .find(|(n, _)| *n == name)
        .or_else(|| VIRTUAL_PROGRAMS.iter().find(|(n, _)| *n == name))
        .map(|(_, os)| *os)
        .unwrap_or(false)
}

/// 目錄下所有 `*.jack`（`.jack.md` 副檔名是 md，自動排除），檔名排序。
fn jack_files(dir: &Path) -> Vec<String> {
    let Ok(rd) = std::fs::read_dir(dir) else { return vec![] };
    let mut out: Vec<String> = rd
        .flatten()
        .filter(|e| e.path().extension().map(|x| x == "jack").unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    out.sort();
    out
}

fn copy_jacks(from: &Path, to: &Path) -> Result<(), String> {
    for f in jack_files(from) {
        std::fs::copy(from.join(&f), to.join(&f)).map_err(|e| format!("複製 {f} 失敗：{e}"))?;
    }
    Ok(())
}

/// VM 檔排序：OS 語料（含 Sys）排最前，其餘照檔名。
fn ordered_vm_files(vm_dir: &Path) -> Vec<String> {
    let Ok(rd) = std::fs::read_dir(vm_dir) else { return vec![] };
    let mut os = Vec::new();
    let mut app = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().map(|x| x == "vm").unwrap_or(false) {
            let name = p.file_name().unwrap_or_default().to_string_lossy().into_owned();
            let stem = p.file_stem().unwrap_or_default().to_string_lossy().into_owned();
            if OS_VM_NAMES.iter().any(|&x| x == stem) {
                os.push(name);
            } else {
                app.push(name);
            }
        }
    }
    os.sort();
    app.sort();
    os.extend(app);
    os
}

// ---------- WS 處理 ----------

pub fn list_programs() -> Value {
    let mut programs = Vec::new();
    for (name, needs_os) in JACK_PROGRAMS {
        programs.push(json!({
            "name": name,
            "files": jack_files(&jack_dir().join(name)),
            "needsOS": needs_os,
            "isVirtual": false,
        }));
    }
    for name in JACK_NOOS_PROGRAMS {
        programs.push(json!({
            "name": name,
            "files": jack_files(&jack_noos_dir().join(name)),
            "needsOS": false,
            "noOS": true,
            "isVirtual": false,
        }));
    }
    for (name, needs_os) in VIRTUAL_PROGRAMS {
        programs.push(json!({
            "name": name,
            "files": jack_files(&chain_dir()),
            "needsOS": needs_os,
            "isVirtual": true,
        }));
    }
    json!({"programs": programs})
}

pub fn source_reply(v: &Value, id: u64) -> String {
    let name = v["program"].as_str().unwrap_or("");
    let Some(dir) = program_dir(name) else {
        return reply(&json!({"type":"error","message": format!("未知程式：{name}")}), id);
    };
    let files: Vec<Value> = jack_files(&dir)
        .iter()
        .map(|f| {
            json!({
                "name": f,
                "content": std::fs::read_to_string(dir.join(f)).unwrap_or_default(),
            })
        })
        .collect();
    reply(&json!({"type":"jack-source","program":name,"files":files}), id)
}

pub async fn run_reply(v: &Value, id: u64) -> String {
    let _guard = RUN_LOCK.get_or_init(|| tokio::sync::Mutex::new(())).lock().await;
    let mut m = json!({"type": "jack-result"});
    let result = jack_run_async(v).await;
    if let (Value::Object(out), Value::Object(res)) = (&mut m, &result) {
        for (k, val) in res {
            out.insert(k.clone(), val.clone());
        }
    }
    reply(&m, id)
}

/// spawn 一支 CLI，回完整輸出。
async fn spawn(mut cmd: Command) -> Result<Output, String> {
    let handle = tokio::task::spawn_blocking(move || cmd.output());
    match tokio::time::timeout(RUN_TIMEOUT, handle).await {
        Ok(Ok(Ok(o))) => Ok(o),
        Ok(Ok(Err(e))) => Err(format!("子程序啟動失敗：{e}")),
        Ok(Err(e)) => Err(format!("子程序執行失敗：{e}")),
        Err(_) => Err("子程序逾時（300 秒）".into()),
    }
}

/// 把 spawn 結果拆成 (exit, stderr)。
fn exit_and_err(res: Result<Output, String>) -> (i32, String) {
    match res {
        Ok(o) => (o.status.code().unwrap_or(0), String::from_utf8_lossy(&o.stderr).into_owned()),
        Err(e) => (-1, e),
    }
}

/// 把 spawn 結果拆成 (exit, stderr, stdout)。
fn outcome(res: Result<Output, String>) -> (i32, String, String) {
    match res {
        Ok(o) => (
            o.status.code().unwrap_or(0),
            String::from_utf8_lossy(&o.stderr).into_owned(),
            String::from_utf8_lossy(&o.stdout).into_owned(),
        ),
        Err(e) => (-1, e, String::new()),
    }
}

async fn jack_run_async(v: &Value) -> Value {
    let (jack2vm, vm2asm, hackasm, hackemu) = match all_tools() {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    // 暫存：每次執行獨立 run-<n>
    let tmp = std::env::temp_dir().join(format!("hackeda-v1x-{}", std::process::id()));
    let run = tmp.join(format!("run-{}", RUN_SEQ.fetch_add(1, Ordering::Relaxed)));
    let keep = std::env::var_os("HACKEDA_KEEP_TMP").is_some();
    if let Err(e) = std::fs::create_dir_all(&run) {
        return json!({ "ok": false, "error": format!("建立暫存目錄失敗：{e}") });
    }
    let src = run.join("src");
    let vm_out = run.join("vm");
    let out_asm = run.join("out.asm");
    let out_hack = run.join("out.hack");
    let out_bin = run.join("out.bin");

    // ---- 準備來源 ----
    if let Err(e) = (|| -> Result<(), String> {
        std::fs::create_dir_all(&src).map_err(|e| format!("建立 src 失敗：{e}"))?;
        let custom = v["files"].is_array();
        if !custom {
            let name = v["program"].as_str().ok_or("需要 program 或 files")?;
            let dir = program_dir(name).ok_or_else(|| format!("未知程式：{name}"))?;
            copy_jacks(&dir, &src)?;
            if program_needs_os(name) {
                copy_jacks(&os_src_dir(), &src)?;
            }
        } else {
            let files = v["files"].as_array().unwrap();
            if files.is_empty() {
                return Err("自訂模式需要 files".into());
            }
            let mut has_main = false;
            for f in files {
                let name = f["name"].as_str().ok_or("每檔需要 name")?;
                if !name.ends_with(".jack") {
                    return Err(format!("檔名必須是 .jack：{name}"));
                }
                if name == "Main.jack" {
                    has_main = true;
                }
                std::fs::write(src.join(name), f["content"].as_str().unwrap_or(""))
                    .map_err(|e| format!("寫入 {name} 失敗：{e}"))?;
            }
            if !has_main {
                return Err("自訂程式至少要有一個 Main.jack".into());
            }
            if v["withOS"].as_bool().unwrap_or(false) {
                copy_jacks(&os_src_dir(), &src)?;
            }
        }
        Ok(())
    })() {
        if !keep {
            let _ = std::fs::remove_dir_all(&run);
        }
        return json!({ "ok": false, "error": e });
    }

    let mut stages: Vec<Value> = Vec::new();
    let mut fail: Option<String> = None;

    // (1) jack2vm：Jack → VM
    {
        let mut cmd = Command::new(&jack2vm);
        cmd.arg("-o").arg(&vm_out).arg(&src);
        let res = spawn(cmd).await;
        let (exit, err) = exit_and_err(res);
        let artifacts: Vec<Value> = jack_files(&src)
            .iter()
            .map(|f| {
                json!({
                    "name": f,
                    "content": truncate(&std::fs::read_to_string(src.join(f)).unwrap_or_default()),
                })
            })
            .collect();
        stages.push(json!({
            "name": "jack",
            "cmd": "jack2vm -o vm <src>",
            "exit": exit,
            "stderr": truncate(&err),
            "artifacts": artifacts,
        }));
        if exit != 0 {
            fail = Some(err);
        }
    }

    // (2) vm2asm：VM → ASM
    if fail.is_none() {
        let vm_files = ordered_vm_files(&vm_out);
        let cmd_line = format!("vm2asm out.asm {}", vm_files.join(" "));
        let mut cmd = Command::new(&vm2asm);
        cmd.arg(&out_asm).args(vm_files.iter().map(|f| vm_out.join(f)));
        let res = spawn(cmd).await;
        let (exit, err) = exit_and_err(res);
        let asm_text = std::fs::read_to_string(&out_asm).unwrap_or_default();
        stages.push(json!({
            "name": "vm",
            "cmd": cmd_line,
            "exit": exit,
            "stderr": truncate(&err),
            "artifacts": vm_files.iter()
                .map(|f| json!({"name": f, "content": truncate(&std::fs::read_to_string(vm_out.join(f)).unwrap_or_default())}))
                .collect::<Vec<Value>>(),
        }));
        stages.push(json!({
            "name": "asm",
            "cmd": "vm2asm → out.asm",
            "exit": exit,
            "stderr": truncate(&err),
            "artifacts": [json!({"name": "out.asm", "content": truncate(&asm_text)})],
        }));
        if exit != 0 {
            fail = Some(err);
        }
    }

    // (3) hackasm：ASM → HACK + BIN
    if fail.is_none() {
        let mut c1 = Command::new(&hackasm);
        c1.arg(&out_asm).arg(&out_hack);
        let mut c2 = Command::new(&hackasm);
        c2.arg(&out_asm).arg(&out_bin).arg("--bin");
        let r1 = spawn(c1).await;
        let r2 = spawn(c2).await;
        let (exit, err) = {
            let (e1, s1) = exit_and_err(r1);
            let (e2, s2) = exit_and_err(r2);
            (if e1 == 0 && e2 == 0 { 0 } else { -1 }, format!("{s1}\n{s2}"))
        };
        let hack_text = std::fs::read_to_string(&out_hack).unwrap_or_default();
        stages.push(json!({
            "name": "hack",
            "cmd": "hackasm out.asm out.hack | hackasm out.asm out.bin --bin",
            "exit": exit,
            "stderr": truncate(&err),
            "artifacts": [json!({"name": "out.hack", "content": truncate(&hack_text)})],
        }));
        if exit != 0 {
            fail = Some(err);
        }
    }

    // (4) hackemu：執行（headless）
    let mut m = if fail.is_none() {
        let mut cmd = Command::new(&hackemu);
        cmd.arg("--headless").arg(&out_bin).arg("--max").arg("5000000");
        let res = spawn(cmd).await;
        let (exit, err, trace) = outcome(res);
        let mut m = json!({ "ok": true, "stages": stages });
        if exit != 0 {
            m["ok"] = Value::from(false);
            m["error"] = Value::from(excerpt(&err));
        }
        m["sim"] = json!({
            "summary": tail_lines(&trace, 12),
            "trace": truncate(&trace),
        });
        m
    } else {
        json!({ "ok": false, "stages": stages })
    };
    if let Some(f) = fail {
        m["error"] = Value::from(excerpt(&f));
    }
    if !keep {
        let _ = std::fs::remove_dir_all(&run);
    }
    m
}

/// 產物內容截斷：>400 行時保留前後 200 行並標明總數。
fn truncate(text: &str) -> String {
    let ls: Vec<&str> = text.lines().collect();
    if ls.len() <= MAX_OUT_LINES {
        return text.to_string();
    }
    let head = ls[..200].join("\n");
    let tail = ls[ls.len() - 200..].join("\n");
    format!("{head}\n…（共 {} 行，已截斷）…\n{tail}", ls.len())
}

/// 取最後 n 行（SIM 摘要用）。
fn tail_lines(text: &str, n: usize) -> String {
    let mut ls: Vec<&str> = text.lines().collect();
    if ls.len() > n {
        ls = ls[ls.len() - n..].to_vec();
    }
    ls.join("\n")
}

fn excerpt(s: &str) -> String {
    let t = s.trim();
    let chars: Vec<char> = t.chars().collect();
    if chars.len() <= MAX_ERR_CHARS {
        t.to_string()
    } else {
        let tail: String = chars[chars.len() - MAX_ERR_CHARS..].iter().collect();
        format!("…（結果較長，顯示結尾）\n{tail}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jack_files_ignores_md_and_sorts() {
        let d = std::env::temp_dir().join(format!("jackrs-files-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&d);
        std::fs::write(d.join("z.jack"), "").unwrap();
        std::fs::write(d.join("a.jack"), "").unwrap();
        std::fs::write(d.join("n.jack.md"), "").unwrap();
        let fs = jack_files(&d);
        assert_eq!(fs, vec!["a.jack", "z.jack"]);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn list_programs_has_seven_and_chain() {
        let v = list_programs();
        let ps = v["programs"].as_array().unwrap();
        assert!(ps.len() >= 6, "應列出教材程式");
        let seven = ps.iter().find(|p| p["name"] == "Seven").expect("含 Seven");
        assert!(seven["needsOS"].as_bool().unwrap());
        assert!(seven["files"].as_array().unwrap().contains(&json!("Main.jack")));
        let chain = ps.iter().find(|p| p["name"] == "chain").expect("含 chain");
        assert!(chain["isVirtual"].as_bool().unwrap());
        assert!(!chain["needsOS"].as_bool().unwrap());
        let sum = ps.iter().find(|p| p["name"] == "Sum").expect("含無 OS 案例 Sum");
        assert!(sum["noOS"].as_bool().unwrap());
        assert!(!sum["needsOS"].as_bool().unwrap());
        assert!(sum["files"].as_array().unwrap().contains(&json!("Sys.jack")));
    }

    #[test]
    fn ordered_vm_files_puts_os_first() {
        let d = std::env::temp_dir().join(format!("jackrs-vm-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&d);
        for f in ["Main.vm", "Sys.vm", "Math.vm", "A.vm"] {
            std::fs::write(d.join(f), "foo\n").unwrap();
        }
        let got = ordered_vm_files(&d);
        assert_eq!(got, vec!["Math.vm", "Sys.vm", "A.vm", "Main.vm"]);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn truncate_keeps_head_and_tail() {
        let s: String = (1..=500).map(|i| format!("L{i}\n")).collect();
        let t = truncate(&s);
        assert!(t.contains("L1"));
        assert!(t.contains("L500"));
        assert!(t.contains("共 500 行"));
        let short = truncate("abc");
        assert_eq!(short, "abc");
    }
}