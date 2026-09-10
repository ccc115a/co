//! `hackasm`：HACK 組合語言組譯器 CLI。
//!
//! 用法：`hackasm <in.asm> [out.hack] [--bin]`
//! - 預設輸出 `<in>.hack`（每行 16 位元 0/1 的文字檔）。
//! - 加 `--bin` 額外輸出 `<in>.bin`（16-bit little-endian 的原始二進位）。

use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut in_path: Option<PathBuf> = None;
    let mut out_path: Option<PathBuf> = None;
    let mut want_bin = false;
    for a in &args {
        if a == "--bin" {
            want_bin = true;
        } else if in_path.is_none() {
            in_path = Some(PathBuf::from(a));
        } else if out_path.is_none() {
            out_path = Some(PathBuf::from(a));
        } else {
            eprintln!("用法: hackasm <in.asm> [out.hack] [--bin]");
            return ExitCode::from(2);
        }
    }
    let Some(in_path) = in_path else {
        eprintln!("用法: hackasm <in.asm> [out.hack] [--bin]");
        return ExitCode::from(2);
    };

    let src = match std::fs::read_to_string(&in_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("無法讀取 {}：{e}", in_path.display());
            return ExitCode::from(2);
        }
    };
    let words = match hackasm::assemble(&src) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("組譯失敗 {}：{e}", in_path.display());
            return ExitCode::from(2);
        }
    };

    let out_hack = match &out_path {
        Some(p) if p.extension().map_or(false, |x| x == "hack") => p.clone(),
        Some(p) => p.with_extension("hack"),
        None => in_path.with_extension("hack"),
    };
    if let Err(e) = std::fs::write(&out_hack, hackasm::to_hack_text(&words)) {
        eprintln!("無法寫入 {}：{e}", out_hack.display());
        return ExitCode::from(2);
    }
    println!("{}（{} 條指令）", out_hack.display(), words.len());

    if want_bin {
        let bin = match &out_path {
            Some(p) => p.with_extension("bin"),
            None => in_path.with_extension("bin"),
        };
        let mut bytes = Vec::with_capacity(words.len() * 2);
        for w in &words {
            bytes.extend_from_slice(&w.to_le_bytes());
        }
        if let Err(e) = std::fs::write(&bin, &bytes) {
            eprintln!("無法寫入 {}：{e}", bin.display());
            return ExitCode::from(2);
        }
        println!("{}（{} 位元組）", bin.display(), bytes.len());
    }
    ExitCode::SUCCESS
}