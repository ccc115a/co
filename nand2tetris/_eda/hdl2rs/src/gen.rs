//! HackHDL → Rust 程式碼產生器。
//!
//! 一個晶片 → 一個 struct + 一個 eval()：
//! - 局部 wire 是函式區域變數（u16）
//! - 每個 part 依拓樸順序求值，輸出透過 set_bits 合併到目標 wire
//! - 內建 Nand/DFF 直接產生其行為
//! 產出的程式碼自成一個 crate（依賴 hackrt），可被 hackrt::tst 驅動。

use hackhdl::elab::{Builtin, Elab, ElabChip, PartClip, SrcIr};

/// Rust 保留字當過識別名時的替代
fn san(name: &str) -> String {
    let mut s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' })
        .collect();
    if s.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
        s.insert(0, '_');
    }
    s
}

/// pin 名稱（規避 Rust 保留字，例：in → in_）
pub fn pin_san(name: &str) -> String {
    const KEYWORDS: &[&str] = &[
        "in", "loop", "match", "ref", "type", "where", "static", "true", "false", "impl",
        "trait", "self", "super", "crate", "dyn", "use", "as", "fn", "let", "mut", "pub",
        "return", "for", "while", "if", "else", "enum", "struct", "mod", "move", "box",
    ];
    let s = san(name);
    if KEYWORDS.contains(&s.as_str()) {
        format!("{s}_")
    } else {
        s
    }
}

/// 位元擷取運算式：取 expr 的 [lo, lo+width)
fn sub(expr: &str, lo: u16, width: u16) -> String {
    if width >= 16 {
        expr.to_string()
    } else {
        let mask = (1u32 << width) - 1;
        format!("(({expr} >> {lo}) & 0x{mask:x})")
    }
}

/// wire 變數名稱
fn wname(chip: &ElabChip, wire: usize) -> String {
    format!("w_{}", san(&chip.wires[wire].name))
}

fn chip_type(e: &Elab, clip: &PartClip) -> String {
    match clip {
        PartClip::User(idx) => format!("{}Chip", san(&e.chips[*idx].name)),
        PartClip::Builtin(b) => format!("{}Chip", san(b.name())),
    }
}

fn eval_fn(clip: &PartClip) -> &'static str {
    match clip {
        PartClip::Builtin(Builtin::Dff) => "out",
        _ => "eval",
    }
}

/// child 的輸出 pin 名稱（在 `__o` 上取欄位用）
fn child_out_pin(e: &Elab, part: &hackhdl::elab::ElabPart, opi: usize) -> String {
    match &part.clip {
        PartClip::User(idx) => pin_san(&e.chips[*idx].out_pins[opi].name),
        PartClip::Builtin(_) => "out".to_string(),
    }
}

/// 把 SrcIr 轉成目前語境的運算式
fn src_expr(chip: &ElabChip, src: &SrcIr, in_params: &[String]) -> String {
    match src {
        SrcIr::Const(v) => format!("0x{v:x}u16"),
        SrcIr::Wire(w) => wname(chip, *w),
        SrcIr::WireSlice { wire, lo, n } => sub(&wname(chip, *wire), *lo, *n),
        SrcIr::ChipIn { pin, lo, n } => sub(&in_params[*pin], *lo, *n),
    }
}

/// 產生 gen.rs 內容
pub fn generate(e: &Elab) -> Result<String, String> {
    let mut code = String::with_capacity(1 << 16);
    code.push_str("// 由 hdl2rs 自動產生，請勿手動編輯\n");
    code.push_str("#![allow(dead_code)]\n\n");
    code.push_str("// ---- 共用工具 ----\n");
    code.push_str("#[inline]\npub fn set_bits(w: &mut u16, lo: usize, n: usize, val: u16) {\n");
    code.push_str("    let mask = if n >= 16 { 0xFFFFu16 } else { ((1u32 << n) - 1) as u16 };\n");
    code.push_str("    *w = (*w & !(mask << lo)) | ((val & mask) << lo);\n");
    code.push_str("}\n\n");

    // 內建 Nand（ch01 必用）
    code.push_str("// ---- 內建 Nand ----\n");
    code.push_str("#[derive(Default, Clone)]\npub struct NandChip {}\n");
    code.push_str("impl NandChip {\n");
    code.push_str("    pub fn new() -> Self { NandChip {} }\n");
    code.push_str("    pub fn eval(&mut self, a: u16, b: u16) -> NandOut {\n");
    code.push_str("        NandOut { out: if !(a != 0 && b != 0) { 1 } else { 0 } }\n");
    code.push_str("    }\n}\n");
    code.push_str("#[derive(Default, Clone, Copy)]\npub struct NandOut { pub out: u16 }\n\n");

    // 內建 DFF（ch03 起才用；只被引用才產生）
    if e.chips.iter().any(|c| {
        c.parts.iter().any(|p| matches!(p.clip, PartClip::Builtin(Builtin::Dff)))
    }) {
        code.push_str("// ---- 內建 DFF（tick/tock 語義，見 M3）----\n");
        code.push_str("#[derive(Default, Clone)]\npub struct DffChip { latch: u16, q: u16 }\n");
        code.push_str("impl DffChip {\n");
        code.push_str("    pub fn new() -> Self { DffChip::default() }\n");
        code.push_str("    pub fn out(&self, _in_: u16) -> DffOut { DffOut { out: self.q } }\n");
        code.push_str("    pub fn tick(&mut self, in_: u16) { self.latch = in_ & 1; }\n");
        code.push_str("    pub fn tock(&mut self) { self.q = self.latch; }\n");
        code.push_str("}\n");
        code.push_str("#[derive(Default, Clone, Copy)]\npub struct DffOut { pub out: u16 }\n\n");
    }

    for chip in &e.chips {
        gen_chip(e, chip, &mut code)?;
    }
    Ok(code)
}

fn gen_chip(e: &Elab, chip: &ElabChip, code: &mut String) -> Result<(), String> {
    let cn = san(&chip.name);
    let params: Vec<String> = chip.in_pins.iter().map(|p| pin_san(&p.name)).collect();

    code.push_str(&format!("// ---- {} ----\n", chip.name));
    code.push_str(&format!("#[derive(Default, Clone)]\npub struct {cn}Chip {{\n"));
    for (slot, part) in chip.parts.iter().enumerate() {
        code.push_str(&format!("    _p{slot}: {},\n", chip_type(e, &part.clip)));
    }
    code.push_str("}\n");

    code.push_str(&format!("impl {cn}Chip {{\n"));
    code.push_str(&format!("    pub fn new() -> Self {{ {cn}Chip::default() }}\n"));
    code.push_str(&format!(
        "    pub fn eval(&mut self, {}) -> {cn}Out {{\n",
        params.iter().map(|p| format!("{p}: u16")).collect::<Vec<_>>().join(", ")
    ));

    // wire 宣告
    for (wi, w) in chip.wires.iter().enumerate() {
        code.push_str(&format!(
            "        let mut w_{} = 0u16;\n",
            san(&w.name)
        ));
        let _ = wi;
    }

    // parts 依拓樸順序求值
    for &slot in &chip.eval_order {
        let part = &chip.parts[slot];
        let ty = chip_type(e, &part.clip);
        code.push_str(&format!(
            "        {{ // part {slot}: {} ({})\n",
            part.label, ty
        ));
        // 輸入 pin 引數
        for (ini, conns) in part.in_conns.iter().enumerate() {
            if conns.is_empty() {
                code.push_str(&format!("            let __i{ini} = 0x0u16;\n"));
                continue;
            }
            if conns.len() == 1 {
                let c = &conns[0];
                let e = src_expr(chip, &c.src, &params);
                code.push_str(&format!("            let __i{ini} = {e};\n"));
            } else {
                code.push_str(&format!("            let mut __i{ini} = 0u16;\n"));
                for c in conns {
                    let e = src_expr(chip, &c.src, &params);
                    code.push_str(&format!(
                        "            set_bits(&mut __i{ini}, {}, {}, {e});\n",
                        c.pin_lo, c.n
                    ));
                }
            }
        }
        let args: Vec<String> =
            (0..part.in_conns.len()).map(|i| format!("__i{i}")).collect();
        let evalf = eval_fn(&part.clip);
        code.push_str(&format!(
            "            let __o = self._p{slot}.{evalf}({});\n",
            args.join(", ")
        ));
        // 輸出合併到 wire
        for (opi, conns) in part.out_wires.iter().enumerate() {
            let child_out = child_out_pin(e, part, opi);
            for ow in conns {
                let w = wname(chip, ow.wire);
                let src = sub(&format!("__o.{child_out}"), ow.pin_lo, ow.n);
                code.push_str(&format!(
                    "            set_bits(&mut {w}, {}, {}, {src});\n",
                    ow.dest_lo, ow.n
                ));
            }
        }
        code.push_str("        }\n");
    }

    // 回傳 out pins（來自 wire）
    code.push_str(&format!("        {cn}Out {{\n"));
    for op in &chip.out_pins {
        let w = format!("w_{}", san(&op.name));
        code.push_str(&format!("            {}: {w},\n", pin_san(&op.name)));
    }
    code.push_str("        }\n    }\n}\n");

    // Out struct
    code.push_str(&format!(
        "#[derive(Default, Clone, Copy)]\npub struct {cn}Out {{\n"
    ));
    for op in &chip.out_pins {
        code.push_str(&format!("    pub {}: u16,\n", pin_san(&op.name)));
    }
    code.push_str("}\n\n");
    Ok(())
}

/// 產生被測 top 的 main.rs（TensorFlow 式的測試驅動）
pub fn generate_main(e: &Elab) -> String {
    let top = &e.chips[e.top];
    let cn = san(&top.name);
    // (原始 pin 名, 欄位/參數名)
    let in_pins: Vec<(String, String)> = top.in_pins.iter().map(|p| (p.name.clone(), pin_san(&p.name))).collect();
    let out_pins: Vec<(String, String)> = top.out_pins.iter().map(|p| (p.name.clone(), pin_san(&p.name))).collect();
    let ins: Vec<String> = in_pins.iter().map(|(_, f)| f.clone()).collect();
    let outs: Vec<String> = out_pins.iter().map(|(_, f)| f.clone()).collect();
    let mut s = String::new();
    s.push_str("mod gen;\nuse gen::*;\n");
    s.push_str("use hackrt::tst::{parse_script, run, TopModel};\n");
    s.push_str("use std::path::Path;\n\n");
    s.push_str(&format!(
        "#[derive(Default)]\npub struct {cn}Ins {{\n    pub {}\n}}\n",
        ins.iter().map(|i| format!("{i}: u16")).collect::<Vec<_>>().join(",\n    pub ")
    ));
    s.push_str(&format!(
        "#[derive(Default)]\npub struct {cn}Wrap {{\n    ins: {cn}Ins,\n    outs: {cn}Out,\n    inner: {cn}Chip,\n}}\n"
    ));
    s.push_str(&format!("impl {cn}Wrap {{\n"));
    s.push_str(&format!(
        "    fn new() -> Self {{ {cn}Wrap {{ ins: {cn}Ins::default(), outs: {cn}Out::default(), inner: {cn}Chip::new() }} }}\n"
    ));
    s.push_str("}\n");
    s.push_str(&format!("impl TopModel for {cn}Wrap {{\n"));
    s.push_str("    fn set_input(&mut self, name: &str, val: u16) -> bool {\n        match name {\n");
    for (raw, f) in &in_pins {
        s.push_str(&format!("            {raw:?} => self.ins.{f} = val,\n"));
    }
    s.push_str("            _ => return false,\n        }\n        true\n    }\n");
    s.push_str("    fn get_output(&self, name: &str) -> Option<u16> {\n        match name {\n");
    for (raw, f) in &out_pins {
        s.push_str(&format!("            {raw:?} => return Some(self.outs.{f}),\n"));
    }
    s.push_str("            // 輸入 pin 也可以被 output-list 顯示\n");
    for (raw, f) in &in_pins {
        s.push_str(&format!("            {raw:?} => return Some(self.ins.{f}),\n"));
    }
    s.push_str("            _ => None,\n        }\n    }\n");
    s.push_str(&format!(
        "    fn do_eval(&mut self) {{\n        self.outs = self.inner.eval({});\n    }}\n",
        ins.iter().map(|i| format!("self.ins.{i}")).collect::<Vec<_>>().join(", ")
    ));
    s.push_str("}\n\n");
    s.push_str("fn main() {\n");
    s.push_str("    let path = std::env::args().nth(1).expect(\"用法: <sim> <script.tst>\");\n");
    s.push_str("    let base = Path::new(&path);\n");
    s.push_str("    let src = std::fs::read_to_string(base).expect(\"讀取腳本失敗\");\n");
    s.push_str("    let script = parse_script(&src).expect(\"腳本解析失敗\");\n");
    s.push_str(&format!("    let mut model = {cn}Wrap::new();\n"));
    s.push_str("    let mut out = String::new();\n");
    s.push_str("    let base_dir = base.parent().unwrap_or(Path::new(\".\"));\n");
    s.push_str("    match run(&mut model, &script, base_dir, &mut out, true) {\n");
    s.push_str("        Ok(()) => {}\n");
    s.push_str("        Err(e) => { eprintln!(\"{e}\"); std::process::exit(1); }\n");
    s.push_str("    }\n");
    s.push_str("}\n");
    s
}

/// 產出整個 crate 到 `out_dir`
pub fn gen_crate(e: &Elab, out_dir: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(out_dir).map_err(|er| format!("建立 {out_dir:?} 失敗：{er}"))?;
    let src_dir = out_dir.join("src");
    std::fs::create_dir_all(&src_dir).map_err(|er| format!("建立 {src_dir:?} 失敗：{er}"))?;
    let hackrt_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("hackrt");
    let top = san(&e.chips[e.top].name);
    let cargo = format!(
        "[package]\nname = \"{top}_sim\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\nhackrt = {{ path = {:?} }}\n\n[workspace]\n",
        hackrt_path.to_string_lossy()
    );
    std::fs::write(out_dir.join("Cargo.toml"), cargo)
        .map_err(|er| format!("寫入 Cargo.toml 失敗：{er}"))?;
    std::fs::write(src_dir.join("gen.rs"), generate(e)?)
        .map_err(|er| format!("寫入 gen.rs 失敗：{er}"))?;
    std::fs::write(src_dir.join("main.rs"), generate_main(e))
        .map_err(|er| format!("寫入 main.rs 失敗：{er}"))?;
    Ok(())
}