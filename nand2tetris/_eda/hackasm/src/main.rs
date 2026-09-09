//! hackasm CLI：`hackasm <in.asm> <out.hack>`（或 `hackasm <in.asm>` 產生 `<base>.hack`）

use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("用法: hackasm <in.asm> [out.hack]");
        std::process::exit(1);
    }
    let in_path = &args[1];
    let out_path = if args.len() >= 3 {
        args[2].clone()
    } else {
        let base = in_path.strip_suffix(".asm").unwrap_or(in_path);
        format!("{base}.hack")
    };
    let src = match std::fs::read_to_string(in_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("讀取 {in_path} 失敗：{e}");
            std::process::exit(1);
        }
    };
    let words = match hackasm::assemble(&src) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("組譯失敗：{e}");
            std::process::exit(1);
        }
    };
    let text = hackasm::to_hack_text(&words);
    if let Err(e) = std::fs::write(&out_path, text) {
        eprintln!("寫入 {out_path} 失敗：{e}");
        std::process::exit(1);
    }
    eprintln!(
        "{} → {}（{} 行）",
        Path::new(in_path).display(),
        Path::new(&out_path).display(),
        words.len()
    );
}