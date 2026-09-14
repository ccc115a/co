// HACK 虛擬機核心（對應 _eda/hackemu::lib，語意與 CPU.hdl 一致）
// - 記憶體映射：RAM[0..16384] 一般、RAM[16384..24576] = SCREEN（512×256）、
//   RAM[24576] = KBD。
// - C-inst 語意：M 寫入用「更新前」的 A、jump 用「更新後」的 A
//   （例 `AM=M-1`、`A=M;JMP`）。
// - 純資料結構，UI 不用碰核心。

export const SCREEN_BASE = 16384;
export const SCREEN_WORDS = 8192;
export const SCREEN_ROWS = 256;
export const SCREEN_COLS = 512;
export const KBD_ADDR = 24576;
export const RAM_WORDS = 32768;

export const KEY_NEWLINE = 128;
export const KEY_BACKSPACE = 129;
export const KEY_LEFT = 130;
export const KEY_UP = 131;
export const KEY_RIGHT = 132;
export const KEY_DOWN = 133;

const alu = (comp, x, y) => {
  switch (comp) {
    case 0b101010: return 0;
    case 0b111111: return 1;
    case 0b111010: return 0xffff; // -1
    case 0b001100: return x; // D
    case 0b110000: return y; // A / M
    case 0b001101: return ~x & 0xffff; // !D
    case 0b110001: return ~y & 0xffff; // !A / !M
    case 0b001111: return (-x) & 0xffff; // -D
    case 0b110011: return (-y) & 0xffff; // -A / -M
    case 0b011111: return (x + 1) & 0xffff; // D+1
    case 0b110111: return (y + 1) & 0xffff; // A+1 / M+1
    case 0b001110: return (x - 1) & 0xffff; // D-1
    case 0b110010: return (y - 1) & 0xffff; // A-1 / M-1
    case 0b000010: return (x + y) & 0xffff; // D+A / D+M
    case 0b010011: return (x - y) & 0xffff; // D-A / D-M
    case 0b000111: return (y - x) & 0xffff; // A-D / M-D
    case 0b000000: return x & y; // D&A / D&M
    case 0b010101: return x | y; // D|A / D|M
    default: return 0;
  }
};

export class Vm {
  constructor() {
    this.rom = new Uint16Array(0);
    this.ram = new Uint16Array(RAM_WORDS);
    this.a = 0;
    this.d = 0;
    this.pc = 0;
    this.cycles = 0;
  }

  loadBin(bytes) {
    if (bytes.length % 2 !== 0) {
      throw new Error(`binary length ${bytes.length} must be even (2 bytes per instruction)`);
    }
    const rom = new Uint16Array(bytes.length / 2);
    for (let i = 0; i < rom.length; i++) rom[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    this.rom = rom;
    this.reset();
    return this;
  }

  loadHack(text) {
    const rom = [];
    text.split('\n').forEach((line, i) => {
      line = line.trim();
      if (line === '') return;
      if (!/^[01]{16}$/.test(line)) {
        throw new Error(`line ${i + 1} is not a 16-bit binary: ${JSON.stringify(line)}`);
      }
      rom.push(parseInt(line, 2));
    });
    this.rom = new Uint16Array(rom);
    this.reset();
    return this;
  }

  reset() {
    this.ram.fill(0);
    this.a = 0;
    this.d = 0;
    this.pc = 0;
    this.cycles = 0;
  }

  /** 執行一條指令；PC 超出 ROM 時靜止（回傳 false） */
  step() {
    const i = this.rom[this.pc];
    if (i === undefined) return false;
    if ((i & 0x8000) === 0) {
      this.a = i & 0x7fff;
      this.pc += 1;
    } else {
      const aBit = ((i >> 12) & 1) === 1;
      const comp = (i >> 6) & 0x3f;
      const dest = (i >> 3) & 0x7;
      const jump = i & 0x7;
      const aOld = this.a;
      const y = aBit ? (this.ram[aOld] ?? 0) : aOld;
      const out = alu(comp, this.d, y);
      const outS = out > 0x7fff ? out - 0x10000 : out;
      if ((dest & 1) !== 0) {
        if (aOld < RAM_WORDS) this.ram[aOld] = out;
      }
      if ((dest & 4) !== 0) this.a = out;
      if ((dest & 2) !== 0) this.d = out;
      const taken = jump === 1 ? outS > 0
        : jump === 2 ? outS === 0
          : jump === 3 ? outS >= 0
            : jump === 4 ? outS < 0
              : jump === 5 ? outS !== 0
                : jump === 6 ? outS <= 0
                  : jump === 7;
      this.pc = taken ? this.a : this.pc + 1;
    }
    this.cycles += 1;
    return true;
  }

  run(n) {
    for (let k = 0; k < n; k++) {
      if (!this.step()) return;
    }
  }

  /** 逐條執行至多 n 條；每步把 (執行前 PC, 指令, 執行後 A) 交給 f，f 回 false 即中止 */
  runUntil(n, f) {
    for (let k = 0; k < n; k++) {
      const pc = this.pc;
      const i = this.rom[pc];
      if (i === undefined) return;
      if (!this.step()) return;
      if (f(pc, i, this.a) === false) return;
    }
  }

  /** 黑=1/白=0；word 的 bit15（MSB）為最左 */
  screenPixel(row, col) {
    if (row >= SCREEN_ROWS || col >= SCREEN_COLS) return false;
    const word = this.ram[SCREEN_BASE + row * 32 + Math.floor(col / 16)];
    return (word & (1 << (15 - (col % 16)))) !== 0;
  }

  screenBitmap() {
    const rows = [];
    for (let r = 0; r < SCREEN_ROWS; r++) {
      const row = new Array(SCREEN_COLS).fill(false);
      for (let c = 0; c < SCREEN_COLS; c++) row[c] = this.screenPixel(r, c);
      rows.push(row);
    }
    return rows;
  }

  setKey(code) {
    this.ram[KBD_ADDR] = code;
  }
}