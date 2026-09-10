//! HACK 虛擬機核心（ch05 之後的工具：讀 `.bin`/`.hack` 並執行）。
//!
//! - 記憶體映射：`RAM[0..16384]` 一般記憶體、`RAM[16384..24576)` 為
//!   `SCREEN`（512×256）、`RAM[24576]` 為 `KBD`。
//! - 指令：A-inst（`0xxxx…`）載入 `A`；C-inst（`111…`）依 comp/dest/jump
//!   運算，與教材 `CPU.hdl` 行為一致（M 寫入用**更新前**的 A、jump 用**更新後**
//!   的 A，例 `AM=M-1` 與 `A=M;JMP`）。
//! - 純標準庫，GUI 只放在 `main.rs`（eframe）。

pub const SCREEN_BASE: usize = 16384;
pub const SCREEN_WORDS: usize = 8192;
pub const SCREEN_ROWS: usize = 256;
pub const SCREEN_COLS: usize = 512;
pub const KBD_ADDR: usize = 24576;
pub const RAM_WORDS: usize = 32768;

pub const KEY_NEWLINE: u16 = 128;
pub const KEY_BACKSPACE: u16 = 129;
pub const KEY_LEFT: u16 = 130;
pub const KEY_UP: u16 = 131;
pub const KEY_RIGHT: u16 = 132;
pub const KEY_DOWN: u16 = 133;
pub const KEY_HOME: u16 = 134;
pub const KEY_END: u16 = 135;
pub const KEY_PAGE_UP: u16 = 136;
pub const KEY_PAGE_DOWN: u16 = 137;
pub const KEY_INSERT: u16 = 138;
pub const KEY_DELETE: u16 = 139;
pub const KEY_ESCAPE: u16 = 140;
pub const KEY_F1: u16 = 141; // F1..F12 → 141..152

/// HACK 整機模擬：一台有 ROM（程式）與 32K RAM 的記憶體電腦。
pub struct Vm {
    pub rom: Vec<u16>,
    pub ram: [u16; RAM_WORDS],
    pub a: u16,
    pub d: u16,
    pub pc: u32,
    pub cycles: u64,
}

impl Default for Vm {
    fn default() -> Self {
        Self::new()
    }
}

impl Vm {
    pub fn new() -> Self {
        Vm {
            rom: Vec::new(),
            ram: [0; RAM_WORDS],
            a: 0,
            d: 0,
            pc: 0,
            cycles: 0,
        }
    }

    /// 從 `.bin`（hackasm `--bin` 輸出的 little-endian u16）載入程式。
    pub fn load_bin(&mut self, bytes: &[u8]) -> Result<(), String> {
        if bytes.len() % 2 != 0 {
            return Err(format!("binary length {} must be even (2 bytes per instruction)", bytes.len()));
        }
        self.rom = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        self.reset();
        Ok(())
    }

    /// 從 `.hack` 文字檔（每行 16 位元 0/1）載入程式。
    pub fn load_hack(&mut self, text: &str) -> Result<(), String> {
        let mut rom = Vec::new();
        for (i, line) in text.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let w = u16::from_str_radix(line, 2)
                .map_err(|_| format!("line {} is not a 16-bit binary: {line:?}", i + 1))?;
            rom.push(w);
        }
        self.rom = rom;
        self.reset();
        Ok(())
    }

    /// 依副檔名自動選擇 `.bin`（二進位）或 `.hack`（文字）。
    pub fn load_file(&mut self, path: &str) -> Result<(), String> {
        let bytes = std::fs::read(path).map_err(|e| format!("cannot read {path}: {e}"))?;
        if path.ends_with(".bin") {
            self.load_bin(&bytes)
        } else if path.ends_with(".hack") {
            let text = String::from_utf8(bytes).map_err(|e| format!("{path} is not UTF-8 text: {e}"))?;
            self.load_hack(&text)
        } else {
            Err(format!("unknown filename (needs .bin or .hack): {path}"))
        }
    }

    /// 清空 RAM 與狀態，PC 歸零（保留 ROM）。
    pub fn reset(&mut self) {
        self.ram = [0; RAM_WORDS];
        self.a = 0;
        self.d = 0;
        self.pc = 0;
        self.cycles = 0;
    }

    /// 執行一條指令；PC 超出 ROM 時靜止（回傳 false）。
    pub fn step(&mut self) -> bool {
        let Some(i) = self.rom.get(self.pc as usize).copied() else {
            return false;
        };
        if i & 0x8000 == 0 {
            // A-instruction：`@x` 載入 A
            self.a = i & 0x7FFF;
            self.pc += 1;
        } else {
            let a_bit = (i >> 12) & 1 == 1;
            let comp = (i >> 6) & 0x3F;
            let dest = (i >> 3) & 0x7;
            let jump = i & 0x7;
            let a_old = self.a;
            let y = if a_bit { self.ram.get(a_old as usize).copied().unwrap_or(0) } else { a_old };
            let out = alu(comp, self.d, y);
            let out_s = out as i16;
            // 與硬體一致：M 的寫入位址用「更新前」的 A（clock edge 取樣舊值），
            // 例：`AM=M-1` 是「A=SP-1；把 (舊) 堆疊頂槽覆寫成垃圾」，下方即彈出槽。
            if dest & 1 != 0 {
                if let Some(cell) = self.ram.get_mut(a_old as usize) {
                    *cell = out;
                }
            }
            if dest & 4 != 0 {
                self.a = out;
            }
            if dest & 2 != 0 {
                self.d = out;
            }
            let jump_taken = match jump {
                1 => out_s > 0,           // JGT
                2 => out_s == 0,          // JEQ
                3 => out_s >= 0,          // JGE
                4 => out_s < 0,           // JLT
                5 => out_s != 0,          // JNE
                6 => out_s <= 0,          // JLE
                7 => true,                // JMP
                _ => false,
            };
            if jump_taken {
                self.pc = self.a as u32; // jump 用「更新後」的 A（例：A=M;JMP）
            } else {
                self.pc += 1;
            }
        }
        self.cycles += 1;
        true
    }

    /// 連續執行 `n` 條指令。
    pub fn run(&mut self, n: u64) {
        for _ in 0..n {
            if !self.step() {
                break;
            }
        }
    }

    /// 逐條執行至多 `n` 條；每步把 **(執行前 PC, 原始指令, 執行後 A)** 交給 `f`，
    /// `f` 回傳 false 即中止。供診斷熱點／死迴圈用。
    pub fn run_until(&mut self, n: u64, mut f: impl FnMut(usize, u16, u16) -> bool) {
        for _ in 0..n {
            let pc = self.pc as usize;
            let i = self.rom.get(pc).copied();
            let proceed = match i {
                Some(i) => {
                    if !self.step() {
                        false
                    } else {
                        f(pc, i, self.a)
                    }
                }
                None => false,
            };
            if !proceed {
                break;
            }
        }
    }

    /// 螢幕 pixel：黑(1)=true、白(0)=false。word 的 **bit15（MSB）為最左**。
    pub fn screen_pixel(&self, row: usize, col: usize) -> bool {
        if row >= SCREEN_ROWS || col >= SCREEN_COLS {
            return false;
        }
        let addr = SCREEN_BASE + row * 32 + col / 16;
        let word = self.ram.get(addr).copied().unwrap_or(0);
        word & (1 << (15 - col % 16)) != 0
    }

    /// 把整塊 SCREEN 轉成 `[height][width]` 的 bool 矩陣（row-major）。
    pub fn screen_bitmap(&self) -> Vec<[bool; SCREEN_COLS]> {
        (0..SCREEN_ROWS)
            .map(|r| {
                let mut row = [false; SCREEN_COLS];
                for c in 0..SCREEN_COLS {
                    row[c] = self.screen_pixel(r, c);
                }
                row
            })
            .collect()
    }

    /// KBD（RAM[24576]）＝目前按住的按鍵碼；沒按則 0。
    pub fn set_key(&mut self, code: u16) {
        self.ram[KBD_ADDR] = code;
    }
}

/// HACK ALU：6-bit comp code → (x=D, y=A|M) 的運算結果（16-bit wrap）。
fn alu(comp: u16, x: u16, y: u16) -> u16 {
    match comp {
        0b101010 => 0, // 0
        0b111111 => 1, // 1
        0b111010 => 0xFFFF, // -1
        0b001100 => x, // D
        0b110000 => y, // A / M
        0b001101 => !x, // !D
        0b110001 => !y, // !A / !M
        0b001111 => (x as i16).wrapping_neg() as u16, // -D
        0b110011 => (y as i16).wrapping_neg() as u16, // -A / -M
        0b011111 => x.wrapping_add(1), // D+1
        0b110111 => y.wrapping_add(1), // A+1 / M+1
        0b001110 => x.wrapping_sub(1), // D-1
        0b110010 => y.wrapping_sub(1), // A-1 / M-1
        0b000010 => x.wrapping_add(y), // D+A / D+M
        0b010011 => x.wrapping_sub(y), // D-A / D-M
        0b000111 => y.wrapping_sub(x), // A-D / M-D
        0b000000 => x & y, // D&A / D&M
        0b010101 => x | y, // D|A / D|M
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hackasm::assemble;

    fn rom(asm: &str) -> Vec<u16> {
        assemble(asm).expect("組譯失敗")
    }

    /// SimpleAdd 概念：RAM[0] = 2 + 3 = 5（hackasm 組譯 → VM 執行）。
    #[test]
    fn simple_add() {
        let mut vm = Vm::new();
        vm.rom = rom("@2\nD=A\n@3\nD=D+A\n@0\nM=D\n@0\n0;JMP\n");
        vm.run(6);
        assert_eq!(vm.ram[0], 5);
        assert_eq!(vm.a, 0, "最後一條 @0 把 A 載成 0");
    }

    #[test]
    fn eq_jump_and_screen() {
        // D==1 時該跳過 M=-1；另一端 D!=1 時要執行到 M=-1
        let branch_true = "@1\nD=A\n@1\nD=D-A\n@9\nD;JEQ\n@0\nM=-1\n@0\n0;JMP\n";
        let mut vm = Vm::new();
        vm.rom = rom(branch_true);
        vm.run(6);
        assert_eq!(vm.ram[0], 0, "eq 成立時不該執行 M=-1");
        assert_eq!(vm.pc, 9);

        let branch_false = "@1\nD=A\n@2\nD=D-A\n@9\nD;JEQ\n@0\nM=-1\n@0\n0;JMP\n";
        let mut vm2 = Vm::new();
        vm2.rom = rom(branch_false);
        vm2.run(8);
        assert_eq!(vm2.ram[0], 0xFFFF, "eq 不成立時該執行 M=-1");

        // 寫 SCREEN[0] = -1 → 只有第一列前 16 個 pixel 黑
        let mut vm3 = Vm::new();
        vm3.rom = rom("@SCREEN\nM=-1\n@0\n0;JMP\n");
        vm3.run(2);
        assert_eq!(vm3.ram[SCREEN_BASE], 0xFFFF);
        assert!(vm3.screen_pixel(0, 0) && vm3.screen_pixel(0, 15));
        assert!(!vm3.screen_pixel(0, 16) && !vm3.screen_pixel(1, 0));

        // pixel 順序：word 的 MSB = 最左
        let mut vm4 = Vm::new();
        vm4.ram[SCREEN_BASE] = 0x8000;
        assert!(vm4.screen_pixel(0, 0) && !vm4.screen_pixel(0, 15));
        vm4.ram[SCREEN_BASE] = 0x0001;
        assert!(!vm4.screen_pixel(0, 0) && vm4.screen_pixel(0, 15));
    }

    #[test]
    fn jump_uses_updated_a() {
        // D=M 把 RAM[5]=3 讀進 D；A=D 讓 A=3；0;JMP 跳到 PC=3（無限迴圈）
        let mut vm = Vm::new();
        vm.ram[5] = 3;
        vm.rom = rom("@5\nD=M\nA=D\n0;JMP\n");
        vm.run(4);
        assert_eq!(vm.pc, 3);
        assert_eq!(vm.a, 3);
    }

    #[test]
    fn load_bin_little_endian() {
        // 由 hackasm 產生 u16 → 序列化為 little-endian bytes → load_bin
        let words = assemble("@2\nD=A\n").unwrap();
        let mut bytes = Vec::new();
        for w in &words {
            bytes.extend_from_slice(&w.to_le_bytes());
        }
        let mut vm = Vm::new();
        vm.load_bin(&bytes).unwrap();
        assert_eq!(vm.rom, words);
        assert!(vm.load_bin(&[0x01]).is_err());
    }

    #[test]
    fn load_hack_text() {
        let mut vm = Vm::new();
        vm.load_hack("0000000000000010\n1110000000010000\n").unwrap();
        assert_eq!(vm.rom, vec![0x0002, 0xE010]);
        assert!(vm.load_hack("not-binary\n").is_err());
    }

    #[test]
    fn run_halts_at_rom_end() {
        let mut vm = Vm::new();
        vm.rom = vec![0x0000]; // @0
        vm.run(100);
        assert_eq!(vm.cycles, 1);
    }
}