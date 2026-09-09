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
        PartClip::Builtin(Builtin::Nand) => "NandChip".to_string(),
        PartClip::Builtin(Builtin::Dff) => "DffChip".to_string(),
        PartClip::Builtin(Builtin::ARegister) => "RegChip".to_string(),
        PartClip::Builtin(Builtin::DRegister) => "RegChip".to_string(),
        PartClip::Builtin(Builtin::Rom32k) => "Rom32KChip".to_string(),
        PartClip::Builtin(Builtin::Screen) => "ScreenChip".to_string(),
        PartClip::Builtin(Builtin::Keyboard) => "KeyboardChip".to_string(),
    }
}

/// part 是否為有狀態（clocked）：eval 輸出取自狀態、輸入在 tick 才取樣
fn is_seq(e: &Elab, clip: &PartClip) -> bool {
    match clip {
        PartClip::Builtin(b) => b.sequential(),
        PartClip::User(idx) => e.chips[*idx].has_state,
    }
}

/// 產生 part 輸入引數的綁定程式碼（支援多連線 set_bits 組合）
fn emit_inputs(
    code: &mut String,
    chip: &ElabChip,
    params: &[String],
    part: &hackhdl::elab::ElabPart,
    prefix: &str,
    indent: &str,
) -> Vec<String> {
    let mut args = Vec::new();
    for (ini, conns) in part.in_conns.iter().enumerate() {
        let iv = format!("{prefix}{ini}");
        if conns.is_empty() {
            code.push_str(&format!("{indent}let {iv} = 0x0u16;\n"));
        } else if conns.len() == 1 {
            let e = src_expr(chip, &conns[0].src, params);
            code.push_str(&format!("{indent}let {iv} = {e};\n"));
        } else {
            code.push_str(&format!("{indent}let mut {iv} = 0u16;\n"));
            for c in conns {
                let e = src_expr(chip, &c.src, params);
                code.push_str(&format!(
                    "{indent}set_bits(&mut {iv}, {}, {}, {e});\n",
                    c.pin_lo, c.n
                ));
            }
        }
        args.push(iv);
    }
    args
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
    code.push_str("    }\n");
    code.push_str("    pub fn tick(&mut self) {}\n");
    code.push_str("    pub fn tock(&mut self) {}\n");
    code.push_str("}\n");
    code.push_str("#[derive(Default, Clone, Copy)]\npub struct NandOut { pub out: u16 }\n\n");

    // 內建 DFF（ch03 起兩階段：sample 取樣、tock 提交）
    if e.chips.iter().any(|c| {
        c.parts.iter().any(|p| matches!(p.clip, PartClip::Builtin(Builtin::Dff)))
    }) {
        code.push_str("// ---- 內建 DFF（master/slave 兩階段）----\n");
        code.push_str("#[derive(Default, Clone)]\npub struct DffChip { latch: u16, q: u16 }\n");
        code.push_str("impl DffChip {\n");
        code.push_str("    pub fn new() -> Self { DffChip::default() }\n");
        code.push_str("    /// eval：回傳目前狀態 q（輸出與輸入無關）\n");
        code.push_str("    pub fn eval(&self) -> DffOut { DffOut { out: self.q } }\n");
        code.push_str("    /// sample：tick 邊緣取樣輸入到 master latch\n");
        code.push_str("    pub fn sample(&mut self, in_: u16) { self.latch = in_ & 1; }\n");
        code.push_str("    /// tock：master latch 提交到 slave q\n");
        code.push_str("    pub fn tock(&mut self) { self.q = self.latch; }\n");
        code.push_str("    pub fn probe_whole(&self) -> u16 { self.latch }\n");
        code.push_str("    pub fn probe_bit(&self, i: usize) -> u16 { (self.latch >> i) & 1 }\n");
        code.push_str("}\n");
        code.push_str("#[derive(Default, Clone, Copy)]\npub struct DffOut { pub out: u16 }\n\n");
    }

    // 內建 ARegister / DRegister（16-bit，ch05 CPU；sample 取樣、tock 提交）
    code.push_str("// ---- 內建 ARegister / DRegister（16-bit register）----\n");
    code.push_str("#[derive(Default, Clone)]\npub struct RegChip { latch: u16, q: u16 }\n");
    code.push_str("impl RegChip {\n");
    code.push_str("    pub fn new() -> Self { RegChip::default() }\n");
    code.push_str("    pub fn eval(&self, _in_: u16, _load: u16) -> RegOut { RegOut { out: self.q } }\n");
    code.push_str(
        "    pub fn sample(&mut self, in_: u16, load: u16) { if load != 0 { self.latch = in_; } }\n",
    );
    code.push_str("    pub fn tock(&mut self) { self.q = self.latch; }\n");
    code.push_str("    pub fn probe_whole(&self) -> u16 { self.latch }\n");
    code.push_str("    pub fn probe_bit(&self, i: usize) -> u16 { (self.latch >> i) & 1 }\n");
    code.push_str("}\n");
    code.push_str("#[derive(Default, Clone, Copy)]\npub struct RegOut { pub out: u16 }\n\n");

    // 內建 ROM32K（程式記憶體：address→out 組合讀取，程式用 load 指令餵入）
    code.push_str("// ---- 內建 ROM32K（程式記憶體，地址空間 32768）----\n");
    code.push_str("#[derive(Clone)]\npub struct Rom32KChip { mem: Vec<u16> }\n");
    code.push_str("impl Default for Rom32KChip { fn default() -> Self { Rom32KChip { mem: vec![0; 32768] } } }\n");
    code.push_str("impl Rom32KChip {\n");
    code.push_str("    pub fn new() -> Self { Rom32KChip::default() }\n");
    code.push_str("    pub fn eval(&self, address: u16) -> Rom32KOut { Rom32KOut { out: self.mem[address as usize] } }\n");
    code.push_str("    pub fn tick(&mut self) {}\n");
    code.push_str("    pub fn tock(&mut self) {}\n");
    code.push_str("    pub fn load(&mut self, path: &std::path::Path) -> Result<(), String> {\n");
    code.push_str("        let text = std::fs::read_to_string(path).map_err(|e| format!(\"讀取 {}: {{e}}\", path.display()))?;\n");
    code.push_str("        let mut idx = 0usize;\n");
    code.push_str("        for line in text.lines() {\n");
    code.push_str("            let t = line.trim();\n");
    code.push_str("            if t.is_empty() { continue; }\n");
    code.push_str("            let bin = t.split_whitespace().next().unwrap();\n");
    code.push_str("            let v = u16::from_str_radix(bin, 2).map_err(|e| format!(\"第 {} 行不是二進位: {{e}}\", idx + 1))?;\n");
    code.push_str("            if idx >= 32768 { break; }\n");
    code.push_str("            self.mem[idx] = v;\n");
    code.push_str("            idx += 1;\n");
    code.push_str("        }\n");
    code.push_str("        Ok(())\n");
    code.push_str("    }\n");
    code.push_str("}\n");
    code.push_str("#[derive(Default, Clone, Copy)]\npub struct Rom32KOut { pub out: u16 }\n\n");

    // 內建 Screen / Keyboard（ch05 記憶體對映；v0.3 自動化測試不驅動，行為仍實作）
    code.push_str("// ---- 內建 Screen（8192×16 螢幕對映）----\n");
    code.push_str("#[derive(Clone)]\npub struct ScreenChip { mem: Vec<u16> }\n");
    code.push_str("impl Default for ScreenChip { fn default() -> Self { ScreenChip { mem: vec![0; 8192] } } }\n");
    code.push_str("impl ScreenChip {\n");
    code.push_str("    pub fn new() -> Self { ScreenChip::default() }\n");
    code.push_str("    pub fn eval(&self, _in_: u16, _load: u16, address: u16) -> ScreenOut { ScreenOut { out: self.mem[address as usize] } }\n");
    code.push_str("    pub fn sample(&mut self, in_: u16, load: u16, address: u16) { if load != 0 { self.mem[address as usize] = in_; } }\n");
    code.push_str("    pub fn tock(&mut self) {}\n");
    code.push_str("}\n");
    code.push_str("#[derive(Default, Clone, Copy)]\npub struct ScreenOut { pub out: u16 }\n\n");
    code.push_str("// ---- 內建 Keyboard（固定輸出 0）----\n");
    code.push_str("#[derive(Default, Clone)]\npub struct KeyboardChip {}\n");
    code.push_str("impl KeyboardChip {\n");
    code.push_str("    pub fn new() -> Self { KeyboardChip {} }\n");
    code.push_str("    pub fn eval(&self) -> KeyboardOut { KeyboardOut { out: 0 } }\n");
    code.push_str("    pub fn tick(&mut self) {}\n");
    code.push_str("    pub fn tock(&mut self) {}\n");
    code.push_str("}\n");
    code.push_str("#[derive(Default, Clone, Copy)]\npub struct KeyboardOut { pub out: u16 }\n\n");

    for chip in &e.chips {
        gen_chip(e, chip, &mut code)?;
    }
    Ok(code)
}

fn gen_chip(e: &Elab, chip: &ElabChip, code: &mut String) -> Result<(), String> {
    let cn = san(&chip.name);
    let params: Vec<String> = chip.in_pins.iter().map(|p| pin_san(&p.name)).collect();
    let sig = params.iter().map(|p| format!("{p}: u16")).collect::<Vec<_>>().join(", ");

    code.push_str(&format!("// ---- {} ----\n", chip.name));
    code.push_str(&format!("#[derive(Default, Clone)]\npub struct {cn}Chip {{\n"));
    for (slot, part) in chip.parts.iter().enumerate() {
        code.push_str(&format!("    _p{slot}: {},\n", chip_type(e, &part.clip)));
    }
    code.push_str("}\n");

    code.push_str(&format!("impl {cn}Chip {{\n"));
    code.push_str(&format!("    pub fn new() -> Self {{ {cn}Chip::default() }}\n"));

    // ---- eval：獲取關聯性輸出（輸出自狀態，與輸入無關）----
    code.push_str(&format!("    pub fn eval(&mut self, {sig}) -> {cn}Out {{\n"));
    emit_cascade(code, e, chip, &params, "        ");
    code.push_str(&format!("        {cn}Out {{\n"));
    for op in &chip.out_pins {
        let w = format!("w_{}", san(&op.name));
        code.push_str(&format!("            {}: {w},\n", pin_san(&op.name)));
    }
    code.push_str("        }\n    }\n");

    // ---- sample：tick 邊緣，先重算落定的 wire，再遞迴取樣有狀態 children ----
    code.push_str(&format!("    pub fn sample(&mut self, {sig}) {{\n"));
    emit_cascade(code, e, chip, &params, "        ");
    if chip.has_state {
        code.push_str("        // 遞迴取樣有狀態 children\n");
        for &slot in &chip.eval_order {
            let part = &chip.parts[slot];
            if !is_seq(e, &part.clip) {
                continue;
            }
            code.push_str(&format!(
                "        {{ // part {slot}: {} ({})\n",
                part.label, chip_type(e, &part.clip)
            ));
            let args = emit_inputs(code, chip, &params, part, "__c", "            ");
            code.push_str(&format!(
                "            self._p{slot}.sample({});\n",
                args.join(", ")
            ));
            code.push_str("        }\n");
        }
    }
    code.push_str("    }\n");

    // ---- tock：提交所有子晶片狀態 ----
    code.push_str(&format!(
        "    pub fn tock(&mut self) {{\n{}\n    }}\n",
        chip.parts.iter().enumerate().map(|(slot, _)| format!("        self._p{slot}.tock();")).collect::<Vec<_>>().join("\n")
    ));

    // ---- probe：內部暫存器探測（`DRegister[]` 這類），讀取 master latch ----
    let probe_names: Vec<(usize, u16)> = chip
        .parts
        .iter()
        .enumerate()
        .filter_map(|(slot, p)| {
            if matches!(
                p.clip,
                PartClip::Builtin(Builtin::Dff)
                    | PartClip::Builtin(Builtin::ARegister)
                    | PartClip::Builtin(Builtin::DRegister)
            ) {
                Some((slot, 1))
            } else {
                None
            }
        })
        .collect();
    if !probe_names.is_empty() {
        code.push_str("    pub fn probe_whole(&self, name: &str) -> Option<u16> {\n");
        for (slot, _) in &probe_names {
            let label = &chip.parts[*slot].label;
            code.push_str(&format!("        if name == {label:?} {{ return Some(self._p{slot}.probe_whole()); }}\n"));
        }
        code.push_str("        None\n    }\n");
        code.push_str("    pub fn probe_bit(&self, name: &str, i: usize) -> Option<u16> {\n");
        for (slot, _) in &probe_names {
            let label = &chip.parts[*slot].label;
            code.push_str(&format!("        if name == {label:?} {{ return Some(self._p{slot}.probe_bit(i)); }}\n"));
        }
        code.push_str("        None\n    }\n");
    } else {
        code.push_str("    pub fn probe_whole(&self, _name: &str) -> Option<u16> { None }\n");
        code.push_str("    pub fn probe_bit(&self, _name: &str, _i: usize) -> Option<u16> { None }\n");
    }

    // ---- load_program：把路徑轉發給（可直接或遞迴的）ROM32K part ----
    code.push_str("    pub fn load_program(&mut self, path: &std::path::Path) -> Result<(), String> {\n");
    for (slot, part) in chip.parts.iter().enumerate() {
        match &part.clip {
            PartClip::Builtin(Builtin::Rom32k) => {
                code.push_str(&format!(
                    "        if self._p{slot}.load(path).is_ok() {{ return Ok(()); }}\n"
                ));
            }
            PartClip::User(_) => {
                code.push_str(&format!(
                    "        if self._p{slot}.load_program(path).is_ok() {{ return Ok(()); }}\n"
                ));
            }
            _ => {}
        }
    }
    code.push_str("        Err(\"此晶片不含 ROM32K\".to_string())\n    }\n");
    code.push_str("}\n");

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

/// 產生 eval/sample 共用的「先算 wire 再算 part」程式碼
fn emit_cascade(
    code: &mut String,
    e: &Elab,
    chip: &ElabChip,
    params: &[String],
    indent: &str,
) {
    for w in &chip.wires {
        code.push_str(&format!(
            "{indent}let mut w_{} = 0u16;\n",
            san(&w.name)
        ));
    }
    for &slot in &chip.eval_order {
        let part = &chip.parts[slot];
        let ty = chip_type(e, &part.clip);
        code.push_str(&format!("{indent}{{ // part {slot}: {} ({})\n", part.label, ty));
        let inner = format!("{indent}    ");
        if matches!(part.clip, PartClip::Builtin(Builtin::Dff)) {
            code.push_str(&format!("{inner}let __o = self._p{slot}.eval();\n"));
        } else {
            let args = emit_inputs(code, chip, params, part, "__i", &inner);
            code.push_str(&format!(
                "{inner}let __o = self._p{slot}.eval({});\n",
                args.join(", ")
            ));
        }
        emit_out_merges(code, e, chip, part, &inner);
        code.push_str(&format!("{indent}}}\n"));
    }
}

/// 把 part 的輸出合併到 wire
fn emit_out_merges(
    code: &mut String,
    e: &Elab,
    chip: &ElabChip,
    part: &hackhdl::elab::ElabPart,
    indent: &str,
) {
    for (opi, conns) in part.out_wires.iter().enumerate() {
        let child_out = child_out_pin(e, part, opi);
        for ow in conns {
            let w = wname(chip, ow.wire);
            let src = sub(&format!("__o.{child_out}"), ow.pin_lo, ow.n);
            code.push_str(&format!(
                "{indent}set_bits(&mut {w}, {}, {}, {src});\n",
                ow.dest_lo, ow.n
            ));
        }
    }
}

/// 產生被測 top 的 main.rs（TensorFlow 式的測試驅動）
pub fn generate_main(e: &Elab) -> String {
    let top = &e.chips[e.top];
    let cn = san(&top.name);
    // (原始 pin 名, 欄位/參數名)
    let in_pins: Vec<(String, String)> = top.in_pins.iter().map(|p| (p.name.clone(), pin_san(&p.name))).collect();
    let out_pins: Vec<(String, String)> = top.out_pins.iter().map(|p| (p.name.clone(), pin_san(&p.name))).collect();
    let ins: Vec<String> = in_pins.iter().map(|(_, f)| f.clone()).collect();
    let mut s = String::new();
    s.push_str("#![allow(unused_parens, non_snake_case, non_camel_case_types, unused_variables, dead_code)]\n");
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
        if raw == "outM" && out_pins.iter().any(|(r, _)| r == "writeM") {
            s.push_str(&format!(
                "            {raw:?} => {{\n                if self.outs.writeM == 0 {{ return None; }}\n                return Some(self.outs.{f});\n            }}\n"
            ));
        } else {
            s.push_str(&format!("            {raw:?} => return Some(self.outs.{f}),\n"));
        }
    }
    s.push_str("            // 輸入 pin 也可以被 output-list 顯示\n");
    for (raw, f) in &in_pins {
        s.push_str(&format!("            {raw:?} => return Some(self.ins.{f}),\n"));
    }
    s.push_str("            _ => {}\n        }\n");
    s.push_str("        // 內部 probe：`DRegister[]`、`RAM8[3]` 這類 [[label][idx]]\n");
    s.push_str("        let pr = hackrt::tst::PinRef::parse(name);\n");
    s.push_str("        match pr.idx {\n");
    s.push_str("            hackrt::tst::PinIdx::Whole => self.inner.probe_whole(&pr.name),\n");
    s.push_str("            hackrt::tst::PinIdx::Bit(i) => self.inner.probe_bit(&pr.name, i),\n");
    s.push_str("        }\n    }\n");
    s.push_str(&format!(
        "    fn do_eval(&mut self) {{\n        self.outs = self.inner.eval({});\n    }}\n",
        ins.iter().map(|i| format!("self.ins.{i}")).collect::<Vec<_>>().join(", ")
    ));
    let ins_args = ins.iter().map(|i| format!("self.ins.{i}")).collect::<Vec<_>>().join(", ");
    if e.chips[e.top].has_state {
        s.push_str(&format!(
            "    fn tick(&mut self) {{\n        self.inner.sample({ins_args});\n        self.do_eval();\n    }}\n"
        ));
    } else {
        s.push_str("    fn tick(&mut self) {}\n");
    }
    s.push_str(&format!(
        "    fn tock(&mut self) {{\n        self.inner.tock();\n        self.do_eval();\n    }}\n"
    ));
    s.push_str(&format!(
        "    fn load_rom(&mut self, path: &std::path::Path) {{\n        if let Err(e) = self.inner.load_program(path) {{ eprintln!(\"載入 ROM 失敗: {{e}}\"); }}\n    }}\n"
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