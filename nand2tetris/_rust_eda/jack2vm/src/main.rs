//! `jack2vm`：Jack → VM 編譯器 CLI（ch11）。
//!
//! 用法：`jack2vm [-o <outdir>] <file.jack|dir>`
//! - 給目錄時自動收集其中所有 `*.jack`（子目錄不遞迴）。
//! - 預設輸出到輸入所在目錄下的 `output/`（與 C 版一致）；
//!   加 `-o <dir>` 可指定輸出目錄。

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

fn collect_jack(path: &Path) -> Result<Vec<PathBuf>, String> {
    if path.is_dir() {
        let mut set = BTreeSet::new();
        for e in std::fs::read_dir(path).map_err(|e| format!("{}：{e}", path.display()))? {
            let e = e.map_err(|e| e.to_string())?;
            let p = e.path();
            if p.extension().map_or(false, |x| x == "jack") {
                set.insert(p);
            }
        }
        Ok(set.into_iter().collect())
    } else {
        if path.extension().map_or(false, |x| x == "jack") {
            Ok(vec![path.to_path_buf()])
        } else {
            Err("輸入必須是 .jack 檔或目錄".into())
        }
    }
}

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let mut out_dir: Option<PathBuf> = None;
    let mut path: Option<PathBuf> = None;
    while let Some(a) = args.next() {
        if a == "-o" {
            out_dir = args.next().map(PathBuf::from);
            if out_dir.is_none() {
                eprintln!("-o 後面需要目錄路徑");
                return ExitCode::from(2);
            }
        } else if path.is_none() {
            path = Some(PathBuf::from(a));
        } else {
            eprintln!("用法: jack2vm [-o <outdir>] <file.jack|dir>");
            return ExitCode::from(2);
        }
    }
    let Some(path) = path else {
        eprintln!("用法: jack2vm [-o <outdir>] <file.jack|dir>");
        return ExitCode::from(2);
    };

    let files = match collect_jack(&path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };
    if files.is_empty() {
        eprintln!("找不到任何 .jack 檔案");
        return ExitCode::from(2);
    }

    let base_dir = out_dir.clone().unwrap_or_else(|| {
        if path.is_dir() {
            path.join("output")
        } else {
            path.parent()
                .map(|p| p.join("output"))
                .unwrap_or_else(|| PathBuf::from("output"))
        }
    });
    let _ = std::fs::create_dir_all(&base_dir);

    for f in &files {
        let stem = f.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let out_path = base_dir.join(format!("{stem}.vm"));
        let src = std::fs::read(f).map_err(|e| format!("無法讀取 {}：{e}", f.display()));
        let src = match src {
            Ok(b) => b,
            Err(e) => {
                eprintln!("{e}");
                return ExitCode::from(2);
            }
        };
        let vm = jack2vm::compile_bytes(&src);
        if let Err(e) = std::fs::write(&out_path, vm) {
            eprintln!("無法寫入 {}：{e}", out_path.display());
            return ExitCode::from(2);
        }
        println!("Analyzing {}", f.display());
        println!("  → {}", out_path.display());
    }
    ExitCode::SUCCESS
}