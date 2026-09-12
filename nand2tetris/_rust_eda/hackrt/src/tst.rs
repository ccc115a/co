//! `.tst` 測試腳本的解析與執行。
//!
//! 支援的子集合（M1）：`load`、`output-file`、`compare-to`、`output-list`、
//! `set`、`eval`、`tick`、`tock`、`output`、`repeat`、`while`、`echo`、`clear-echo`、
//! 以及步驟內的 `<chip> load <file>`（載入 .hack 程式）。
//!
//! 指令用 `,` 或 `;` 分隔；`repeat/while` 的區塊用 `{ }`。
//! `output-list` 可跨多行，以 `;` 結尾。

use crate::fmt::{data_line, header_line, Kind, OutField};
use std::path::Path;

/// 被測 top 一致的抽象介面（由 hdl2rs 產生的程式碼實作）
pub trait TopModel {
    /// 設定輸入腳，找不到名稱請回傳 false
    fn set_input(&mut self, name: &str, val: u16) -> bool;
    /// 讀取輸出腳，未定義（don't care）或不存在的名稱請回傳 None
    fn get_output(&self, name: &str) -> Option<u16>;
    /// combinational eval
    fn do_eval(&mut self);
    fn tick(&mut self) {}
    fn tock(&mut self) {}

    #[allow(unused_variables)]
    fn load_rom(&mut self, path: &Path) {}
}

/// 腳位引用，含 `RAM16K[0]`、`PC[]` 這類內部位元索引用法
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PinIdx {
    /// 整根腳（無括號或 `[]`）
    Whole,
    /// 第 i 個位元（`[i]`）
    Bit(usize),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinRef {
    pub name: String,
    pub idx: PinIdx,
}

impl PinRef {
    /// 還原成腳本中的原始寫法（`RAM16K[0]`、`reset`）
    pub fn raw(&self) -> String {
        match self.idx {
            PinIdx::Whole => self.name.clone(),
            PinIdx::Bit(i) => format!("{}[{}]", self.name, i),
        }
    }
    pub fn parse(s: &str) -> PinRef {
        if let Some(open) = s.find('[') {
            let close = s.find(']').unwrap_or(s.len().saturating_sub(1));
            let inner = s[open + 1..close].trim();
            let idx = if inner.is_empty() {
                PinIdx::Whole
            } else {
                match inner.parse::<usize>() {
                    Ok(i) => PinIdx::Bit(i),
                    Err(_) => PinIdx::Whole,
                }
            };
            PinRef { name: s[..open].to_string(), idx }
        } else {
            PinRef { name: s.to_string(), idx: PinIdx::Whole }
        }
    }
}

/// 一個 `output-list` 欄位
#[derive(Debug, Clone)]
pub struct OutListField {
    pub field: OutField,
    pub pin: PinRef,
}

/// 解析後的測試腳本
#[derive(Debug, Default)]
pub struct Script {
    pub load: Option<String>,
    pub output_file: Option<String>,
    pub compare_to: Option<String>,
    pub output_list: Vec<OutListField>,
    pub rom_load: Option<String>,
    pub steps: Vec<Step>,
}

#[derive(Debug, Clone)]
pub enum Step {
    Set(PinRef, u16),
    /// `<chip> load <file>`：把 .hack 程式載入內部的 ROM32K
    LoadRom(String),
    Eval,
    Tick,
    Tock,
    Output,
    Repeat { n: u64, body: Vec<Step> },
    While { name: String, op: CondOp, val: u16, body: Vec<Step>, limit: u32 },
    Echo(String),
    ClearEcho,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CondOp {
    Ne,
    Eq,
}

/// 執行時錯誤
#[derive(Debug, Clone)]
pub struct RunErr {
    pub line: usize,
    pub msg: String,
}

impl std::fmt::Display for RunErr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "第 {} 行：{}", self.line, self.msg)
    }
}

/// 把 `%B..`、`%X..`、十進位（含負數）解析成 u16
pub fn parse_val(s: &str) -> Option<u16> {
    let t = s.trim();
    if let Some(b) = t.strip_prefix("%B") {
        let v = u64::from_str_radix(b, 2).ok()?;
        return Some((v & 0xFFFF) as u16);
    }
    if let Some(h) = t.strip_prefix("%X") {
        let v = u64::from_str_radix(h, 16).ok()?;
        return Some((v & 0xFFFF) as u16);
    }
    let i: i64 = t.parse().ok()?;
    Some(i as i16 as u16)
}

/// 原始掃描結果：文字區塊以 `;`/`{`/`}` 切開，`{`/`}` 各自成塊
#[derive(Debug, Clone)]
enum Raw {
    Text(String),
    Open,
    Close,
}

/// 把來源切成 Raw 序列。`"..."` 字串會保留原樣（echo 訊息可含 `,;{}`）。
/// 把來源切成 Raw 序列。`"..."` 字串會保留原樣（echo 訊息可含 `,;{}`）。
/// `,`、`;`、`{`、`}` 都是指令分隔符。
fn lex_raw(src: &str) -> Vec<Raw> {
    let mut out: Vec<Raw> = Vec::new();
    let mut buf = String::new();
    let mut in_str = false;
    for c in src.chars() {
        if in_str {
            buf.push(c);
            if c == '"' {
                in_str = false;
            }
            continue;
        }
        match c {
            '"' => {
                buf.push(c);
                in_str = true;
            }
            ',' | ';' | '{' | '}' => {
                let t = buf.trim();
                if !t.is_empty() {
                    out.push(Raw::Text(t.to_string()));
                }
                buf.clear();
                match c {
                    '{' => out.push(Raw::Open),
                    '}' => out.push(Raw::Close),
                    _ => {}
                }
            }
            _ => buf.push(c),
        }
    }
    let t = buf.trim();
    if !t.is_empty() {
        out.push(Raw::Text(t.to_string()));
    }
    out
}

/// 把已切好的 `set a 0` 這種指令文字轉成 Step。
/// 傳入 `block` 給 repeat/while。
fn parse_step_text(cmd: &str, block: Option<Vec<Step>>) -> Result<Option<Step>, String> {
    let cmd = cmd.trim().trim_end_matches(',');
    if cmd.is_empty() {
        return Ok(None);
    }

    if let Some(rest) = cmd.strip_prefix("repeat ") {
        let n: u64 = rest.trim().parse().map_err(|_| format!("repeat 數值錯誤：{rest}"))?;
        let body = block.ok_or("repeat 後面缺少 { ... }")?;
        return Ok(Some(Step::Repeat { n, body }));
    }

    if let Some(rest) = cmd.strip_prefix("while ") {
        let body = block.ok_or("while 後面缺少 { ... }")?;
        let parts: Vec<&str> = rest.split_whitespace().collect();
        if parts.len() != 3 {
            return Err(format!("while 條件格式錯誤：{rest}"));
        }
        let op = match parts[1] {
            "<>" => CondOp::Ne,
            "=" | "==" => CondOp::Eq,
            other => return Err(format!("不支援的 while 運算子: {other}")),
        };
        let val = parse_val(parts[2]).ok_or_else(|| format!("while 值解析失敗：{}", parts[2]))?;
        return Ok(Some(Step::While { name: parts[0].to_string(), op, val, body, limit: 100_000 }));
    }

    // `<chip> load <file>`：ROM32K load Add.hack（把 .hack 載入程式記憶體）
    // 注意不能誤抓 `set load 1` 這種指令：只有指令「第一個 token == chip 名」
    // 且 chip 名不是腳本指令關鍵字時才算 ROM 載入。
    if let Some(sp) = cmd.find(" load ") {
        let prefix = cmd[..sp].trim();
        let first = cmd.split_whitespace().next().unwrap_or("");
        let kw = ["set", "echo", "repeat", "while", "eval", "tick", "tock",
                  "output", "clear-echo", "compare-to", "output-file", "output-list", "load"];
        let file = cmd[sp + " load ".len()..].trim().trim_end_matches(',');
        let chip_ok = !prefix.is_empty()
            && !prefix.contains(char::is_whitespace)
            && prefix == first
            && !kw.contains(&first);
        if chip_ok && !file.is_empty() {
            return Ok(Some(Step::LoadRom(file.to_string())));
        }
    }

    let step = match cmd {
        "eval" => Step::Eval,
        "tick" => Step::Tick,
        "tock" => Step::Tock,
        "output" => Step::Output,
        "clear-echo" => Step::ClearEcho,
        _ => {
            if let Some(rest) = cmd.strip_prefix("set ") {
                let (pin, val) = parse_set(rest)?;
                Step::Set(pin, val)
            } else if cmd.starts_with("echo") {
                let s = cmd.trim_start_matches("echo");
                Step::Echo(s.trim().trim_matches('"').to_string())
            } else {
                return Err(format!("無法辨識的指令：{cmd}"));
            }
        }
    };
    Ok(Some(step))
}

fn parse_set(rest: &str) -> Result<(PinRef, u16), String> {
    let rest = rest.trim();
    let sp = rest
        .find(char::is_whitespace)
        .ok_or_else(|| format!("set 格式錯誤：{rest}"))?;
    let (pinname, valstr) = rest.split_at(sp);
    let val = parse_val(valstr).ok_or_else(|| format!("set 值解析失敗：{valstr}"))?;
    Ok((PinRef::parse(pinname), val))
}

/// 從 `index` 開始解析指令序列。
/// `stop_on_close=true`：遇到 `}` 就停止（用在 repeat/while 區塊內）。
/// 回傳 (steps, 下一個要處理的 index)。
fn parse_seq(raws: &[Raw], index: usize, stop_on_close: bool) -> Result<(Vec<Step>, usize), String> {
    let mut steps = Vec::new();
    let mut i = index;
    while i < raws.len() {
        match &raws[i] {
            Raw::Open => return Err("意外的 {".into()),
            Raw::Close => {
                if stop_on_close {
                    return Ok((steps, i + 1));
                }
                return Err("意外的 }".into());
            }
            Raw::Text(t) => {
                let trimmed = t.trim();
                // repeat/while 的區塊：下一個 Raw 是 {
                if i + 1 < raws.len() && matches!(raws[i + 1], Raw::Open) {
                    if trimmed.starts_with("repeat") || trimmed.starts_with("while") {
                        let (block, next) = parse_seq(&raws, i + 2, true)?;
                        if let Some(step) = parse_step_text(trimmed, Some(block))? {
                            steps.push(step);
                        }
                        i = next;
                        continue;
                    }
                }
                if let Some(step) = parse_step_text(trimmed, None)? {
                    steps.push(step);
                }
                i += 1;
            }
        }
    }
    if stop_on_close {
        Err("區塊沒有配對的 }".into())
    } else {
        Ok((steps, i))
    }
}

/// 解析 `output-list` 的文字內容（不含前綴）
fn parse_output_list_fields(s: &str) -> Result<Vec<OutListField>, String> {
    let mut fields = Vec::new();
    let bytes = s.as_bytes();
    let mut p = 0usize;
    while p < bytes.len() {
        while p < bytes.len() && !(bytes[p].is_ascii_alphanumeric() || bytes[p] == b'_') {
            p += 1;
        }
        if p >= bytes.len() {
            break;
        }
        let start = p;
        while p < bytes.len()
            && (bytes[p].is_ascii_alphanumeric() || bytes[p] == b'_' || bytes[p] == b'[' || bytes[p] == b']')
        {
            p += 1;
        }
        let name = &s[start..p];
        if p >= bytes.len() || bytes[p] != b'%' {
            return Err(format!("output-list 欄位格式錯誤：{name}（缺 %）"));
        }
        p += 1;
        let kind = match bytes[p] {
            b'B' => Kind::Bin,
            b'D' => Kind::Dec,
            b'X' => Kind::Hex,
            b'S' => Kind::Sym,
            other => return Err(format!("output-list 不支援的格式 {other}（{name}）")),
        };
        p += 1;
        let read_num = |p: &mut usize| -> Result<usize, String> {
            let st = *p;
            while *p < bytes.len() && bytes[*p].is_ascii_digit() {
                *p += 1;
            }
            s[st..*p].parse().map_err(|_| "output-list 數字解析失敗".to_string())
        };
        let a = read_num(&mut p)?;
        if p >= bytes.len() || bytes[p] != b'.' {
            return Err(format!("output-list {name} 缺 a.b.c"));
        }
        p += 1;
        let b = read_num(&mut p)?;
        if p >= bytes.len() || bytes[p] != b'.' {
            return Err(format!("output-list {name} 缺 a.b.c"));
        }
        p += 1;
        let c = read_num(&mut p)?;
        if p < bytes.len() && bytes[p] == b',' {
            p += 1;
        }
        let field = OutField { name: name.trim().to_string(), kind, a, b, c };
        fields.push(OutListField { field, pin: PinRef::parse(name) });
    }
    if fields.is_empty() {
        return Err("output-list 沒有欄位".into());
    }
    Ok(fields)
}

/// 移除 `//` 行註解（保留 `"..."` 字串內的字元）
fn strip_comments(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    let mut chars = src.chars().peekable();
    let mut in_str = false;
    while let Some(c) = chars.next() {
        if in_str {
            out.push(c);
            if c == '"' {
                in_str = false;
            }
            continue;
        }
        if c == '"' {
            in_str = true;
            out.push(c);
            continue;
        }
        if c == '/' && chars.peek() == Some(&'/') {
            while let Some(&d) = chars.peek() {
                if d == '\n' {
                    break;
                }
                chars.next();
            }
            continue;
        }
        out.push(c);
    }
    out
}

/// 解析整個腳本
pub fn parse_script(src: &str) -> Result<Script, String> {
    let raws = lex_raw(&strip_comments(src));
    let mut script = Script::default();
    let mut steps = Vec::new();
    let mut i = 0;

    while i < raws.len() {
        match &raws[i] {
            Raw::Close => return Err("意外的 }".into()),
            Raw::Open => return Err("意外的 {".into()),
            Raw::Text(t) => {
                let trimmed = t.trim();
                if trimmed.starts_with("output-list") {
                    let s = trimmed.trim_start_matches("output-list");
                    script.output_list = parse_output_list_fields(s)?;
                    i += 1;
                    continue;
                }
                // 腳本層的 `key value` 指令
                let mut handled = false;
                for kw in ["output-file", "compare-to", "load", "rom-load"] {
                    if trimmed.starts_with(kw) {
                        let value = trimmed[kw.len()..].trim().trim_end_matches(',').to_string();
                        match kw {
                            "output-file" => script.output_file = Some(value),
                            "compare-to" => script.compare_to = Some(value),
                            "load" => {
                                if !value.ends_with(".tst") {
                                    script.load = Some(value);
                                }
                            }
                            "rom-load" => script.rom_load = Some(value),
                            _ => unreachable!(),
                        }
                        handled = true;
                        break;
                    }
                }
                if handled {
                    i += 1;
                    continue;
                }
                if i + 1 < raws.len() && matches!(raws[i + 1], Raw::Open) {
                    // top 層的 repeat/while
                    let (block, next) = parse_seq(&raws, i + 2, true)?;
                    if let Some(step) = parse_step_text(trimmed, Some(block))? {
                        steps.push(step);
                    }
                    i = next;
                    continue;
                }
                let (more, next) = parse_seq(&raws, i, false)?;
                steps.extend(more);
                i = next;
            }
        }
    }
    script.steps = steps;
    Ok(script)
}

/// 執行測試：`.out` 內容寫進 `out`，並依 `output-file`/`compare-to` 產檔與比對。
/// `base_dir`：腳本中所有相對路徑的基準。
pub fn run(
    model: &mut dyn TopModel,
    script: &Script,
    base_dir: &Path,
    out: &mut String,
    verbose: bool,
) -> Result<(), RunErr> {
    if !script.output_list.is_empty() {
        let fields: Vec<OutField> = script.output_list.iter().map(|f| f.field.clone()).collect();
        out.push_str(&header_line(&fields));
        out.push('\n');
    }

    if verbose {
        eprintln!("load {}", script.load.as_deref().unwrap_or("(none)"));
    }
    if let Some(rom) = &script.rom_load {
        model.load_rom(&base_dir.join(rom));
    }

    let mut cycle: u64 = 0;
    let mut half = false;
    run_steps(model, script, &script.steps, base_dir, out, &mut cycle, &mut half, verbose)?;

    if let Some(of) = &script.output_file {
        let out_path = base_dir.join(of);
        if let Some(parent) = out_path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| RunErr { line: 0, msg: format!("建立目錄失敗：{e}") })?;
            }
        }
        std::fs::write(&out_path, out.as_bytes())
            .map_err(|e| RunErr { line: 0, msg: format!("寫入 {out_path:?} 失敗：{e}") })?;
        if let Some(cf) = &script.compare_to {
            let cmp_path = base_dir.join(cf);
            report_compare(&out_path, &cmp_path, verbose)?;
        }
    }
    Ok(())
}

fn run_steps(
    model: &mut dyn TopModel,
    script: &Script,
    steps: &[Step],
    base_dir: &Path,
    out: &mut String,
    cycle: &mut u64,
    half: &mut bool,
    verbose: bool,
) -> Result<(), RunErr> {
    for step in steps {
        match step {
            Step::Set(pin, val) => {
                // 傳完整 raw 名稱（`RAM16K[0]`），由模型的 set_input 拆解
                if !model.set_input(&pin.raw(), *val) {
                    return Err(RunErr {
                        line: 0,
                        msg: format!("set 失敗：找不到輸入腳 {}", pin.raw()),
                    });
                }
            }
            Step::LoadRom(path) => {
                model.load_rom(&base_dir.join(path));
            }
            Step::Eval => model.do_eval(),
            Step::Tick => {
                model.tick();
                *half = true;
            }
            Step::Tock => {
                model.tock();
                *half = false;
                *cycle += 1;
            }
            Step::Output => {
                let time_str = format!("{}{}", cycle, if *half { "+" } else { "" });
                if !script.output_list.is_empty() {
                    let fields: Vec<OutField> =
                        script.output_list.iter().map(|f| f.field.clone()).collect();
                    let line = data_line(&fields, &time_str, |n| model.get_output(n));
                    out.push_str(&line);
                    out.push('\n');
                }
            }
            Step::Repeat { n, body } => {
                for _ in 0..*n {
                    run_steps(model, script, body, base_dir, out, cycle, half, verbose)?;
                }
            }
            Step::While { name, op, val, body, limit } => {
                let mut iters = 0u32;
                loop {
                    let cur = model.get_output(name).unwrap_or(0);
                    let matched = match op {
                        CondOp::Ne => cur != *val,
                        CondOp::Eq => cur == *val,
                    };
                    if !matched {
                        break;
                    }
                    iters += 1;
                    if iters > *limit {
                        return Err(RunErr {
                            line: 0,
                            msg: format!("while {name} 迴圈次數超過上限 {limit}"),
                        });
                    }
                    run_steps(model, script, body, base_dir, out, cycle, half, verbose)?;
                }
            }
            Step::Echo(msg) => {
                if verbose {
                    eprintln!("{msg}");
                }
            }
            Step::ClearEcho => {}
        }
    }
    Ok(())
}

/// 比對 .out 與 .cmp，把結果印到 stdout/stderr
pub fn report_compare(out_path: &Path, cmp_path: &Path, verbose: bool) -> Result<(), RunErr> {
    let out_text = std::fs::read_to_string(out_path)
        .map_err(|e| RunErr { line: 0, msg: format!("讀取 {out_path:?} 失敗：{e}") })?;
    let cmp_text = std::fs::read_to_string(cmp_path)
        .map_err(|e| RunErr { line: 0, msg: format!("讀取 {cmp_path:?} 失敗：{e}") })?;
    let out_lines: Vec<&str> = out_text.lines().collect();
    let cmp_lines: Vec<&str> = cmp_text.lines().collect();

    let mut bad = 0usize;
    let n = out_lines.len().min(cmp_lines.len());
    for i in 0..n {
        if out_lines[i].trim_end() != cmp_lines[i].trim_end() {
            bad += 1;
            if bad <= 5 || verbose {
                eprintln!("  第 {} 行不符：", i + 1);
                eprintln!("    out: {:?}", out_lines[i]);
                eprintln!("    cmp: {:?}", cmp_lines[i]);
            }
        }
    }
    let line_mismatch = out_lines.len() != cmp_lines.len();
    if line_mismatch {
        eprintln!("  行數不符：out={} cmp={}", out_lines.len(), cmp_lines.len());
    }
    if bad == 0 && !line_mismatch {
        println!("PASS {}", cmp_path.display());
        Ok(())
    } else {
        println!("FAIL {}（{} 行不符）", cmp_path.display(), bad.max(1));
        Err(RunErr { line: 0, msg: format!("與 {} 比對失敗", cmp_path.display()) })
    }
}