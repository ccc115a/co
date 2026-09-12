//! hackserve 的 HDL 模擬（v0.9）：章節語料 + 批次執行（真 hdl2rs 管線）。
//!
//! - `hdl-list`：掃 01/02/03/05 章節的 `.tst`，列出可跑案例（case = tst 檔名、
//!   top = 腳本 `load <X>.hdl` 的晶片名、hasCompare）。
//! - `hdl-source{chapter,case}`：回該案例的 `.hdl`/`.tst`/`.cmp` 全文（前端預覽）。
//! - `hdl-run{chapter,case} | {hdl,tst,cmp?,top?}`：把檔案複製/寫進暫存目錄，
//!   spawn `hdl2rs`（codegen → cargo build → 子程序跑 .tst），回 `.out` 全文 + PASS/FAIL。
//!
//! 章節語料的 `.hdl`/`.cmp`/`.hack` 一律留 repo 唯讀；只把 `.tst`＋相關的
//! `.cmp`/`.hack` 複製到暫存目錄再跑，避免覆寫已 commit 的 `.out`。

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::reply;

/// 有 HDL 測試語料的章節（04 是程式、00 為起手式，都不含 .tst）
const CHAPTERS: &[&str] = &["01", "02", "03", "05"];

/// `_eda/`（hackserve 的 CARGO_MANIFEST_DIR 上一層）
fn eda_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}
/// `nand2tetris/`（章節目錄的父層）
fn lesson_root() -> PathBuf {
    eda_root().parent().unwrap().to_path_buf()
}
fn chapter_dir(chapter: &str) -> PathBuf {
    lesson_root().join(chapter)
}
/// 全章節庫，餵給 hdl2rs 的 `--dir`（03 含 a/b 子目錄，遞迴掃）。
fn lib_dirs() -> Vec<String> {
    CHAPTERS.iter().map(|c| chapter_dir(c).to_string_lossy().into_owned()).collect()
}

fn find_hdl2rs() -> Option<PathBuf> {
    for rel in ["target/release/hdl2rs", "target/debug/hdl2rs"] {
        let p = eda_root().join(rel);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// 確保 hdl2rs 二元檔存在（缺則自動 `cargo build -p hdl2rs`）。
fn ensure_hdl2rs() -> Result<PathBuf, String> {
    if let Some(p) = find_hdl2rs() {
        return Ok(p);
    }
    let st = std::process::Command::new("cargo")
        .args(["build", "-q", "-p", "hdl2rs"])
        .current_dir(eda_root())
        .status()
        .map_err(|e| format!("執行 cargo build hdl2rs 失敗：{e}"))?;
    if !st.success() {
        return Err("自動建置 hdl2rs 失敗（請先自行 cargo build -p hdl2rs）".into());
    }
    find_hdl2rs().ok_or_else(|| "建置完成後仍找不到 hdl2rs 二元檔".into())
}

/// 全域 sequence，暫存目錄名稱用。
static RUN_SEQ: AtomicU64 = AtomicU64::new(0);

/// 序列化所有 hdl-run（避免多 session 同時孵 cargo/build 打架）。
static RUN_LOCK: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();

/// 從腳本取出 `load <Name>.hdl` 的晶片名。
fn top_of(text: &str) -> Option<String> {
    for line in text.lines() {
        let t = line.split("//").next().unwrap_or("").trim();
        let Some(rest) = t.strip_prefix("load ") else { continue };
        let rest = rest.trim_end_matches(',');
        if let Some(stem) = rest.strip_suffix(".hdl") {
            return Some(stem.trim().to_string());
        }
        if !rest.is_empty() && !rest.ends_with(".tst") {
            return Some(rest.to_string());
        }
    }
    None
}

fn directive(text: &str, kw: &str) -> Option<String> {
    for line in text.lines() {
        let t = line.split("//").next().unwrap_or("").trim();
        if let Some(rest) = t.strip_prefix(kw) {
            let f = rest.trim_end_matches(',').trim();
            if !f.is_empty() {
                return Some(f.to_string());
            }
        }
    }
    None
}

fn compare_of(text: &str) -> Option<String> {
    directive(text, "compare-to ")
}
fn output_of(text: &str) -> Option<String> {
    directive(text, "output-file ")
}

/// 腳本中出現的 `.hack` 檔名（`ROM32K load Add.hack`、`rom-load X.hack` 這類）。
fn hack_refs(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut push = |cur: &mut String| {
        if cur.ends_with(".hack") {
            out.push(cur.clone());
        }
        cur.clear();
    };
    for c in text.chars() {
        if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' || c == '/' {
            cur.push(c);
        } else {
            push(&mut cur);
        }
    }
    push(&mut cur);
    out.sort();
    out.dedup();
    out
}

/// 掃 01/02/03/05 下所有 `.tst`，組成功率語料清單。
pub fn list_corpus() -> Value {
    let mut tsts: Vec<PathBuf> = Vec::new();
    for c in CHAPTERS {
        collect_tst_rec(&chapter_dir(c), &mut tsts);
    }
    tsts.sort();
    let mut by_chapter: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for p in tsts {
        let Ok(text) = std::fs::read_to_string(&p) else { continue };
        let case = p.file_stem().unwrap_or_default().to_string_lossy().into_owned();
        let top = top_of(&text).unwrap_or_else(|| case.clone());
        let has_compare = compare_of(&text).is_some();
        let label = p
            .parent()
            .and_then(|d| d.strip_prefix(lesson_root()).ok())
            .map(|r| r.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        by_chapter.entry(label).or_default().push(json!({
            "case": case,
            "top": top,
            "hasCompare": has_compare,
        }));
    }
    let chapters: Vec<Value> = by_chapter
        .into_iter()
        .map(|(name, cases)| json!({"name": name, "cases": cases}))
        .collect();
    json!({"chapters": chapters})
}

fn collect_tst_rec(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if !p.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false) {
                collect_tst_rec(&p, out);
            }
        } else if p.extension().map(|x| x == "tst").unwrap_or(false) {
            out.push(p);
        }
    }
}

/// `hdl-source`：回內建案例的 .hdl/.tst/.cmp 全文（前端預覽）。
pub fn source_reply(v: &Value, id: u64) -> String {
    let chapter = v["chapter"].as_str().unwrap_or("");
    let case = v["case"].as_str().unwrap_or("");
    let dir = chapter_dir(chapter);
    if chapter.is_empty() || case.is_empty() {
        return reply(&json!({"type":"error","message":"hd-source 需要 chapter、case"}), id);
    }
    let tst_path = dir.join(format!("{case}.tst"));
    let (tst, top) = match std::fs::read_to_string(&tst_path) {
        Ok(t) => {
            let top = top_of(&t).unwrap_or_default();
            (t, top)
        }
        Err(e) => {
            return reply(
                &json!({"type":"error","message": format!("讀取 {tst_path:?} 失敗：{e}")}),
                id,
            )
        }
    };
    let hdl = if top.is_empty() {
        String::new()
    } else {
        std::fs::read_to_string(dir.join(format!("{top}.hdl"))).unwrap_or_default()
    };
    let cmp = compare_of(&tst)
        .and_then(|f| std::fs::read_to_string(dir.join(f)).ok())
        .unwrap_or_default();
    reply(
        &json!({
            "type": "hdl-source",
            "chapter": chapter,
            "case": case,
            "top": top,
            "hdl": hdl,
            "tst": tst,
            "cmp": cmp,
        }),
        id,
    )
}

/// 單一 hdl-run 的執行。全域持 lock，避免並發 cargo build。
pub async fn run_reply(v: &Value, id: u64) -> String {
    let _guard = RUN_LOCK.get_or_init(|| tokio::sync::Mutex::new(())).lock().await;
    let result = hdl_run_async(v).await;
    let mut m = json!({ "type": "hdl-result" });
    if let (Value::Object(out), Value::Object(res)) = (&mut m, &result) {
        for (k, val) in res {
            out.insert(k.clone(), val.clone());
        }
    }
    reply(&m, id)
}

async fn hdl_run_async(v: &Value) -> Value {
    let bin = match ensure_hdl2rs() {
        Ok(b) => b,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    // 暫存目錄：每次執行一個獨立的 run-<n>
    let tmp = std::env::temp_dir().join(format!("hackeda-v09-{}", std::process::id()));
    let run = tmp.join(format!("run-{}", RUN_SEQ.fetch_add(1, Ordering::Relaxed)));
    let keep = std::env::var_os("HACKEDA_KEEP_TMP").is_some();
    if let Err(e) = std::fs::create_dir_all(&run) {
        return json!({ "ok": false, "error": format!("建立暫存目錄失敗：{e}") });
    }
    // 準備輸入檔（自訂貼上 or 內建語料）
    let prepped = match prep_inputs(&run, v) {
        Ok(p) => p,
        Err(e) => {
            if !keep {
                let _ = std::fs::remove_dir_all(&run);
            }
            return json!({ "ok": false, "error": e });
        }
    };

    // spawn hdl2rs（真 codegen → cargo build → 子程序跑 .tst）
    let mut cmd = std::process::Command::new(&bin);
    if let Some(d) = &prepped.lib_tmp {
        cmd.arg("--dir").arg(d);
    }
    for d in lib_dirs() {
        cmd.arg("--dir").arg(&d);
    }
    cmd.arg("--test").arg(&prepped.tst);
    cmd.arg("--out").arg(run.join("gen"));
    if v["release"].as_bool().unwrap_or(false) {
        cmd.arg("--release");
    }
    cmd.current_dir(eda_root());

    let handle = tokio::task::spawn_blocking(move || cmd.output());
    let out = match tokio::time::timeout(Duration::from_secs(300), handle).await {
        Ok(Ok(Ok(res))) => res,
        Ok(Ok(Err(e))) => {
            if !keep {
                let _ = std::fs::remove_dir_all(&run);
            }
            return json!({ "ok": false, "error": format!("spawn_blocking 失敗：{e}") });
        }
        Ok(Err(e)) => {
            if !keep {
                let _ = std::fs::remove_dir_all(&run);
            }
            return json!({ "ok": false, "error": format!("子程序執行失敗：{e}") });
        }
        Err(_) => {
            if !keep {
                let _ = std::fs::remove_dir_all(&run);
            }
            return json!({ "ok": false, "error": "hdl2rs 執行逾時（300 秒）" });
        }
    };
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let combined = format!("{stderr}{stdout}");

    // 讀取 .out（在清理前）
    let out_text = std::fs::read_to_string(run.join(&prepped.out_name)).ok();
    if !keep {
        let _ = std::fs::remove_dir_all(&run);
    }

    if out.status.success() {
        let o = out_text.unwrap_or_default();
        json!({"ok": true, "pass": true, "out": o, "lines": o.lines().count()})
    } else if let Some(o) = out_text {
        // 有 .out = 跑完但比對失敗
        json!({"ok": true, "pass": false, "out": o, "lines": o.lines().count(), "error": excerpt(&combined)})
    } else {
        // 沒有 .out = 組譯/詳述/編譯/執行錯誤
        json!({ "ok": false, "error": excerpt(&combined) })
    }
}

/// 執行所需檔案清單
struct Prepped {
    tst: PathBuf,
    /// 自訂貼上時，文稿目錄也要加入 --dir（內建語料則不需要）
    lib_tmp: Option<PathBuf>,
    /// 腳本的 output-file 檔名（執行後讀回）
    out_name: String,
}

fn prep_inputs(run: &Path, v: &Value) -> Result<Prepped, String> {
    // 內建語料只需 chapter+case；其餘一律視為自訂貼上
    let custom = !(v["chapter"].as_str().is_some() && v["case"].as_str().is_some());
    if custom {
        let hdl = v["hdl"].as_str().ok_or("自訂模式需要 hdl")?;
        let tst_src = v["tst"].as_str().ok_or("自訂模式需要 tst")?;
        let cmp = v["cmp"].as_str().filter(|s| !s.trim().is_empty());
        let top = v["top"].as_str().map(String::from).or_else(|| top_of(tst_src))
            .ok_or("找不到 top（給 hdl 的 CHIP 名，或 tst 開頭要有 `load <Name>.hdl`）")?;
        if !top.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(format!("top 名稱含不支援字元：{top}"));
        }

        // compare-to：有提供 cmp 文字就寫檔；腳本沒有一併在「指令前」補上行
        let mut tst_text = tst_src.to_string();
        let ct = compare_of(&tst_text);
        if let Some(t) = cmp {
            let name = ct
                .or_else(|| {
                    tst_text.insert_str(0, &format!("compare-to {top}.cmp,\n"));
                    Some(format!("{top}.cmp"))
                })
                .unwrap();
            let name = Path::new(&name).file_name().unwrap_or_default().to_string_lossy().into_owned();
            std::fs::write(run.join(&name), t).map_err(|e| format!("寫入 .cmp 失敗：{e}"))?;
        }
        // output-file：沒有就補上（也要在指令前），保證可以產生 .out 給前端顯示
        if output_of(&tst_text).is_none() {
            tst_text.insert_str(0, &format!("output-file {top}.out,\n"));
        }
        let out_name = output_of(&tst_text).ok_or("output-file 設定失敗")?;
        let out_name = Path::new(&out_name).file_name().unwrap_or_default().to_string_lossy().into_owned();

        std::fs::write(run.join(format!("{top}.hdl")), hdl)
            .map_err(|e| format!("寫入 .hdl 失敗：{e}"))?;
        std::fs::write(run.join(format!("{top}.tst")), &tst_text)
            .map_err(|e| format!("寫入 .tst 失敗：{e}"))?;
        Ok(Prepped {
            tst: run.join(format!("{top}.tst")),
            lib_tmp: Some(run.to_path_buf()),
            out_name,
        })
    } else {
        let chapter = v["chapter"].as_str().unwrap_or("");
        let case = v["case"].as_str().unwrap_or("");
        if chapter.is_empty() || case.is_empty() {
            return Err("內建模式需要 chapter、case".into());
        }
        let dir = chapter_dir(chapter);
        let src_tst = dir.join(format!("{case}.tst"));
        let text = std::fs::read_to_string(&src_tst)
            .map_err(|e| format!("讀取 {src_tst:?} 失敗：{e}"))?;
        // 複製 .tst
        std::fs::write(run.join(format!("{case}.tst")), &text)
            .map_err(|e| format!("寫入 .tst 失敗：{e}"))?;
        // 複製 compare-to 的 .cmp（repo 唯讀→暫存）
        if let Some(ct) = compare_of(&text) {
            let name = Path::new(&ct).file_name().unwrap_or_default().to_string_lossy().into_owned();
            if let Ok(c) = std::fs::read_to_string(dir.join(ct)) {
                let _ = std::fs::write(run.join(&name), c);
            }
        }
        // 複製腳本引用的 .hack（ROM32K load）到暫存
        let mut dirs: Vec<PathBuf> = vec![dir.clone()];
        dirs.extend(CHAPTERS.iter().map(|c| chapter_dir(c)));
        for h in hack_refs(&text) {
            if let Some(bin) = Path::new(&h).file_name().map(|b| b.to_string_lossy().into_owned()) {
                if let Some(src) = find_in_dirs(&bin, &dirs) {
                    let _ = std::fs::copy(src, run.join(&bin));
                }
            }
        }
        let out_name = output_of(&text)
            .map(|n| Path::new(&n).file_name().unwrap_or_default().to_string_lossy().into_owned())
            .unwrap_or_else(|| format!("{case}.out"));
        Ok(Prepped {
            tst: run.join(format!("{case}.tst")),
            lib_tmp: None,
            out_name,
        })
    }
}

fn find_in_dirs(name: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    for d in dirs {
        let p = d.join(name);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// 從組合輸出取「最後面」的關鍵訊息（cargo 編譯錯誤/比對不符行）。
fn excerpt(s: &str) -> String {
    let t = s.trim();
    if t.is_empty() {
        return "執行失敗（hdl2rs 無輸出；請確認 hdl2rs 已建置）".into();
    }
    let chars: Vec<char> = t.chars().collect();
    if chars.len() <= 800 {
        t.to_string()
    } else {
        let tail: String = chars[chars.len() - 800..].iter().collect();
        format!("…（結果較長，顯示結尾）\n{tail}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directives_parsed() {
        let t = "load ALU.hdl,\noutput-file ALU.out,\ncompare-to ALU.cmp,\nROM32K load Add.hack,";
        assert_eq!(top_of(t).unwrap(), "ALU");
        assert_eq!(compare_of(t).unwrap(), "ALU.cmp");
        assert_eq!(output_of(t).unwrap(), "ALU.out");
        assert_eq!(hack_refs(t), vec!["Add.hack"]);
    }

    #[test]
    fn comments_stripped_in_directives() {
        let t = "// load foo.hdl\nload Bar.hdl,  // 目標晶片\ncompare-to Bar.cmp,;";
        assert_eq!(top_of(t).unwrap(), "Bar");
    }

    #[test]
    fn corpus_lists_chapters_and_alus() {
        let v = list_corpus();
        let chs = v["chapters"].as_array().unwrap();
        assert!(chs.iter().any(|c| c["name"] == "02"));
        let alu = chs
            .iter()
            .find(|c| c["name"] == "02")
            .unwrap()["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|case| case["case"] == "ALU")
            .expect("02 應含 ALU case");
        assert!(alu["hasCompare"].as_bool().unwrap());
    }
}