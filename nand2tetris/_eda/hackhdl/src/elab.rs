//! 詳述（elaboration）：把 parse 好的晶片圖解析成可 codegen 的 IR。
//!
//! 主要工作：
//! 1. 遞迴解析子晶片（約束為使用者 `.hdl` 或內建晶片）。
//! 2. 建立每個晶片內部的 wire 表與單一驅動者驗證。
//! 3. 依 wire 資料依賴對 parts 做拓樸排序（HackHDL 允許前向參考）。
//! 4. 輸出 codegen 需要的 `Elab` IR。

use std::collections::HashMap;

use crate::ast::{Chip, Expr, Pin, Range};

/// 內建晶片（原始語義，不是手寫 HDL）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Builtin {
    Nand,
    Dff,
    /// ch05 CPU 的 A/D 暫存器（16-bit，含 load）
    ARegister,
    DRegister,
    /// ch05 程式記憶體（載入 .hack）
    Rom32k,
    /// ch05 螢幕記憶體對映（本專案自動化測試不驅動）
    Screen,
    /// ch05 鍵盤對映（本專案自動化測試固定為 0）
    Keyboard,
}

impl Builtin {
    pub fn of(name: &str) -> Option<Builtin> {
        match name {
            "Nand" => Some(Builtin::Nand),
            "DFF" => Some(Builtin::Dff),
            "ARegister" => Some(Builtin::ARegister),
            "DRegister" => Some(Builtin::DRegister),
            "ROM32K" => Some(Builtin::Rom32k),
            "Screen" => Some(Builtin::Screen),
            "Keyboard" => Some(Builtin::Keyboard),
            _ => None,
        }
    }
    pub fn name(&self) -> &'static str {
        match self {
            Builtin::Nand => "Nand",
            Builtin::Dff => "DFF",
            Builtin::ARegister => "ARegister",
            Builtin::DRegister => "DRegister",
            Builtin::Rom32k => "ROM32K",
            Builtin::Screen => "Screen",
            Builtin::Keyboard => "Keyboard",
        }
    }
    pub fn in_out(&self) -> (Vec<Pin>, Vec<Pin>) {
        match self {
            Builtin::Nand => (
                vec![Pin { name: "a".into(), width: 1 }, Pin { name: "b".into(), width: 1 }],
                vec![Pin { name: "out".into(), width: 1 }],
            ),
            Builtin::Dff => (
                vec![Pin { name: "in".into(), width: 1 }],
                vec![Pin { name: "out".into(), width: 1 }],
            ),
            Builtin::ARegister | Builtin::DRegister => (
                vec![
                    Pin { name: "in".into(), width: 16 },
                    Pin { name: "load".into(), width: 1 },
                ],
                vec![Pin { name: "out".into(), width: 16 }],
            ),
            Builtin::Rom32k => (
                vec![Pin { name: "address".into(), width: 15 }],
                vec![Pin { name: "out".into(), width: 16 }],
            ),
            Builtin::Screen => (
                vec![
                    Pin { name: "in".into(), width: 16 },
                    Pin { name: "load".into(), width: 1 },
                    Pin { name: "address".into(), width: 13 },
                ],
                vec![Pin { name: "out".into(), width: 16 }],
            ),
            Builtin::Keyboard => (vec![], vec![Pin { name: "out".into(), width: 16 }]),
        }
    }
    /// 是否為有狀態（clocked）晶片
    pub fn sequential(&self) -> bool {
        matches!(
            self,
            Builtin::Dff | Builtin::ARegister | Builtin::DRegister | Builtin::Screen
        )
    }
}

#[derive(Debug, Clone)]
pub struct ElabPart {
    /// 實例標籤（寫在 HDL 的子晶片名稱）
    pub label: String,
    /// 子晶片是使用者晶片還是內建
    pub clip: PartClip,
    /// 每個輸入 pin 的連線（pin 依序）
    pub in_conns: Vec<Vec<PinConnIr>>,
    /// 每個輸出 pin 的連線目的地（pin 依序）
    pub out_wires: Vec<Vec<OutWireIr>>,
}

#[derive(Debug, Clone)]
pub enum PartClip {
    User(usize),
    Builtin(Builtin),
}

/// 輸入 pin 的一條連線：pin 的 `[pin_lo, pin_lo+n)` 位元由 `src` 驅動
#[derive(Debug, Clone)]
pub struct PinConnIr {
    pub pin_lo: u16,
    pub n: u16,
    pub src: SrcIr,
}

#[derive(Debug, Clone)]
pub enum SrcIr {
    /// 常數（已 mask 到 n 位元）
    Const(u16),
    /// 整條 wire（寬度 == n）
    Wire(usize),
    /// 某條 wire 的切片
    WireSlice { wire: usize, lo: u16, n: u16 },
    /// chip IN pin 的切片
    ChipIn { pin: usize, lo: u16, n: u16 },
}

/// 輸出 pin 的 fan-out：pin 的 `[pin_lo, pin_lo+n)` 位元 → wire 的 `[dest_lo, dest_lo+n)`
#[derive(Debug, Clone, Copy)]
pub struct OutWireIr {
    pub pin_lo: u16,
    pub n: u16,
    pub wire: usize,
    pub dest_lo: u16,
}

/// wire 上的單一驅動者（一條 wire 可被多個 `[dest_lo,n)` 不重疊分割驅動）
#[derive(Debug, Clone, Copy)]
pub struct WireWriter {
    pub part: usize,
    /// child 的輸出 pin 索引
    pub pin: usize,
    pub src_lo: u16,
    pub n: u16,
    pub dest_lo: u16,
}

#[derive(Debug, Clone)]
pub struct Wire {
    pub name: String,
    pub width: u16,
    /// 若這條 wire 是 chip 的 OUT pin，記錄其 pin index
    pub out_pin: Option<usize>,
    /// 驅動它的 part/pin 組合
    pub writers: Vec<WireWriter>,
    /// 讀取它的 part slot 們
    pub readers: Vec<usize>,
}

#[derive(Debug, Clone)]
pub struct ElabChip {
    pub name: String,
    pub in_pins: Vec<Pin>,
    pub out_pins: Vec<Pin>,
    /// parts 以 slot 索引存在
    pub parts: Vec<ElabPart>,
    /// eval 順序（slot 排列）
    pub eval_order: Vec<usize>,
    pub wires: Vec<Wire>,
    /// 是否含 clocked 狀態
    pub has_state: bool,
}

#[derive(Debug, Clone)]
pub struct Elab {
    pub chips: Vec<ElabChip>,
    pub names: HashMap<String, usize>,
    pub top: usize,
}

#[derive(Debug, Clone)]
pub struct ElabError {
    pub msg: String,
}

impl std::fmt::Display for ElabError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.msg)
    }
}
impl std::error::Error for ElabError {}

pub fn mask(n: u16) -> u16 {
    if n >= 16 { 0xFFFF } else { (1u32 << n) as u16 - 1 }
}

/// 遞迴收集 `dir` 下的所有 `.hdl`（含子目錄，Lexical 排序，結果確定）
fn collect_hdl(dir: &std::path::Path) -> Result<Vec<std::path::PathBuf>, ElabError> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| ElabError { msg: format!("無法讀取 {}: {e}", dir.display()) })?
        .collect::<Result<_, _>>()
        .map_err(|e| ElabError { msg: format!("讀取 {}: {e}", dir.display()) })?;
    entries.sort_by_key(|e| e.file_name());
    let mut out = Vec::new();
    for e in entries {
        let p = e.path();
        if p.is_dir() {
            if p.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false) {
                continue;
            }
            out.extend(collect_hdl(&p)?);
        } else if p.extension().map(|x| x == "hdl").unwrap_or(false) {
            out.push(p);
        }
    }
    Ok(out)
}

/// 解析一個目錄（含子目錄）下所有 `.hdl` 成 library
pub fn load_library(dir: &std::path::Path) -> Result<HashMap<String, Chip>, ElabError> {
    let mut lib = HashMap::new();
    for p in collect_hdl(dir)? {
        let name = p.file_stem().unwrap().to_string_lossy().to_string();
        let src = std::fs::read_to_string(&p)
            .map_err(|e| ElabError { msg: format!("讀取 {}: {e}", p.display()) })?;
        let chip = crate::parser::parse_hdl(&src)
            .map_err(|e| ElabError { msg: format!("{}: {e}", p.display()) })?;
        lib.insert(name, chip);
    }
    Ok(lib)
}

struct Resolver<'a> {
    lib: &'a HashMap<String, Chip>,
    chips: Vec<ElabChip>,
    names: HashMap<String, usize>,
    visiting: Vec<String>,
}

/// 結合多個目錄的 library（後面的覆蓋前面的）
pub fn merge_libs(mut a: HashMap<String, Chip>, b: HashMap<String, Chip>) -> HashMap<String, Chip> {
    for (k, v) in b {
        a.insert(k, v);
    }
    a
}

/// 詳述：以 `top` 為入口解析整個晶片圖
pub fn elab(lib: &HashMap<String, Chip>, top: &str) -> Result<Elab, ElabError> {
    let mut r = Resolver { lib, chips: Vec::new(), names: HashMap::new(), visiting: Vec::new() };
    let top_idx = r.resolve(top)?;
    Ok(Elab { chips: r.chips, names: r.names, top: top_idx })
}

impl<'a> Resolver<'a> {
    fn resolve(&mut self, name: &str) -> Result<usize, ElabError> {
        if let Some(i) = self.names.get(name) {
            return Ok(*i);
        }
        if self.visiting.iter().any(|v| v == name) {
            return Err(ElabError {
                msg: format!("晶片參考迴圈：{} -> {}", name, self.visiting[0]),
            });
        }
        let Some(ast) = self.lib.get(name) else {
            return Err(ElabError {
                msg: format!("找不到晶片 `{name}`（沒有對應 .hdl，也不是內建晶片）"),
            });
        };
        self.visiting.push(name.to_string());
        let chip = self.elab_chip(ast)?;
        self.visiting.pop();
        let idx = self.chips.len();
        self.chips.push(chip);
        self.names.insert(name.to_string(), idx);
        Ok(idx)
    }

    fn elab_chip(&mut self, ast: &Chip) -> Result<ElabChip, ElabError> {
        let context = format!("晶片 {}", ast.name);
        let in_pins = ast.in_pins.clone();
        let out_pins = ast.out_pins.clone();

        // 子晶片解析（先遞迴解析所有 part，取得 pin 定義）
        #[derive(Clone)]
        struct Child {
            clip: PartClip,
            in_pins: Vec<Pin>,
            out_pins: Vec<Pin>,
        }
        let mut children: Vec<Child> = Vec::new();
        for part in &ast.parts {
            let clip = if let Some(b) = Builtin::of(&part.chip) {
                PartClip::Builtin(b)
            } else {
                PartClip::User(self.resolve(&part.chip)?)
            };
            let (inp, outp) = match &clip {
                PartClip::Builtin(b) => b.in_out(),
                PartClip::User(idx) => {
                    let c = &self.chips[*idx];
                    (c.in_pins.clone(), c.out_pins.clone())
                }
            };
            children.push(Child { clip, in_pins: inp, out_pins: outp });
        }

        let in_idx: HashMap<&str, usize> =
            in_pins.iter().enumerate().map(|(i, p)| (p.name.as_str(), i)).collect();
        let out_idx: HashMap<&str, usize> =
            out_pins.iter().enumerate().map(|(i, p)| (p.name.as_str(), i)).collect();

        // Pass A：收集每個 wire 的所有驅動者（可為多個不重疊的分割寫入）
        let mut wires: Vec<Wire> = Vec::new();
        let mut wire_by_name: HashMap<String, usize> = HashMap::new();
        // 每個 wire 的 (dest_lo, n) 清單，用於檢查重疊與計算寬度
        let mut wire_ranges: HashMap<String, Vec<(u16, u16)>> = HashMap::new();
        for (pi, part) in ast.parts.iter().enumerate() {
            let chip = &children[pi];
            for conn in &part.conns {
                let out_pin_i = chip.out_pins.iter().position(|p| p.name == conn.pin);
                if let Some(opi) = out_pin_i {
                    // 輸出連線：`child.pin[pin_range] = wire[src_range]`
                    let Expr::Sig { name, range } = &conn.src else {
                        return Err(ElabError {
                            msg: format!(
                                "{context}: 晶片輸出 `{}.{}` 不能接到常數",
                                part.chip, conn.pin
                            ),
                        });
                    };
                    let pw = chip.out_pins[opi].width;
                    let n = match conn.pin_range {
                        Range::Whole => pw,
                        Range::Bit(_) => 1,
                        Range::Slice(lo, hi) => hi - lo + 1,
                    };
                    let src_lo = conn.pin_range.lo();
                    let dest_lo = range.lo();
                    // dest 範圍寬度必須 == n
                    let dest_n = match range {
                        Range::Whole => {
                            // 由 wire 的其他驅動者決定，先記 n
                            n
                        }
                        Range::Bit(_) => 1,
                        Range::Slice(lo, hi) => hi - lo + 1,
                    };
                    if dest_n != n {
                        return Err(ElabError {
                            msg: format!(
                                "{context}: 輸出連線 `{}.{}`= 寬度不合（來源 {} 位元 vs 目標 {} 位元）",
                                part.chip, conn.pin, n, dest_n
                            ),
                        });
                    }
                    let ranges = wire_ranges.entry(name.clone()).or_default();
                    for (dlo, dn) in ranges.iter() {
                        // 檢查重疊
                        let a_lo = *dlo;
                        let a_hi = dlo + dn;
                        if dest_lo < a_hi && a_lo < dest_lo + n {
                            return Err(ElabError {
                                msg: format!(
                                    "{context}: wire `{name}` 上的 {dest_lo}..{dest_end} 位元被重複驅動",
                                    dest_end = dest_lo + n
                                ),
                            });
                        }
                    }
                    ranges.push((dest_lo, n));
                    // OUT pin 不可與 IN pin 同名
                    if out_idx.contains_key(name.as_str()) {
                    } else if in_idx.contains_key(name.as_str()) {
                        return Err(ElabError {
                            msg: format!("{context}: wire `{name}` 與 IN pin 同名"),
                        });
                    }
                    let w = if let Some(w) = wire_by_name.get(name) {
                        *w
                    } else {
                        wires.push(Wire {
                            name: name.clone(),
                            width: 0,
                            out_pin: out_idx.get(name.as_str()).copied(),
                            writers: vec![],
                            readers: vec![],
                        });
                        wire_by_name.insert(name.clone(), wires.len() - 1);
                        wires.len() - 1
                    };
                    wires[w].writers.push(WireWriter { part: pi, pin: opi, src_lo, n, dest_lo });
                }
                // 輸入 pin：留到 Pass B 處理（可能用到稍後才建立的 wire）
            }
        }

        // 計算 wire 寬度並驗證 OUT pin 完整覆蓋
        for (name, ranges) in &wire_ranges {
            let w = *wire_by_name.get(name).unwrap();
            let hi = ranges.iter().map(|(lo, n)| lo + n).max().unwrap();
            wires[w].width = hi;
        }
        for w in &mut wires {
            if let Some(opi) = w.out_pin {
                if w.width != out_pins[opi].width {
                    return Err(ElabError {
                        msg: format!(
                            "{context}: OUT pin `{}` 寬度 {}，但只被驅動到 {} 位元",
                            w.name, out_pins[opi].width, w.width
                        ),
                    });
                }
                // 檢查完整覆蓋
                let mut covered = vec![false; w.width as usize];
                for wr in &w.writers {
                    for b in wr.dest_lo..wr.dest_lo + wr.n {
                        covered[b as usize] = true;
                    }
                }
                if covered.iter().any(|c| !c) {
                    return Err(ElabError {
                        msg: format!("{context}: OUT pin `{}` 沒有被完整驅動", w.name),
                    });
                }
            }
        }

        // Pass B：輸入 pin 連線解析 + 輸出 pin fan-out 記錄
        let mut parts: Vec<ElabPart> = Vec::with_capacity(ast.parts.len());
        let mut has_state = false;
        for (pi, part) in ast.parts.iter().enumerate() {
            let chip = &children[pi];
            if let PartClip::Builtin(b) = chip.clip {
                has_state |= b.sequential();
            }
            if let PartClip::User(ui) = chip.clip {
                has_state |= self.chips[ui].has_state;
            }
            let mut in_conns: Vec<Vec<PinConnIr>> =
                (0..chip.in_pins.len()).map(|_| Vec::new()).collect();
            let mut out_wires: Vec<Vec<OutWireIr>> =
                (0..chip.out_pins.len()).map(|_| Vec::new()).collect();
            for conn in &part.conns {
                let out_pin_i = chip.out_pins.iter().position(|p| p.name == conn.pin);
                if let Some(opi) = out_pin_i {
                    let pw = chip.out_pins[opi].width;
                    let Expr::Sig { name, range } = &conn.src else {
                        continue;
                    };
                    let n = match conn.pin_range {
                        Range::Whole => pw,
                        Range::Bit(_) => 1,
                        Range::Slice(lo, hi) => hi - lo + 1,
                    };
                    let pin_lo = conn.pin_range.lo();
                    let dest_lo = range.lo();
                    let w = *wire_by_name.get(name).unwrap();
                    out_wires[opi].push(OutWireIr { pin_lo, n, wire: w, dest_lo });
                    continue;
                }
                // 輸入 pin
                let ini = chip
                    .in_pins
                    .iter()
                    .position(|p| p.name == conn.pin)
                    .ok_or_else(|| ElabError {
                        msg: format!(
                            "{context}: `{}` 沒有 `{}.{}` 這個 pin（child={}）",
                            part.chip, part.chip, conn.pin, chip_name(&chip.clip)
                        ),
                    })?;
                let pw = chip.in_pins[ini].width;
                let n = match conn.pin_range {
                    Range::Whole => pw,
                    Range::Bit(_) => 1,
                    Range::Slice(lo, hi) => hi - lo + 1,
                };
                let pin_lo = conn.pin_range.lo();
                let src = match &conn.src {
                    Expr::Const(b) => {
                        SrcIr::Const(if *b { mask(n) } else { 0 })
                    }
                    Expr::Sig { name, range } => {
                        let rng_bits = match range {
                            Range::Whole => {
                                if let Some(ii) = in_idx.get(name.as_str()) {
                                    in_pins[*ii].width
                                } else if let Some(w) = wire_by_name.get(name) {
                                    wires[*w].width
                                } else {
                                    return Err(ElabError {
                                        msg: format!(
                                            "{context}: `{}` 參考了未定義的訊號 `{name}`",
                                            part.chip
                                        ),
                                    });
                                }
                            }
                            Range::Bit(_) => {
                                let w = wire_by_name.get(name).copied().or_else(|| {
                                    in_idx.get(name.as_str()).map(|_| usize::MAX)
                                });
                                match w {
                                    Some(usize::MAX) => {}
                                    Some(_) => {}
                                    None => {
                                        return Err(ElabError {
                                            msg: format!(
                                                "{context}: 未定義的訊號 `{name}`"
                                            ),
                                        });
                                    }
                                }
                                1
                            }
                            Range::Slice(lo, hi) => hi - lo + 1,
                        };
                        if rng_bits != n {
                            return Err(ElabError {
                                msg: format!(
                                    "{context}: `{}.{}=` 寬度不合（pin {} 位元 vs 訊號 {} 位元）",
                                    part.chip, conn.pin, n, rng_bits
                                ),
                            });
                        }
                        if let Some(w) = wire_by_name.get(name).copied() {
                            wires[w].readers.push(pi);
                            if matches!(range, Range::Whole) {
                                SrcIr::Wire(w)
                            } else {
                                let r = *range;
                                SrcIr::WireSlice { wire: w, lo: r.lo(), n: rng_bits }
                            }
                        } else if let Some(ii) = in_idx.get(name.as_str()) {
                            let r = *range;
                            SrcIr::ChipIn { pin: *ii, lo: r.lo(), n: rng_bits }
                        } else {
                            return Err(ElabError {
                                msg: format!("{context}: 未定義的訊號 `{name}`"),
                            });
                        }
                    }
                };
                in_conns[ini].push(PinConnIr { pin_lo, n, src });
            }
            // 驗證每個輸入 pin 的連線完整覆蓋
            for (ini, conns) in in_conns.iter().enumerate() {
                let pw = chip.in_pins[ini].width;
                let mut covered = vec![false; pw as usize];
                for c in conns {
                    for b in c.pin_lo..c.pin_lo + c.n {
                        if covered[b as usize] {
                            return Err(ElabError {
                                msg: format!(
                                    "{context}: `{}` 的 pin `{}` 位元 {b} 重複驅動",
                                    part.chip, chip.in_pins[ini].name
                                ),
                            });
                        }
                        covered[b as usize] = true;
                    }
                }
                if covered.iter().any(|c| !c) {
                    return Err(ElabError {
                        msg: format!(
                            "{context}: `{}` 的 pin `{}` 連線未完整覆蓋寬度 {}",
                            part.chip, chip.in_pins[ini].name, pw
                        ),
                    });
                }
            }
            parts.push(ElabPart {
                label: part.chip.clone(),
                clip: children[pi].clip.clone(),
                in_conns,
                out_wires,
            });
        }

        // 驗證 chip 每個 OUT pin 都有驅動
        for op in &out_pins {
            match wire_by_name.get(&op.name) {
                Some(w) => {
                    if wires[*w].out_pin.is_none() {
                        return Err(ElabError {
                            msg: format!("{context}: OUT pin `{}` 的 wire 型別錯誤", op.name),
                        });
                    }
                }
                None => {
                    return Err(ElabError {
                        msg: format!("{context}: OUT pin `{}` 沒有被驅動", op.name),
                    });
                }
            }
        }

        // 拓樸排序（前向參考允許）
        let n = parts.len();
        // 每個 part 是否為有狀態（clocked）：其 eval 輸出取自狀態，輸入在 tick 才取樣
        let part_seq: Vec<bool> = parts
            .iter()
            .map(|p| match &p.clip {
                PartClip::Builtin(b) => b.sequential(),
                PartClip::User(idx) => self.chips[*idx].has_state,
            })
            .collect();
        let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut indeg = vec![0usize; n];
        // wire -> reader 的邊（每個 writer 都是讀者依賴的驅動者）
        for w in &wires {
            if w.writers.is_empty() {
                return Err(ElabError {
                    msg: format!("{context}: wire `{}` 沒有驅動者", w.name),
                });
            }
            for &rd in &w.readers {
                // 有狀態 part 的輸入在 tick 時才取樣：eval 順序上不算依賴
                //（它本身就是 feedback 迴圈的中斷點）
                if part_seq[rd] {
                    continue;
                }
                for wr in &w.writers {
                    if rd == wr.part {
                        return Err(ElabError {
                            msg: format!(
                                "{context}: wire `{}` 同時被 part {} 寫入與讀取（組合迴圈）",
                                w.name, rd
                            ),
                        });
                    }
                    adj[wr.part].push(rd);
                    indeg[rd] += 1;
                }
            }
        }
        // Kahn，同層維持原順序
        let mut order: Vec<usize> = Vec::with_capacity(n);
        let mut ready: Vec<usize> = (0..n).filter(|&i| indeg[i] == 0).collect();
        let mut k = 0;
        while k < ready.len() {
            let u = ready[k];
            k += 1;
            order.push(u);
            for &v in &adj[u] {
                indeg[v] -= 1;
                if indeg[v] == 0 {
                    ready.push(v);
                }
            }
        }
        if order.len() != n {
            return Err(ElabError {
                msg: format!("{context}: parts 存在組合迴圈（{}-part 未被排序）", n - order.len()),
            });
        }

        Ok(ElabChip {
            name: ast.name.clone(),
            in_pins,
            out_pins,
            parts,
            eval_order: order,
            wires,
            has_state,
        })
    }
}

fn chip_name(c: &PartClip) -> String {
    match c {
        PartClip::Builtin(b) => b.name().to_string(),
        PartClip::User(_) => "?".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn lib_for(dirs: &[&str]) -> HashMap<String, Chip> {
        let mut lib = HashMap::new();
        for d in dirs {
            let base = Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent().unwrap().parent().unwrap()
                .join(d);
            lib = merge_libs(lib, load_library(&base).unwrap());
        }
        lib
    }

    #[test]
    fn elab_ch01_all() {
        let lib = lib_for(&["01"]);
        for top in [
            "Not", "And", "Or", "Xor", "Mux", "DMux", "Not16", "And16", "Or16",
            "Or8Way", "Mux16", "Mux4Way16", "Mux8Way16", "DMux4Way", "DMux8Way",
        ] {
            let e = elab(&lib, top).unwrap_or_else(|er| panic!("{top}: {er}"));
            let c = &e.chips[e.top];
            for op in &c.out_pins {
                assert!(
                    c.wires.iter().any(|w| w.name == op.name && w.out_pin.is_some()),
                    "{top}: OUT pin {} 沒驅動",
                    op.name
                );
            }
            assert_eq!(c.eval_order.len(), c.parts.len());
        }
    }

    #[test]
    fn elab_ch02_alu() {
        let lib = lib_for(&["01", "02"]);
        let e = elab(&lib, "ALU").unwrap();
        let c = &e.chips[e.top];
        let alu_wires: Vec<_> = c.wires.iter().map(|w| w.name.as_str()).collect();
        assert!(alu_wires.contains(&"x2"), "{alu_wires:?}");
        assert!(alu_wires.contains(&"notzr"));
        // ALU 子晶片圖：ALU, Mux16, Mux, Not16, Not, And16, And, Or, Or8Way,
        // Add16, FullAdder, Xor（HalfAdder 未被任何晶片參考，Nand 是內建）
        let names: Vec<String> = e.chips.iter().map(|c| c.name.clone()).collect();
        for want in [
            "ALU", "Mux16", "Mux", "Not16", "Not", "And16", "And", "Or", "Or8Way",
            "Add16", "FullAdder", "Xor",
        ] {
            assert!(names.contains(&want.to_string()), "缺晶片 {want}: {names:?}");
        }
        // out pin 全部有驅動
        for op in &c.out_pins {
            assert!(c.wires.iter().any(|w| w.name == op.name && w.out_pin.is_some()));
        }
    }

    #[test]
    fn elab_ch03_sequential() {
        let lib = lib_for(&["01", "02", "03"]);
        for top in ["Bit", "Register", "RAM8", "RAM64", "RAM512", "RAM4K", "RAM16K", "PC"] {
            let e = elab(&lib, top).unwrap_or_else(|er| panic!("{top}: {er}"));
            let c = &e.chips[e.top];
            assert!(c.has_state, "{top} 應為有狀態晶片");
            assert_eq!(c.eval_order.len(), c.parts.len(), "{top} 組合迴圈誤報?");
            // feedback（Bit/Register/PC 內部）不得造成拓樸誤判
            for op in &c.out_pins {
                assert!(
                    c.wires.iter().any(|w| w.name == op.name && w.out_pin.is_some()),
                    "{top}: OUT pin {} 沒驅動",
                    op.name
                );
            }
        }
        // 組合晶片仍不誤報 feedback
        let libc = lib_for(&["01", "02"]);
        for top in ["Mux", "Not16", "Add16", "ALU"] {
            let e = elab(&libc, top).unwrap_or_else(|er| panic!("{top}: {er}"));
            assert!(!e.chips[e.top].has_state);
        }
    }
}