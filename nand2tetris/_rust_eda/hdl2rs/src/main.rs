//! hdl2rs：把 HackHDL 晶片轉譯成 Rust 並跑官方 .tst 測資。
//!
//! 用法：
//! ```text
//! cargo run -p hdl2rs -- --dir ../01 --dir ../02                          # 跑 01/02 全部 test
//! cargo run -p hdl2rs -- --dir ../01 --dir ../02 --test ../02/ALU.tst     # 只跑 ALU
//! ```

mod gen;

use clap::Parser;
use hackhdl as h;
use hackrt;
use std::path::{Path, PathBuf};

#[derive(Parser, Debug)]
#[command(name = "hdl2rs", about = "HackHDL → Rust 模擬工具（Verilator-like）")]
struct Cli {
    /// top 晶片名稱（預設：從 .tst 的 load 指令讀取）
    #[arg(long)]
    top: Option<String>,

    /// HDL 程式庫目錄（可多次指定）
    #[arg(long = "dir", value_name = "DIR", required = true)]
    dirs: Vec<String>,

    /// 只執行指定的 .tst（完整路徑，可多次指定）；省略則跑程式庫目錄下所有 .tst
    #[arg(long)]
    test: Vec<String>,

    /// 產出目錄
    #[arg(long, default_value = "gen")]
    out: String,

    /// 保留產出的 crate 不清除
    #[arg(long)]
    keep: bool,

    /// 用 --release 建置產出的模擬 crate（大幅加速，長跑測試用）
    #[arg(long)]
    release: bool,
}

fn main() {
    let cli = Cli::parse();

    // 載入 library
    let mut lib = std::collections::HashMap::new();
    for d in &cli.dirs {
        lib = h::merge_libs(lib, match h::load_library(Path::new(d)) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("載入 {d} 失敗：{e}");
                std::process::exit(2);
            }
        });
    }

    let tests: Vec<PathBuf> = if cli.test.is_empty() {
        collect_tests(&cli.dirs)
    } else {
        cli.test.iter().map(PathBuf::from).collect()
    };
    if tests.is_empty() {
        eprintln!("找不到任何 .tst 檔案");
        std::process::exit(2);
    }

    let mut pass = 0;
    let mut fail = 0;
    for t in &tests {
        match run_one(&lib, &cli, t) {
            Ok(true) => {
                pass += 1;
            }
            Ok(false) => {
                fail += 1;
            }
            Err(e) => {
                eprintln!("{t:?}: {e}");
                fail += 1;
            }
        }
    }
    println!("==== 結果：{pass} 通過，{fail} 失敗 ====");
    if fail > 0 {
        std::process::exit(1);
    }
}

fn collect_tests(dirs: &[String]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for d in dirs {
        let mut files = Vec::new();
        collect_tst_r(Path::new(d), &mut files);
        files.sort();
        out.extend(files);
    }
    out
}

fn collect_tst_r(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            if p.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false) {
                continue;
            }
            collect_tst_r(&p, out);
        } else if p.extension().map(|x| x == "tst").unwrap_or(false) {
            out.push(p);
        }
    }
}

/// 執行單一 test：回傳 Ok(true) 代表 PASS
fn run_one(lib: &std::collections::HashMap<String, h::ast::Chip>, cli: &Cli, tst: &Path) -> Result<bool, String> {
    let src = std::fs::read_to_string(tst).map_err(|e| format!("讀取 {:?} 失敗：{e}", tst))?;
    let script = hackrt::parse_script(&src).map_err(|e| format!("腳本解析失敗：{e}"))?;
    let top = match &cli.top {
        Some(t) => t.clone(),
        None => script
            .load
            .as_deref()
            .map(|s| s.trim_end_matches(".hdl").to_string())
            .ok_or_else(|| "找不到 top（沒有 --top，腳本中也沒有 load）".to_string())?,
    };

    let e = h::elab(lib, &top).map_err(|er| format!("詳述 {top} 失敗：{er}"))?;
    let san_top = gen::pin_san(&e.chips[e.top].name);
    let out_dir = Path::new(&cli.out).join(format!("{san_top}_sim"));
    gen::gen_crate(&e, &out_dir)?;

    // 建置產出的 crate
    let mut cargo = std::process::Command::new("cargo");
    cargo.args(["build", "--quiet", "--manifest-path"]).arg(out_dir.join("Cargo.toml"));
    if cli.release {
        cargo.arg("--release");
    }
    let status = cargo.status().map_err(|e| format!("cargo 執行失敗：{e}"))?;
    if !status.success() {
        return Err("產出的 Rust 程式碼編譯失敗".into());
    }

    let bin = out_dir
        .join("target")
        .join(if cli.release { "release" } else { "debug" })
        .join(format!("{san_top}_sim"));
    let status = std::process::Command::new(&bin)
        .arg(tst)
        .status()
        .map_err(|e| format!("執行 {bin:?} 失敗：{e}"))?;
    let ok = status.success();

    if !cli.keep {
        let _ = std::fs::remove_dir_all(&out_dir);
    }
    Ok(ok)
}