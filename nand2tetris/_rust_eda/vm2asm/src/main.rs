//! `vm2asm`：VM → HACK 組合語言轉換器 CLI。
//!
//! 用法：`vm2asm <output.asm> <file1.vm> [file2.vm ...]`
//! 輸入也可以給**目錄**（自動收集其中所有 `.vm`）。超過一個 VM 檔時，
//! 會加上 `SP=256` + `call Sys.init 0` 的 bootstrap（與 `vm2asm.c` 一致）。

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

fn collect_vm(path: &Path) -> Result<Vec<PathBuf>, String> {
    if path.is_dir() {
        let mut set = BTreeSet::new();
        for e in std::fs::read_dir(path).map_err(|e| format!("{}：{e}", path.display()))? {
            let e = e.map_err(|e| e.to_string())?;
            if e.path().extension().map_or(false, |x| x == "vm") {
                set.insert(e.path());
            }
        }
        Ok(set.into_iter().collect())
    } else {
        Ok(vec![path.to_path_buf()])
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 2 {
        eprintln!("用法: vm2asm <output.asm> <file1.vm|dir> [file2.vm ...]");
        return ExitCode::from(2);
    }
    let out_path = PathBuf::from(&args[0]);

    let mut inputs: Vec<PathBuf> = Vec::new();
    for a in &args[1..] {
        match collect_vm(Path::new(a)) {
            Ok(v) => inputs.extend(v),
            Err(e) => {
                eprintln!("無法讀取 {a}：{e}");
                return ExitCode::from(2);
            }
        }
    }
    if inputs.is_empty() {
        eprintln!("找不到任何 .vm 檔案");
        return ExitCode::from(2);
    }

    let mut pairs: Vec<(String, String)> = Vec::new();
    for p in &inputs {
        let src = match std::fs::read_to_string(p) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("無法讀取 {}：{e}", p.display());
                return ExitCode::from(2);
            }
        };
        pairs.push((p.display().to_string(), src));
    }

    let bootstrap = pairs.len() > 1;
    let asm = vm2asm::translate(&pairs, bootstrap);
    if let Err(e) = std::fs::write(&out_path, asm) {
        eprintln!("無法寫入 {}：{e}", out_path.display());
        return ExitCode::from(2);
    }
    println!("轉換完成：{}（{} 個 VM 檔{}）", out_path.display(), pairs.len(),
             if bootstrap { "，含 bootstrap" } else { "，不含 bootstrap" });
    ExitCode::SUCCESS
}