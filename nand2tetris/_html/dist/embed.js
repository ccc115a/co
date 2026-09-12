// hackeda JS bundle（tools/embed.js 產生，勿手動編輯）
// fs/path 由頁面在載入 embed.js「前」設定（libraria shim 走 HACKJS_CORPUS 語料對照表）
const fs = globalThis.HACKJS_FS;
const path = globalThis.HACKJS_PATH;

/***** lib/vm/hackemu.js *****/
// HACK 虛擬機核心（對應 _eda/hackemu::lib，語意與 CPU.hdl 一致）
// - 記憶體映射：RAM[0..16384] 一般、RAM[16384..24576] = SCREEN（512×256）、
//   RAM[24576] = KBD。
// - C-inst 語意：M 寫入用「更新前」的 A、jump 用「更新後」的 A
//   （例 `AM=M-1`、`A=M;JMP`）。
// - 純資料結構，UI 不用碰核心。

const SCREEN_BASE = 16384;
const SCREEN_WORDS = 8192;
const SCREEN_ROWS = 256;
const SCREEN_COLS = 512;
const KBD_ADDR = 24576;
const RAM_WORDS = 32768;

const KEY_NEWLINE = 128;
const KEY_BACKSPACE = 129;
const KEY_LEFT = 130;
const KEY_UP = 131;
const KEY_RIGHT = 132;
const KEY_DOWN = 133;

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

class Vm {
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

/***** lib/asm/hackasm.js *****/
// HACK 兩-pass 組譯器（對應 _eda/hackasm，oracle＝06/asm.cpp）
// .asm → { hack: 16 位元字串行, bin: Uint8Array（u16 LE）}
// 行為與 asm.cpp 一致：pass1 蒐集 (LABEL)→位址、pass2 編碼；
// 未定義符號（非內建）當變數從 RAM 16 起配。

const D_MAP = {
  '': '000', M: '001', D: '010', MD: '011',
  A: '100', AM: '101', AD: '110', AMD: '111',
};

const C_MAP = {
  0: '0101010', '1': '0111111', '-1': '0111010',
  D: '0001100', A: '0110000', '!D': '0001101',
  '!A': '0110001', '-D': '0001111', '-A': '0110011',
  'D+1': '0011111', 'A+1': '0110111', 'D-1': '0001110',
  'A-1': '0110010', 'D+A': '0000010', 'D-A': '0010011',
  'A-D': '0000111', 'D&A': '0000000', 'D|A': '0010101',
  M: '1110000', '!M': '1110001', '-M': '1110011',
  'M+1': '1110111', 'M-1': '1110010', 'D+M': '1000010',
  'D-M': '1010011', 'M-D': '1000111', 'D&M': '1000000',
  'D|M': '1010101',
};

const J_MAP = {
  '': '000', JGT: '001', JEQ: '010', JGE: '011',
  JLT: '100', JNE: '101', JLE: '110', JMP: '111',
};

const PREDEFINED = {
  R0: 0, R1: 1, R2: 2, R3: 3, R4: 4, R5: 5, R6: 6, R7: 7,
  R8: 8, R9: 9, R10: 10, R11: 11, R12: 12, R13: 13, R14: 14, R15: 15,
  SCREEN: 16384, KBD: 24576, SP: 0, LCL: 1, ARG: 2, THIS: 3, THAT: 4,
};

/** 去掉前導空白與註解（//…）、row 尾端 \r\n；回傳程式碼部分 */
function parseAsmLine(line) {
  let code = line;
  let i = 0;
  while (i < code.length && (code[i] === ' ' || code[i] === '\t')) i += 1;
  code = code.slice(i);
  let end = code.indexOf('//');
  if (end < 0) end = code.length;
  return code.slice(0, end).trimEnd();
}

function int2bin(a, size) {
  let s = '';
  for (let i = size - 1; i >= 0; i--) s += ((a >> i) & 1) + '';
  return s;
}

/** 把一行《已去掉註解》的程式碼編成 16 位元字串；會用到 symMap/varTop */
function code2binary(code, symMap, varState) {
  if (code[0] === '@') {
    const sym = code.slice(1);
    let address;
    if (/^\d+$/.test(sym)) {
      address = Number(sym);
    } else {
      if (symMap.has(sym)) {
        address = symMap.get(sym);
      } else {
        address = varState.next++;
        symMap.set(sym, address);
      }
    }
    return int2bin(address, 16);
  }
  // C 指令
  let d = '';
  let comp;
  let j = '';
  const eq = code.indexOf('=');
  if (eq >= 0) {
    d = code.slice(0, eq);
    comp = code.slice(eq + 1);
    const semi = comp.indexOf(';');
    if (semi >= 0) {
      j = comp.slice(semi + 1);
      comp = comp.slice(0, semi);
    }
  } else {
    const semi = code.indexOf(';');
    comp = semi >= 0 ? code.slice(0, semi) : code;
    j = semi >= 0 ? code.slice(semi + 1) : '';
  }
  const ccode = C_MAP[comp];
  const dcode = D_MAP[d];
  const jcode = J_MAP[j];
  if (ccode === undefined || dcode === undefined || jcode === undefined) {
    throw new Error(`無法編碼的 C 指令行：'${code}'`);
  }
  return `111${ccode}${dcode}${jcode}`;
}

/** 組譯整段 .asm 文字。回傳 { hack, bin }：hack=字串（每行 16 位元+換行）、bin=Uint8Array */
function assemble(asmText) {
  // pass1：蒐集 labels
  const symMap = new Map(Object.entries(PREDEFINED));
  const lines = [];
  let address = 0;
  for (const raw of asmText.split('\n')) {
    const code = parseAsmLine(raw);
    if (code === '') continue;
    if (code[0] === '(') {
      const label = code.slice(1, code.indexOf(')'));
      if (symMap.has(label)) throw new Error(`重複定義 label：${label}`);
      symMap.set(label, address);
    } else {
      lines.push(code);
      address += 1;
    }
  }
  // pass2：編碼
  const varState = { next: 16 };
  const hackLines = lines.map((code) => code2binary(code, symMap, varState));
  const hack = hackLines.join('\n') + (hackLines.length > 0 ? '\n' : '');
  const bin = new Uint8Array(hackLines.length * 2);
  hackLines.forEach((bits, i) => {
    const v = parseInt(bits, 2) & 0xffff;
    bin[i * 2] = v & 0xff;
    bin[i * 2 + 1] = v >> 8;
  });
  return { hack, bin };
}

/***** lib/asm/vm2asm.js *****/
// VM → HACK 組語翻譯器（oracle＝08/vm2asm.c，單檔 byte 相容）
// 每行 VM 前加 `// ` 註解、多檔才寫 bootstrap、return label 用全域計數器。
// 多檔（bootstrap）模式下，`label/goto/if-goto` 標記加 `函式$` 前綴避免跨檔相撞
// （跟上牌 _eda/vm2asm 一樣；C 版原樣輸出所以組不了多檔 OS）。

let label_count = 0;
let return_count = 0;
let current_file = '';
let scope = false;
let cur_func = '';

function trim(s) {
  let a = 0;
  let b = s.length;
  while (a < b && /\s/.test(s[a])) a += 1;
  while (b > a && /\s/.test(s[b - 1])) b -= 1;
  return s.slice(a, b);
}

function removeComment(line) {
  const i = line.indexOf('//');
  return i >= 0 ? line.slice(0, i) : line;
}

function writeArithmetic(out, command) {
  switch (command) {
    case 'add':
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'M=D+M');
      break;
    case 'sub':
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'M=M-D');
      break;
    case 'neg':
      out.push('@SP', 'A=M-1', 'M=-M');
      break;
    case 'and':
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'M=D&M');
      break;
    case 'or':
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'M=D|M');
      break;
    case 'not':
      out.push('@SP', 'A=M-1', 'M=!M');
      break;
    case 'eq':
    case 'gt':
    case 'lt': {
      const j = command === 'eq' ? 'JEQ' : command === 'gt' ? 'JGT' : 'JLT';
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'D=M-D');
      out.push(`@TRUE_${label_count}`, `D;${j}`);
      out.push('@SP', 'A=M-1', 'M=0');
      out.push(`@END_${label_count}`, '0;JMP');
      out.push(`(TRUE_${label_count})`, '@SP', 'A=M-1', 'M=-1');
      out.push(`(END_${label_count})`);
      label_count += 1;
      break;
    }
    default:
      throw new Error(`不支援的運算指令：${command}`);
  }
}

function writePush(out, segment, index) {
  if (segment === 'constant') {
    out.push(`@${index}`, 'D=A', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'local') {
    out.push(`@${index}`, 'D=A', '@LCL', 'A=D+M', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'argument') {
    out.push(`@${index}`, 'D=A', '@ARG', 'A=D+M', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'this') {
    out.push(`@${index}`, 'D=A', '@THIS', 'A=D+M', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'that') {
    out.push(`@${index}`, 'D=A', '@THAT', 'A=D+M', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'temp') {
    out.push(`@${5 + index}`, 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'pointer') {
    const ptr = index === 0 ? 'THIS' : 'THAT';
    out.push(`@${ptr}`, 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'static') {
    out.push(`@${current_file}.${index}`, 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else {
    throw new Error(`不支援的 segment：${segment}`);
  }
}

function writePop(out, segment, index) {
  if (segment === 'local' || segment === 'argument' || segment === 'this' || segment === 'that') {
    const base = { local: 'LCL', argument: 'ARG', this: 'THIS', that: 'THAT' }[segment];
    out.push(`@${index}`, 'D=A', `@${base}`, 'D=D+M', '@R13', 'M=D');
    out.push('@SP', 'AM=M-1', 'D=M', '@R13', 'A=M', 'M=D');
  } else if (segment === 'temp') {
    out.push('@SP', 'AM=M-1', 'D=M', `@${5 + index}`, 'M=D');
  } else if (segment === 'pointer') {
    const ptr = index === 0 ? 'THIS' : 'THAT';
    out.push('@SP', 'AM=M-1', 'D=M', `@${ptr}`, 'M=D');
  } else if (segment === 'static') {
    out.push('@SP', 'AM=M-1', 'D=M', `@${current_file}.${index}`, 'M=D');
  } else {
    throw new Error(`不支援的 segment：${segment}`);
  }
}

function labelName(arg) {
  return scope && cur_func !== '' ? `${cur_func}$${arg}` : arg;
}

function writeLabel(out, label) {
  out.push(`(${labelName(label)})`);
}

function writeGoto(out, label) {
  out.push(`@${labelName(label)}`, '0;JMP');
}

function writeIfGoto(out, label) {
  out.push('@SP', 'AM=M-1', 'D=M', `@${labelName(label)}`, 'D;JNE');
}

function writeFunction(out, funcName, numLocals) {
  out.push(`(${funcName})`);
  for (let i = 0; i < numLocals; i++) {
    out.push('@SP', 'A=M', 'M=0', '@SP', 'M=M+1');
  }
}

function writeCall(out, funcName, numArgs) {
  const ret = `${funcName}$ret.${return_count++}`;
  out.push(`@${ret}`, 'D=A', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@LCL', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@ARG', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@THIS', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@THAT', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@SP', 'D=M', '@5', 'D=D-A', `@${numArgs}`, 'D=D-A', '@ARG', 'M=D');
  out.push('@SP', 'D=M', '@LCL', 'M=D');
  out.push(`@${funcName}`, '0;JMP');
  out.push(`(${ret})`);
}

function writeReturn(out) {
  out.push('@LCL', 'D=M', '@R13', 'M=D');
  out.push('@5', 'A=D-A', 'D=M', '@R14', 'M=D');
  out.push('@SP', 'AM=M-1', 'D=M', '@ARG', 'A=M', 'M=D');
  out.push('@ARG', 'D=M+1', '@SP', 'M=D');
  out.push('@R13', 'AM=M-1', 'D=M', '@THAT', 'M=D');
  out.push('@R13', 'AM=M-1', 'D=M', '@THIS', 'M=D');
  out.push('@R13', 'AM=M-1', 'D=M', '@ARG', 'M=D');
  out.push('@R13', 'AM=M-1', 'D=M', '@LCL', 'M=D');
  out.push('@R14', 'A=M', '0;JMP');
}

function writeBootstrap(out) {
  out.push('// Bootstrap code', '// Initialize SP = 256');
  out.push('@256', 'D=A', '@SP', 'M=D');
  out.push('// Call Sys.init');
  writeCall(out, 'Sys.init', 0);
}

function basename(fn) {
  const s = fn.replace(/\\/g, '/');
  return s.slice(s.lastIndexOf('/') + 1);
}

function processCommand(out, cmd, a1, a2) {
  if (['add', 'sub', 'neg', 'eq', 'gt', 'lt', 'and', 'or', 'not'].includes(cmd)) {
    writeArithmetic(out, cmd);
  } else if (cmd === 'push') {
    writePush(out, a1, a2);
  } else if (cmd === 'pop') {
    writePop(out, a1, a2);
  } else if (cmd === 'label') {
    writeLabel(out, a1);
  } else if (cmd === 'goto') {
    writeGoto(out, a1);
  } else if (cmd === 'if-goto') {
    writeIfGoto(out, a1);
  } else if (cmd === 'function') {
    cur_func = a1;
    writeFunction(out, a1, a2);
  } else if (cmd === 'call') {
    writeCall(out, a1, a2);
  } else if (cmd === 'return') {
    writeReturn(out);
  } else {
    throw new Error(`不支援的 VM 指令：${cmd}`);
  }
}

function translateFile(out, filename, src) {
  const base = basename(filename);
  let dot = base.lastIndexOf('.');
  if (dot < 0) dot = base.length;
  current_file = base.slice(0, dot);

  out.push(`\n// ========== File: ${filename} ==========`);
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = removeComment(raw);
    const trimmed = trim(line);
    if (trimmed.length > 0) {
      out.push(`// ${trimmed}`);
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0];
      const a1 = parts[1] ?? '';
      const a2 = Number.isInteger(Number(parts[2])) && parts[2] !== undefined ? Number(parts[2]) : parts[2] ?? '';
      if (!Number.isInteger(a2) && parts[2] !== undefined) throw new Error(`參數 2 應為整數：${trimmed}`);
      processCommand(out, cmd, a1, a2);
    }
  }
}

/** 翻譯多個 .vm 原始檔 → .asm 文字。files: [{ path, src }]，多檔時自動加 bootstrap。 */
function translate(files) {
  label_count = 0;
  return_count = 0;
  scope = files.length > 1;
  cur_func = '';
  const out = [];
  if (files.length > 1) writeBootstrap(out);
  for (const f of files) translateFile(out, f.path, f.src);
  return out.join('\n') + '\n';
}

/***** lib/jack/jack2vm.js *****/
// Jack → VM 編譯器（對應 _eda/jack2vm，oracle＝11/c/jack2vm.c，byte 相容）

const KEYWORDS = [
  'class', 'method', 'function', 'constructor', 'int', 'boolean',
  'char', 'void', 'var', 'static', 'field', 'let', 'do', 'if',
  'else', 'while', 'return', 'true', 'false', 'null', 'this',
];

const TOK = {
  KEYWORD: 'KEYWORD', SYM: 'SYM', NUM: 'NUM', STR: 'STR', ID: 'ID', EOF: 'EOF',
};

function Lex(src) {
  this.tokens = [];
  this.idx = 0;
  tokenize(this, src);
}

// 去掉註解（// 與 /* */），與 C 版一致：先整份處理再 tokenize
function removeComments(source) {
  let out = '';
  let i = 0;
  let inMulti = false;
  while (i < source.length) {
    if (inMulti) {
      if (source[i] === '*' && source[i + 1] === '/') {
        inMulti = false;
        i += 2;
      } else {
        i += 1;
      }
    } else if (source[i] === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (source[i] === '/' && source[i + 1] === '*') {
      inMulti = true;
      i += 2;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

function tokenize(lex, clean) {
  const symbols = '{}()[].,;+-*/&|<>=~';
  let p = 0;
  while (p < clean.length) {
    const c = clean[p];
    if (/\s/.test(c)) { p += 1; continue; }
    const t = { type: null, value: '', int_val: 0 };
    if (symbols.includes(c)) {
      t.type = TOK.SYM;
      t.value = c;
      p += 1;
    } else if (c === '"') {
      t.type = TOK.STR;
      p += 1;
      let v = '';
      while (p < clean.length && clean[p] !== '"') v += clean[p++];
      t.value = v;
      if (clean[p] === '"') p += 1;
    } else if (/\d/.test(c)) {
      t.type = TOK.NUM;
      let v = '';
      while (p < clean.length && /\d/.test(clean[p])) v += clean[p++];
      t.value = v;
      t.int_val = parseInt(v, 10);
    } else if (/[a-zA-Z_]/.test(c)) {
      let v = '';
      while (p < clean.length && /[a-zA-Z0-9_]/.test(clean[p])) v += clean[p++];
      t.value = v;
      t.type = KEYWORDS.includes(v) ? TOK.KEYWORD : TOK.ID;
    } else {
      p += 1; // 忽略未知字元
      continue;
    }
    lex.tokens.push(t);
  }
  lex.tokens.push({ type: TOK.EOF, value: '', int_val: 0 });
}

Lex.prototype.advance = function () {
  if (this.idx < this.tokens.length) return this.tokens[this.idx++];
  return this.tokens[this.tokens.length - 1];
};
Lex.prototype.peek = function () {
  if (this.idx < this.tokens.length) return this.tokens[this.idx];
  return this.tokens[this.tokens.length - 1];
};

const SK = { STATIC: 0, FIELD: 1, ARG: 2, VAR: 3 };
const KIND_MAP = ['static', 'this', 'argument', 'local'];

function SymbolTable() {
  this.classSymbols = [];
  this.subroutineSymbols = [];
  this.indexStatic = 0;
  this.indexField = 0;
  SymbolTable.prototype.startSubroutine.call(this);
}
SymbolTable.prototype.startSubroutine = function () {
  this.subroutineSymbols = [];
  this.indexArg = 0;
  this.indexVar = 0;
};
SymbolTable.prototype.define = function (name, type, kind) {
  const s = { name, type, kind, index: 0 };
  if (kind === SK.STATIC || kind === SK.FIELD) {
    s.index = kind === SK.STATIC ? this.indexStatic++ : this.indexField++;
    this.classSymbols.push(s);
  } else {
    s.index = kind === SK.ARG ? this.indexArg++ : this.indexVar++;
    this.subroutineSymbols.push(s);
  }
};
SymbolTable.prototype.varCount = function (kind) {
  const list = kind === SK.STATIC || kind === SK.FIELD ? this.classSymbols : this.subroutineSymbols;
  return list.filter((s) => s.kind === kind).length;
};
SymbolTable.prototype.lookup = function (name) {
  return this.subroutineSymbols.find((s) => s.name === name)
    || this.classSymbols.find((s) => s.name === name)
    || null;
};

const ERROR = (msg) => {
  throw new Error(`Compiler Error: ${msg}`);
};

/** 編譯單一 class 原始碼 → vm 指令行陣列（byte 相容 11/c/jack2vm.c） */
function compileJack(src) {
  const lex = new Lex(removeComments(src));
  const symbols = new SymbolTable();
  const out = [];
  const state = { currentClass: '', labelCounter: 0 };

  const t = {};
  t.require = (type, value) => {
    const tok = lex.advance();
    if (tok.type !== type || (value !== null && tok.value !== value)) {
      ERROR(`Expected '${value ?? 'token'}', but got '${tok.value}'`);
    }
    return tok;
  };
  const isTok = (type, value) => {
    const tok = lex.peek();
    return tok.type === type && (value === null || tok.value === value);
  };
  const isKw = (kw) => isTok(TOK.KEYWORD, kw);
  const isSym = (c) => isTok(TOK.SYM, c);
  const isAnySym = (syms) => {
    const tok = lex.peek();
    return tok.type === TOK.SYM && syms.includes(tok.value[0]);
  };
  const isType = () => isTok(TOK.ID, null) || isKw('int') || isKw('char') || isKw('boolean');
  const isAnyKw = (...kws) => kws.some((k) => isKw(k));

  const W = {
    push: (seg, i) => out.push(`push ${seg} ${i}`),
    pop: (seg, i) => out.push(`pop ${seg} ${i}`),
    arith: (c) => out.push(c),
    label: (l) => out.push(`label ${l}`),
    goto: (l) => out.push(`goto ${l}`),
    ifgoto: (l) => out.push(`if-goto ${l}`),
    call: (n, a) => out.push(`call ${n} ${a}`),
    func: (n, l) => out.push(`function ${n} ${l}`),
    ret: () => out.push('return'),
  };

  const pushVar = (name) => {
    const s = symbols.lookup(name);
    if (!s) ERROR(`Undefined variable: ${name}`);
    W.push(KIND_MAP[s.kind], s.index);
  };
  const popVar = (name) => {
    const s = symbols.lookup(name);
    if (!s) ERROR(`Undefined variable: ${name}`);
    W.pop(KIND_MAP[s.kind], s.index);
  };

  const compileExpression = () => {
    compileTerm();
    while (isAnySym('+-*/&|<>=.')) {
      const op = lex.advance();
      compileTerm();
      switch (op.value[0]) {
        case '+': W.arith('add'); break;
        case '-': W.arith('sub'); break;
        case '*': W.call('Math.multiply', 2); break;
        case '/': W.call('Math.divide', 2); break;
        case '&': W.arith('and'); break;
        case '|': W.arith('or'); break;
        case '<': W.arith('lt'); break;
        case '>': W.arith('gt'); break;
        case '=': W.arith('eq'); break;
      }
    }
  };

  const compileTerm = () => {
    const t0 = lex.peek();
    if (t0.type === TOK.NUM) {
      W.push('constant', t0.int_val);
      lex.advance();
    } else if (t0.type === TOK.STR) {
      const len = t0.value.length;
      W.push('constant', len);
      W.call('String.new', 1);
      for (let i = 0; i < len; i++) {
        W.push('constant', t0.value.charCodeAt(i));
        W.call('String.appendChar', 2);
      }
      lex.advance();
    } else if (t0.type === TOK.KEYWORD) {
      if (t0.value === 'true') {
        W.push('constant', 0);
        W.arith('not');
      } else if (t0.value === 'false' || t0.value === 'null') {
        W.push('constant', 0);
      } else if (t0.value === 'this') {
        W.push('pointer', 0);
      }
      lex.advance();
    } else if (isSym('(')) {
      lex.advance();
      compileExpression();
      t.require(TOK.SYM, ')');
    } else if (isAnySym('-~')) {
      const op = t0.value[0];
      lex.advance();
      compileTerm();
      if (op === '-') W.arith('neg');
      else W.arith('not');
    } else if (t0.type === TOK.ID) {
      const name = t0.value;
      lex.advance();
      if (isSym('[')) {
        pushVar(name);
        lex.advance();
        compileExpression();
        t.require(TOK.SYM, ']');
        W.arith('add');
        W.pop('pointer', 1);
        W.push('that', 0);
      } else if (isSym('(') || isSym('.')) {
        let funcName;
        let nArgs = 0;
        if (isSym('.')) {
          lex.advance();
          const subName = t.require(TOK.ID, null);
          const s = symbols.lookup(name);
          if (s) {
            pushVar(name);
            funcName = `${s.type}.${subName.value}`;
            nArgs = 1;
          } else {
            funcName = `${name}.${subName.value}`;
          }
        } else {
          W.push('pointer', 0);
          funcName = `${state.currentClass}.${name}`;
          nArgs = 1;
        }
        t.require(TOK.SYM, '(');
        nArgs += compileExpressionList();
        t.require(TOK.SYM, ')');
        W.call(funcName, nArgs);
      } else {
        pushVar(name);
      }
    } else {
      ERROR('Invalid term');
    }
  };

  const compileExpressionList = () => {
    let count = 0;
    if (!isSym(')')) {
      compileExpression();
      count = 1;
      while (isSym(',')) {
        lex.advance();
        compileExpression();
        count += 1;
      }
    }
    return count;
  };

  const compileReturn = () => {
    lex.advance(); // 'return'
    if (!isSym(';')) {
      compileExpression();
    } else {
      W.push('constant', 0);
    }
    t.require(TOK.SYM, ';');
    W.ret();
  };

  const compileDo = () => {
    lex.advance(); // 'do'
    compileTerm();
    W.pop('temp', 0);
    t.require(TOK.SYM, ';');
  };

  const compileLet = () => {
    lex.advance(); // 'let'
    const varName = t.require(TOK.ID, null);
    let isArray = false;
    if (isSym('[')) {
      isArray = true;
      pushVar(varName.value);
      lex.advance();
      compileExpression();
      t.require(TOK.SYM, ']');
      W.arith('add');
    }
    t.require(TOK.SYM, '=');
    compileExpression();
    t.require(TOK.SYM, ';');
    if (isArray) {
      W.pop('temp', 1);
      W.pop('pointer', 1);
      W.push('temp', 1);
      W.pop('that', 0);
    } else {
      popVar(varName.value);
    }
  };

  const compileWhile = () => {
    const top = `WHILE_EXP${state.labelCounter++}`;
    const end = `WHILE_END${state.labelCounter++}`;
    W.label(top);
    lex.advance(); // 'while'
    t.require(TOK.SYM, '(');
    compileExpression();
    t.require(TOK.SYM, ')');
    W.arith('not');
    W.ifgoto(end);
    t.require(TOK.SYM, '{');
    compileStatements();
    t.require(TOK.SYM, '}');
    W.goto(top);
    W.label(end);
  };

  const compileIf = () => {
    const lElse = `IF_FALSE${state.labelCounter++}`;
    const lEnd = `IF_END${state.labelCounter++}`;
    lex.advance(); // 'if'
    t.require(TOK.SYM, '(');
    compileExpression();
    t.require(TOK.SYM, ')');
    W.arith('not');
    W.ifgoto(lElse);
    t.require(TOK.SYM, '{');
    compileStatements();
    t.require(TOK.SYM, '}');
    const hasElse = isKw('else');
    if (hasElse) W.goto(lEnd);
    W.label(lElse);
    if (hasElse) {
      lex.advance(); // 'else'
      t.require(TOK.SYM, '{');
      compileStatements();
      t.require(TOK.SYM, '}');
      W.label(lEnd);
    }
  };

  const compileStatements = () => {
    for (;;) {
      const tok = lex.peek();
      if (tok.type !== TOK.KEYWORD) break;
      if (tok.value === 'let') compileLet();
      else if (tok.value === 'if') compileIf();
      else if (tok.value === 'while') compileWhile();
      else if (tok.value === 'do') compileDo();
      else if (tok.value === 'return') compileReturn();
      else break;
    }
  };

  const compileVarDec = () => {
    lex.advance(); // 'var'
    const type = lex.advance();
    do {
      const name = t.require(TOK.ID, null);
      symbols.define(name.value, type.value, SK.VAR);
    } while (isSym(',') && (lex.advance(), true));
    t.require(TOK.SYM, ';');
  };

  const compileParameterList = () => {
    if (isType()) {
      do {
        const type = lex.advance();
        const name = t.require(TOK.ID, null);
        symbols.define(name.value, type.value, SK.ARG);
      } while (isSym(',') && (lex.advance(), true));
    }
  };

  const compileSubroutine = () => {
    const kind = lex.advance(); // constructor | function | method
    lex.advance(); // 回傳類型
    const name = t.require(TOK.ID, null);

    symbols.startSubroutine();
    if (kind.value === 'method') {
      symbols.define('this', state.currentClass, SK.ARG);
    }
    t.require(TOK.SYM, '(');
    compileParameterList();
    t.require(TOK.SYM, ')');

    t.require(TOK.SYM, '{');
    while (isKw('var')) compileVarDec();

    const funcName = `${state.currentClass}.${name.value}`;
    const nLocals = symbols.varCount(SK.VAR);
    W.func(funcName, nLocals);

    if (kind.value === 'constructor') {
      const nFields = symbols.varCount(SK.FIELD);
      W.push('constant', nFields);
      W.call('Memory.alloc', 1);
      W.pop('pointer', 0);
    } else if (kind.value === 'method') {
      W.push('argument', 0);
      W.pop('pointer', 0);
    }

    compileStatements();
    t.require(TOK.SYM, '}');
  };

  const compileClassVarDec = () => {
    const kindTok = lex.advance(); // static | field
    const kind = kindTok.value === 'static' ? SK.STATIC : SK.FIELD;
    const type = lex.advance();
    do {
      const name = t.require(TOK.ID, null);
      symbols.define(name.value, type.value, kind);
    } while (isSym(',') && (lex.advance(), true));
    t.require(TOK.SYM, ';');
  };

  const compileClass = () => {
    t.require(TOK.KEYWORD, 'class');
    const className = t.require(TOK.ID, null);
    state.currentClass = className.value;
    t.require(TOK.SYM, '{');
    while (isAnyKw('static', 'field')) compileClassVarDec();
    while (isAnyKw('constructor', 'function', 'method')) compileSubroutine();
    t.require(TOK.SYM, '}');
  };

  compileClass();
  return out;
}

/***** lib/hdl/ast.js *****/
// HackHDL 的 AST 與解析結果（對應 _eda/hackhdl/src/ast.rs）
//
// 支援的語法子集：
//   CHIP Name {
//       IN  a, b[16], c;
//       OUT out[16], zr, ng;
//       PARTS:
//       SubChip (a=a, b[0]=true, b[1..15]=false, out[0..7]=w, out[15]=x, out=out);
//   }

/** 連到 pin 的位置：整條 / 單 bit / 範圍切片 */
class Range {
  /** { kind:'Whole' } | { kind:'Bit', i } | { kind:'Slice', lo, hi } */
  constructor(kind, ...args) {
    this.kind = kind;
    if (kind === 'Bit') this.i = args[0];
    if (kind === 'Slice') { this.lo0 = args[0]; this.hi0 = args[1]; }
  }
  static whole() { return new Range('Whole'); }
  static bit(i) { return new Range('Bit', i); }
  static slice(lo, hi) { return new Range('Slice', lo, hi); }
  bits() {
    switch (this.kind) {
      case 'Whole': return 1;
      case 'Bit': return 1;
      case 'Slice': return this.hi0 - this.lo0 + 1;
    }
  }
  lo() {
    switch (this.kind) {
      case 'Whole': return 0;
      case 'Bit': return this.i;
      case 'Slice': return this.lo0;
    }
  }
  equals(o) {
    return this.kind === o.kind
      && (this.kind !== 'Bit' || this.i === o.i)
      && (this.kind !== 'Slice' || (this.lo0 === o.lo0 && this.hi0 === o.hi0));
  }
}

/** 連線的右側（訊號源）：常數，或 wire / chip IN pin 的整條或切片 */
class Expr {
  /** { kind:'Const', v } | { kind:'Sig', name, range } */
  constructor(kind, ...args) {
    this.kind = kind;
    if (kind === 'Const') this.v = args[0];
    if (kind === 'Sig') [this.name, this.range] = args;
  }
  static const(v) { return new Expr('Const', v); }
  static sig(name, range) { return new Expr('Sig', name, range); }
  equals(o) {
    if (this.kind !== o.kind) return false;
    if (this.kind === 'Const') return this.v === o.v;
    return this.name === o.name && this.range.equals(o.range);
  }
}

/** 一條 `pin=expr` 連線 */
class PinConn {
  constructor(pin, pinRange, src) {
    this.pin = pin;
    this.pinRange = pinRange;
    this.src = src;
  }
}

/** 一個子晶片實例（子晶片名稱 == 實例標籤） */
class Part {
  constructor(chip, conns) {
    this.chip = chip; // 例如 ARegister、Mux16
    this.conns = conns;
  }
}

/** 一個晶片 */
class Chip {
  constructor(name, inPins, outPins, parts) {
    this.name = name;
    this.inPins = inPins;   // [{name, width}]
    this.outPins = outPins;
    this.parts = parts;
  }
  pinWidth(name) {
    return this.inPins
      .concat(this.outPins)
      .find((p) => p.name === name)?.width;
  }
}

/** 帶行列資訊的語法錯誤 */
class ParseError extends Error {
  constructor(line, col, msg) {
    super(`${line}:${col}: ${msg}`);
    this.line = line;
    this.col = col;
    this.msg = msg;
  }
}

/***** lib/hdl/parser.js *****/
// HackHDL 的 lexer + recursive descent parser（對應 _eda/hackhdl/src/parser.rs）

const Tok = {
  Ident: (s) => ({ t: 'Ident', s }),
  Num: (n) => ({ t: 'Num', n }),
  LBrace: { t: 'LBrace' },
  RBrace: { t: 'RBrace' },
  LBracket: { t: 'LBracket' },
  RBracket: { t: 'RBracket' },
  DotDot: { t: 'DotDot' },
  Assign: { t: 'Assign' },
  Comma: { t: 'Comma' },
  Semi: { t: 'Semi' },
  Colon: { t: 'Colon' },
  LParen: { t: 'LParen' },
  RParen: { t: 'RParen' },
};

function tokText(t) {
  if (!t) return 'EOF';
  switch (t.t) {
    case 'Ident': return t.s;
    case 'Num': return String(t.n);
    default: return t.t;
  }
}

function lex(src) {
  const toks = []; // token + line + col
  let i = 0;
  let line = 1;
  let col = 1;
  function bump(c) {
    i += 1;
    if (c === '\n') {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && i + 1 < src.length && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') bump(src[i]);
      continue;
    }
    if (c === '/' && i + 1 < src.length && src[i + 1] === '*') {
      const [l, c0] = [line, col];
      bump(src[i]);
      bump(src[i]);
      let closed = false;
      while (i < src.length) {
        if (src[i] === '*' && i + 1 < src.length && src[i + 1] === '/') {
          bump(src[i]);
          bump(src[i]);
          closed = true;
          break;
        }
        bump(src[i]);
      }
      if (!closed) throw new ParseError(l, c0, "註解沒有關閉 /* */");
      continue;
    }
    if (/\s/.test(c)) { bump(c); continue; }
    const single = { '{': Tok.LBrace, '}': Tok.RBrace, '[': Tok.LBracket, ']': Tok.RBracket, '=': Tok.Assign, ',': Tok.Comma, ';': Tok.Semi, ':': Tok.Colon, '(': Tok.LParen, ')': Tok.RParen };
    if (c in single) {
      toks.push([single[c], line, col]);
      bump(c);
      continue;
    }
    if (c === '.') {
      const [l, c0] = [line, col];
      if (i + 1 < src.length && src[i + 1] === '.') {
        toks.push([Tok.DotDot, line, col]);
        bump(c);
        bump(src[i]);
        continue;
      }
      throw new ParseError(l, c0, "單一個 . 不是合法 token");
    }
    if (/[0-9]/.test(c)) {
      const [l, c0] = [line, col];
      let s = '';
      while (i < src.length && /[0-9]/.test(src[i])) { s += src[i]; bump(src[i]); }
      const n = parseInt(s, 10);
      if (!Number.isFinite(n) || n > 0xffff) {
        throw new ParseError(l, c0, `數字 \`${s}\` 超出 16 bit 範圍`);
      }
      toks.push([Tok.Num(n), l, c0]);
      continue;
    }
    if (/[A-Za-z0-9_]/.test(c) || c === '-') {
      const [l, c0] = [line, col];
      let s = '';
      while (i < src.length && (/[A-Za-z0-9_]/.test(src[i]) || src[i] === '-')) { s += src[i]; bump(src[i]); }
      toks.push([Tok.Ident(s), l, c0]);
      continue;
    }
    throw new ParseError(line, col, `無法解析的字元 \`${c}\``);
  }
  return toks;
}

class Parser {
  constructor(src) {
    this.toks = lex(src);
    this.pos = 0;
  }
  peek() { return this.toks[this.pos]; }
  next() {
    const t = this.toks[this.pos];
    if (t !== undefined) this.pos += 1;
    return t;
  }
  err(msg) {
    const t = this.toks[this.pos];
    const l = t ? t[1] : 1;
    const c = t ? t[2] : 1;
    return new ParseError(l, c, msg);
  }
  expectIdent(what) {
    const t = this.next();
    if (t && t[0].t === 'Ident') return t[0].s;
    return this.err(`預期 ${what}，但看到 ${tokText(t ? t[0] : null)}（${t ? t[1] : 0}:${t ? t[2] : 0}）`);
  }
  expect(kind, what) {
    const t = this.next();
    if (t && t[0].t === kind) return;
    return this.err(`預期 ${what}，但看到 ${tokText(t ? t[0] : null)}`);
  }

  parseChip() {
    const kw = this.expectIdent('CHIP');
    if (kw !== 'CHIP') return this.err(`預期 CHIP，但看到 \`${kw}\``);
    const name = this.expectIdent('晶片名稱');
    this.expect('LBrace', '{');
    let inPins = [];
    let outPins = [];
    for (;;) {
      const t = this.peek();
      if (!t) return this.err('遇到檔案結尾，缺少 }');
      const k = t[0];
      if (k.t === 'Ident' && k.s === 'IN') {
        this.next();
        inPins = this.parsePins();
      } else if (k.t === 'Ident' && k.s === 'OUT') {
        this.next();
        outPins = this.parsePins();
      } else if (k.t === 'Ident' && k.s === 'PARTS') {
        this.next();
        this.expect('Colon', ':');
        const parts = [];
        while (!(!this.peek() || this.peek()[0].t === 'RBrace')) {
          parts.push(this.parsePart());
        }
        this.expect('RBrace', '}');
        return new Chip(name, inPins, outPins, parts);
      } else if (k.t === 'RBrace') {
        this.next();
        return new Chip(name, inPins, outPins, []);
      } else {
        return this.err(`在 IN/OUT/PARTS 區段看到 \`${tokText(k)}\``);
      }
    }
  }

  parsePins() {
    const pins = [];
    for (;;) {
      const name = this.expectIdent('pin 名稱');
      let width = 1;
      const p = this.peek();
      if (p && p[0].t === 'LBracket') {
        this.next();
        const t = this.next();
        if (!t || t[0].t !== 'Num') return this.err('預期 bus 寬度數字');
        width = t[0].n;
        this.expect('RBracket', ']');
      }
      pins.push({ name, width });
      const q = this.peek();
      if (q && q[0].t === 'Comma') {
        this.next();
      } else if (q && q[0].t === 'Semi') {
        this.next();
        return pins;
      } else {
        return this.err('pin 清單要用 , 分隔、以 ; 結尾');
      }
    }
  }

  parsePart() {
    const chip = this.expectIdent('子晶片名稱');
    this.expect('LParen', '(');
    const conns = [];
    for (;;) {
      const [pin, pinRange] = this.parsePinRef();
      this.expect('Assign', '=');
      const src = this.parseExpr();
      conns.push(new PinConn(pin, pinRange, src));
      const p = this.peek();
      if (p && p[0].t === 'Comma') {
        this.next();
      } else {
        break;
      }
    }
    this.expect('RParen', ')');
    this.expect('Semi', ';');
    return new Part(chip, conns);
  }

  parsePinRef() {
    const name = this.expectIdent('pin 名稱');
    const range = this.parseOptRange();
    return [name, range];
  }

  parseOptRange() {
    const p = this.peek();
    if (!p || p[0].t !== 'LBracket') return Range.whole();
    this.next();
    const t = this.next();
    if (!t || t[0].t !== 'Num') return this.err('預期索引數字');
    const a = t[0].n;
    const q = this.peek();
    if (q && q[0].t === 'DotDot') {
      this.next();
      const u = this.next();
      if (!u || u[0].t !== 'Num') return this.err('預期範圍上限數字');
      const b = u[0].n;
      if (b < a) return this.err(`範圍 ${a}..${b} 的上限小於下限`);
      this.expect('RBracket', ']');
      return Range.slice(a, b);
    }
    this.expect('RBracket', ']');
    return Range.bit(a);
  }

  parseExpr() {
    const t = this.next();
    if (!t) return this.err('預期訊號源，但遇到檔案結尾');
    const k = t[0];
    if (k.t === 'Ident' && k.s === 'true') return Expr.const(true);
    if (k.t === 'Ident' && k.s === 'false') return Expr.const(false);
    if (k.t === 'Ident') {
      const range = this.parseOptRange();
      return Expr.sig(k.s, range);
    }
    return this.err(`訊號源不能是 \`${tokText(k)}\``);
  }
}

/** 解析 .hdl 原始碼 */
function parseHdl(src) {
  return new Parser(src).parseChip();
}

/***** lib/hdl/elab.js *****/
// 詳述（elaboration）：把 parse 好的晶片圖解析成可 codegen 的 IR
// （對應 _eda/hackhdl/src/elab.rs）

/** 內建晶片（原始語義，不是手寫 HDL） */
const Builtin = {
  Nand: 'Nand',
  Dff: 'DFF',
  ARegister: 'ARegister',
  DRegister: 'DRegister',
  Rom32k: 'ROM32K',
  Screen: 'Screen',
  Keyboard: 'Keyboard',
};

/** HDL 裡寫的內建晶片名 → Builtin 常數 */
const BUILTIN_NAME = {
  Nand: 'Nand',
  DFF: 'Dff',
  ARegister: 'ARegister',
  DRegister: 'DRegister',
  ROM32K: 'Rom32k',
  Screen: 'Screen',
  Keyboard: 'Keyboard',
};

function builtinOf(name) {
  const key = BUILTIN_NAME[name];
  return key !== undefined ? Builtin[key] : null;
}

function builtinInOut(b) {
  switch (b) {
    case Builtin.Nand:
      return [
        [{ name: 'a', width: 1 }, { name: 'b', width: 1 }],
        [{ name: 'out', width: 1 }],
      ];
    case Builtin.Dff:
      return [[{ name: 'in', width: 1 }], [{ name: 'out', width: 1 }]];
    case Builtin.ARegister:
    case Builtin.DRegister:
      return [
        [{ name: 'in', width: 16 }, { name: 'load', width: 1 }],
        [{ name: 'out', width: 16 }],
      ];
    case Builtin.Rom32k:
      return [[{ name: 'address', width: 15 }], [{ name: 'out', width: 16 }]];
    case Builtin.Screen:
      return [
        [{ name: 'in', width: 16 }, { name: 'load', width: 1 }, { name: 'address', width: 13 }],
        [{ name: 'out', width: 16 }],
      ];
    case Builtin.Keyboard:
      return [[], [{ name: 'out', width: 16 }]];
  }
}

/** 是否為有狀態（clocked）晶片 */
function builtinSequential(b) {
  return b === Builtin.Dff || b === Builtin.ARegister || b === Builtin.DRegister || b === Builtin.Screen;
}

class ElabError extends Error {
  constructor(msg) { super(msg); this.msg = msg; }
}

function mask(n) {
  return n >= 16 ? 0xffff : (1 << n) - 1;
}

/** pin 側的位元數：Whole 用 pin 寬度 pw，Bit/Slice 用 range 本身 */
function pinRangeBits(range, pw) {
  return range.kind === 'Whole' ? pw : range.bits();
}

/** 子晶片是使用者晶片還是內建：{ kind:'User', idx } | { kind:'Builtin', b } */
function partChipName(clip) {
  if (clip.kind === 'User') return '?';
  return clip.b;
}

class ElabPart {
  constructor(label, clip, inConns, outWires) {
    this.label = label;     // 實例標籤
    this.clip = clip;       // PartClip
    this.inConns = inConns; // 每個輸入 pin 的連線清單
    this.outWires = outWires; // 每個輸出 pin 的 fan-out 清單
  }
}

class PinConnIr {
  constructor(pinLo, n, src) {
    this.pinLo = pinLo;
    this.n = n;
    this.src = src;
  }
}
// SrcIr: { kind:'Const', v } | { kind:'Wire', w } | { kind:'WireSlice', wire, lo, n } | { kind:'ChipIn', pin, lo, n }

class OutWireIr {
  constructor(pinLo, n, wire, destLo) {
    this.pinLo = pinLo;
    this.n = n;
    this.wire = wire;
    this.destLo = destLo;
  }
}

class WireWriter {
  constructor(part, pin, srcLo, n, destLo) {
    this.part = part;
    this.pin = pin;
    this.srcLo = srcLo;
    this.n = n;
    this.destLo = destLo;
  }
}

class Wire {
  constructor(name, width, outPin, writers, readers) {
    this.name = name;
    this.width = width;
    this.outPin = outPin; // 若這條 wire 是 chip 的 OUT pin，記錄其 pin index
    this.writers = writers;
    this.readers = readers;
  }
}

class ElabChip {
  constructor(name, inPins, outPins, parts, evalOrder, wires, hasState) {
    this.name = name;
    this.inPins = inPins;
    this.outPins = outPins;
    this.parts = parts;     // ElabPart[]（以 slot 索引）
    this.evalOrder = evalOrder; // slot 排列
    this.wires = wires;
    this.hasState = hasState;
  }
}

class Elab {
  constructor(chips, names, top) {
    this.chips = chips;
    this.names = names; // chipName -> idx
    this.top = top;
  }
}

/** 遞迴收集 dir 下的所有 .hdl（含子目錄，Lexical 排序，結果確定） */
function collectHdl(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new ElabError(`無法讀取 ${dir}: ${e.message}`);
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('.')) continue;
      out.push(...collectHdl(p));
    } else if (ent.name.endsWith('.hdl')) {
      out.push(p);
    }
  }
  return out;
}

/** 解析一個目錄（含子目錄）下所有 .hdl 成 library（name -> Chip） */
function loadLibrary(dir) {
  const lib = {};
  for (const p of collectHdl(dir)) {
    const name = path.basename(p, '.hdl');
    let src;
    try {
      src = fs.readFileSync(p, 'utf8');
    } catch (e) {
      throw new ElabError(`讀取 ${p}: ${e.message}`);
    }
    let chip;
    try {
      chip = parseHdl(src);
    } catch (e) {
      throw new ElabError(`${p}: ${e.message}`);
    }
    lib[name] = chip;
  }
  return lib;
}

/** 結合多個目錄的 library（後面的覆蓋前面的） */
function mergeLibs(a, b) {
  return { ...a, ...b };
}

/** 結合任意數量的 library（後面的覆蓋前面的） */
function mergeLibsList(libs) {
  return Object.assign({}, ...libs);
}

/** 詳述：以 top 為入口解析整個晶片圖 */
function elab(lib, top) {
  const r = new Resolver(lib);
  const topIdx = r.resolve(top);
  return new Elab(r.chips, r.names, topIdx);
}

class Resolver {
  constructor(lib) {
    this.lib = lib;
    this.chips = [];
    this.names = {};
    this.visiting = [];
  }
  resolve(name) {
    if (name in this.names) return this.names[name];
    if (this.visiting.includes(name)) {
      throw new ElabError(`晶片參考迴圈：${name} -> ${this.visiting[0]}`);
    }
    const ast = this.lib[name];
    if (!ast) {
      throw new ElabError(`找不到晶片 \`${name}\`（沒有對應 .hdl，也不是內建晶片）`);
    }
    this.visiting.push(name);
    const chip = this.elabChip(ast);
    this.visiting.pop();
    const idx = this.chips.length;
    this.chips.push(chip);
    this.names[name] = idx;
    return idx;
  }

  elabChip(ast) {
    const context = `晶片 ${ast.name}`;
    const inPins = ast.inPins;
    const outPins = ast.outPins;

    // 子晶片解析（先遞迴解析所有 part，取得 pin 定義）
    const children = [];
    for (const part of ast.parts) {
      const b = builtinOf(part.chip);
      let clip, inp, outp;
      if (b !== null) {
        clip = { kind: 'Builtin', b };
        [inp, outp] = builtinInOut(b);
      } else {
        const idx = this.resolve(part.chip);
        clip = { kind: 'User', idx };
        const c = this.chips[idx];
        inp = c.inPins;
        outp = c.outPins;
      }
      children.push({ clip, inPins: inp, outPins: outp });
    }

    const inIdx = new Map(inPins.map((p, i) => [p.name, i]));
    const outIdx = new Map(outPins.map((p, i) => [p.name, i]));

    // Pass A：收集每個 wire 的所有驅動者（可為多個不重疊的分割寫入）
    const wires = [];
    const wireByName = new Map();
    const wireRanges = new Map(); // name -> [{lo,n}]
    for (let pi = 0; pi < ast.parts.length; pi++) {
      const part = ast.parts[pi];
      const chip = children[pi];
      for (const conn of part.conns) {
        const outPinI = chip.outPins.findIndex((p) => p.name === conn.pin);
        if (outPinI >= 0) {
          // 輸出連線：`child.pin[pin_range] = wire[src_range]`
          if (conn.src.kind !== 'Sig') {
            throw new ElabError(`${context}: 晶片輸出 \`${part.chip}.${conn.pin}\` 不能接到常數`);
          }
          const name = conn.src.name;
          const range = conn.src.range;
          const pw = chip.outPins[outPinI].width;
          const n = pinRangeBits(conn.pinRange, pw);
          const srcLo = conn.pinRange.lo();
          const destLo = range.lo();
          const destN = range.bits() === 1 && range.kind === 'Whole' ? n : range.bits();
          if (destN !== n) {
            throw new ElabError(
              `${context}: 輸出連線 \`${part.chip}.${conn.pin}\`= 寬度不合（來源 ${n} 位元 vs 目標 ${destN} 位元）`
            );
          }
          const ranges = wireRanges.get(name) ?? [];
          for (const [dlo, dn] of ranges) {
            if (destLo < dlo + dn && dlo < destLo + n) {
              throw new ElabError(
                `${context}: wire \`${name}\` 上的 ${destLo}..${destLo + n} 位元被重複驅動`
              );
            }
          }
          ranges.push([destLo, n]);
          wireRanges.set(name, ranges);
          if (inIdx.has(name)) {
            throw new ElabError(`${context}: wire \`${name}\` 與 IN pin 同名`);
          }
          let w = wireByName.get(name);
          if (w === undefined) {
            w = wires.length;
            wires.push(new Wire(name, 0, outIdx.has(name) ? outIdx.get(name) : null, [], []));
            wireByName.set(name, w);
          }
          wires[w].writers.push(new WireWriter(pi, outPinI, srcLo, n, destLo));
        }
        // 輸入 pin：留到 Pass B 處理
      }
    }

    // 計算 wire 寬度並驗證 OUT pin 完整覆蓋
    for (const [name, ranges] of wireRanges) {
      const w = wireByName.get(name);
      wires[w].width = Math.max(...ranges.map(([lo, n]) => lo + n));
    }
    for (const w of wires) {
      if (w.outPin !== null) {
        if (w.width !== outPins[w.outPin].width) {
          throw new ElabError(
            `${context}: OUT pin \`${w.name}\` 寬度 ${outPins[w.outPin].width}，但只被驅動到 ${w.width} 位元`
          );
        }
        const covered = new Array(w.width).fill(false);
        for (const wr of w.writers) {
          for (let b = wr.destLo; b < wr.destLo + wr.n; b++) covered[b] = true;
        }
        if (covered.some((c) => !c)) {
          throw new ElabError(`${context}: OUT pin \`${w.name}\` 沒有被完整驅動`);
        }
      }
    }

    // Pass B：輸入 pin 連線解析 + 輸出 pin fan-out 記錄
    const parts = [];
    let hasState = false;
    for (let pi = 0; pi < ast.parts.length; pi++) {
      const part = ast.parts[pi];
      const chip = children[pi];
      if (chip.clip.kind === 'Builtin') hasState ||= builtinSequential(chip.clip.b);
      else hasState ||= this.chips[chip.clip.idx].hasState;
      const inConns = Array.from({ length: chip.inPins.length }, () => []);
      const outWires = Array.from({ length: chip.outPins.length }, () => []);
      for (const conn of part.conns) {
        const outPinI = chip.outPins.findIndex((p) => p.name === conn.pin);
        if (outPinI >= 0) {
          const pw = chip.outPins[outPinI].width;
          if (conn.src.kind !== 'Sig') continue;
          const n = pinRangeBits(conn.pinRange, pw);
          const pinLo = conn.pinRange.lo();
          const destLo = conn.src.range.lo();
          const w = wireByName.get(conn.src.name);
          outWires[outPinI].push(new OutWireIr(pinLo, n, w, destLo));
          continue;
        }
        // 輸入 pin
        const ini = chip.inPins.findIndex((p) => p.name === conn.pin);
        if (ini < 0) {
          throw new ElabError(
            `${context}: \`${part.chip}\` 沒有 \`${part.chip}.${conn.pin}\` 這個 pin（child=${partChipName(chip.clip)}）`
          );
        }
        const pw = chip.inPins[ini].width;
        const n = pinRangeBits(conn.pinRange, pw);
        const pinLo = conn.pinRange.lo();
        let src;
        if (conn.src.kind === 'Const') {
          src = { kind: 'Const', v: conn.src.v ? mask(n) : 0 };
        } else {
          const { name, range } = conn.src;
          let rngBits;
          if (range.kind === 'Whole') {
            if (inIdx.has(name)) rngBits = inPins[inIdx.get(name)].width;
            else if (wireByName.has(name)) rngBits = wires[wireByName.get(name)].width;
            else throw new ElabError(`${context}: \`${part.chip}\` 參考了未定義的訊號 \`${name}\``);
          } else if (range.kind === 'Bit') {
            const w = wireByName.has(name) ? wireByName.get(name) : inIdx.has(name) ? -1 : null;
            if (w === null) throw new ElabError(`${context}: 未定義的訊號 \`${name}\``);
            rngBits = 1;
          } else {
            rngBits = range.bits();
          }
          if (rngBits !== n) {
            throw new ElabError(
              `${context}: \`${part.chip}.${conn.pin}=\` 寬度不合（pin ${n} 位元 vs 訊號 ${rngBits} 位元）`
            );
          }
          if (wireByName.has(name)) {
            const w = wireByName.get(name);
            wires[w].readers.push(pi);
            if (range.kind === 'Whole') src = { kind: 'Wire', w };
            else src = { kind: 'WireSlice', wire: w, lo: range.lo(), n: rngBits };
          } else if (inIdx.has(name)) {
            const ipin = inIdx.get(name);
            src = { kind: 'ChipIn', pin: ipin, lo: range.lo(), n: rngBits };
          } else {
            throw new ElabError(`${context}: 未定義的訊號 \`${name}\``);
          }
        }
        inConns[ini].push(new PinConnIr(pinLo, n, src));
      }
      // 驗證每個輸入 pin 的連線完整覆蓋
      for (let ini = 0; ini < inConns.length; ini++) {
        const pw = chip.inPins[ini].width;
        const covered = new Array(pw).fill(false);
        for (const c of inConns[ini]) {
          for (let b = c.pinLo; b < c.pinLo + c.n; b++) {
            if (covered[b]) {
              throw new ElabError(
                `${context}: \`${part.chip}\` 的 pin \`${chip.inPins[ini].name}\` 位元 ${b} 重複驅動`
              );
            }
            covered[b] = true;
          }
        }
        if (covered.some((c) => !c)) {
          throw new ElabError(
            `${context}: \`${part.chip}\` 的 pin \`${chip.inPins[ini].name}\` 連線未完整覆蓋寬度 ${pw}`
          );
        }
      }
      parts.push(new ElabPart(part.chip, chip.clip, inConns, outWires));
    }

    // 驗證 chip 每個 OUT pin 都有驅動
    for (const op of outPins) {
      const w = wireByName.get(op.name);
      if (w === undefined) throw new ElabError(`${context}: OUT pin \`${op.name}\` 沒有被驅動`);
      if (wires[w].outPin === null) {
        throw new ElabError(`${context}: OUT pin \`${op.name}\` 的 wire 型別錯誤`);
      }
    }

    // 拓樸排序（前向參考允許）
    const n = parts.length;
    const partSeq = parts.map((p) => {
      if (p.clip.kind === 'Builtin') return builtinSequential(p.clip.b);
      return this.chips[p.clip.idx].hasState;
    });
    const adj = Array.from({ length: n }, () => []);
    const indeg = new Array(n).fill(0);
    for (const w of wires) {
      if (w.writers.length === 0) {
        throw new ElabError(`${context}: wire \`${w.name}\` 沒有驅動者`);
      }
      for (const rd of w.readers) {
        if (partSeq[rd]) continue; // 有狀態 part 的輸入在 tick 才取樣
        for (const wr of w.writers) {
          if (rd === wr.part) {
            throw new ElabError(
              `${context}: wire \`${w.name}\` 同時被 part ${rd} 寫入與讀取（組合迴圈）`
            );
          }
          adj[wr.part].push(rd);
          indeg[rd] += 1;
        }
      }
    }
    // Kahn，同層維持原順序
    const order = [];
    const ready = [];
    for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i);
    let k = 0;
    while (k < ready.length) {
      const u = ready[k];
      k += 1;
      order.push(u);
      for (const v of adj[u]) {
        indeg[v] -= 1;
        if (indeg[v] === 0) ready.push(v);
      }
    }
    if (order.length !== n) {
      throw new ElabError(`${context}: parts 存在組合迴圈（${n - order.length}-part 未被排序）`);
    }

    return new ElabChip(ast.name, inPins, outPins, parts, order, wires, hasState);
  }
}

/***** lib/hdl/codegen.js *****/
// HackHDL → JavaScript 程式碼產生器（對應 _eda/hdl2rs/src/gen.rs）
//
// 一個晶片 → 一個 class：
//   - 局部 wire 是 eval 內的區域變數（Number，0..0xffff）
//   - 每個 part 依拓樸順序求值，輸出透過 setBits 合併到目標 wire
//   - 內建 Nand/DFF/Reg/ROM32K/Screen/Keyboard 直接產生其行為
// 產出的程式完全自足（含 setBits 與內建晶片），可 `new Function` 載入，
// 或存成 ESM 模組（--keep）由 hackrt::tst 驅動。


const JS_KEYWORDS = new Set([
  'in', 'static', 'true', 'false', 'super', 'this', 'class', 'function', 'var',
  'let', 'const', 'return', 'for', 'while', 'if', 'else', 'do', 'new', 'switch',
  'case', 'break', 'continue', 'default', 'throw', 'try', 'catch', 'finally',
  'typeof', 'instanceof', 'delete', 'void', 'yield', 'await', 'import',
  'export', 'with', 'null', 'enum', 'implements', 'interface', 'package',
  'private', 'protected', 'public', 'extends', 'of', 'async',
]);

/** 非法識別元字元換成 `_`；開頭是數字則前綴 `_` */
function san(name) {
  let s = '';
  for (const c of name) {
    s += /[A-Za-z0-9_]/.test(c) ? c : '_';
  }
  if (/^[0-9]/.test(s)) s = '_' + s;
  return s;
}

/** pin 名稱（規避 JS 保留字，例：in → in_） */
function pinSan(name) {
  const s = san(name);
  return JS_KEYWORDS.has(s) ? `${s}_` : s;
}

/** 位元擷取運算式：取 expr 的 [lo, lo+width) */
function sub(expr, lo, n) {
  if (n >= 16) return expr;
  const mask = (1 << n) - 1;
  return `((${expr} >> ${lo}) & 0x${mask.toString(16)})`;
}

/** wire 變數名稱 */
function wname(chip, wire) {
  return `w_${san(chip.wires[wire].name)}`;
}

function chipType(e, clip) {
  if (clip.kind === 'User') return `${san(e.chips[clip.idx].name)}Chip`;
  switch (clip.b) {
    case Builtin.Nand: return 'NandChip';
    case Builtin.Dff: return 'DffChip';
    case Builtin.ARegister:
    case Builtin.DRegister: return 'RegChip';
    case Builtin.Rom32k: return 'Rom32KChip';
    case Builtin.Screen: return 'ScreenChip';
    case Builtin.Keyboard: return 'KeyboardChip';
  }
}

/** part 是否為有狀態（clocked）：eval 輸出取自狀態、輸入在 tick 才取樣 */
function isSeq(e, clip) {
  if (clip.kind === 'Builtin') return builtinSequential(clip.b);
  return e.chips[clip.idx].hasState;
}

/** chip 是否存在「序↔序」回饋迴圈（如 Computer） */
function hasFeedback(e, chip) {
  for (const w of chip.wires) {
    const wrSeq = w.writers.some((wr) => isSeq(e, chip.parts[wr.part].clip));
    const rdSeq = w.readers.some((rd) => isSeq(e, chip.parts[rd].clip));
    if (wrSeq && rdSeq) return true;
  }
  return false;
}

/** part 直接比對的 name 條件；Screen/Keyboard 附上常見別名（SCREEN、KBD） */
function partNameCond(part) {
  let base = `name === "${part.label}"`;
  if (part.clip.kind === 'Builtin' && part.clip.b === Builtin.Screen) {
    base += ` || name === "SCREEN"`;
  }
  if (part.clip.kind === 'Builtin' && part.clip.b === Builtin.Keyboard) {
    base += ` || name === "KBD"`;
  }
  return base;
}

/** part 輸入引數的綁定程式碼（支援多連線 setBits 組合） */
function emitInputs(chip, params, part, prefix, indent) {
  const args = [];
  const lines = [];
  for (let ini = 0; ini < part.inConns.length; ini++) {
    const conns = part.inConns[ini];
    const iv = `${prefix}${ini}`;
    if (conns.length === 0) {
      lines.push(`${indent}let ${iv} = 0x0;`);
    } else if (conns.length === 1) {
      lines.push(`${indent}let ${iv} = ${srcExpr(chip, conns[0].src, params)};`);
    } else {
      lines.push(`${indent}let ${iv} = 0;`);
      for (const c of conns) {
        lines.push(`${indent}${iv} = setBits(${iv}, ${c.pinLo}, ${c.n}, ${srcExpr(chip, c.src, params)});`);
      }
    }
    args.push(iv);
  }
  return { lines, args };
}

/** child 的輸出 pin 名稱（在 __o 上取欄位用） */
function childOutPin(e, part, opi) {
  if (part.clip.kind === 'User') return pinSan(e.chips[part.clip.idx].outPins[opi].name);
  return 'out';
}

/** user chip 是否具有 `address` 輸入（判斷 RAM-like） */
function hasAddress(e, idx) {
  return e.chips[idx].inPins.some((p) => p.name === 'address');
}

/** user chip out 的第一個 pin 的欄位名（探測時回傳的值） */
function chipOut0Field(e, idx) {
  return pinSan(e.chips[idx].outPins[0].name);
}

/** probe/set 時，對 user chip 產生「某種模式」的輸入引數 */
function probeArgs(e, idx, mode) {
  return e.chips[idx].inPins.map((p) => {
    if (p.name === 'address') return 'i';
    if (p.name === 'in' && mode === 'Set') return 'val';
    if (p.name === 'load' && mode === 'Set') return '1';
    return '0';
  });
}

/** 把 SrcIr 轉成目前語境的運算式 */
function srcExpr(chip, src, inParams) {
  switch (src.kind) {
    case 'Const': return `0x${src.v.toString(16)}`;
    case 'Wire': return wname(chip, src.w);
    case 'WireSlice': return sub(wname(chip, src.wire), src.lo, src.n);
    case 'ChipIn': return sub(inParams[src.pin], src.lo, src.n);
  }
}

/** 需要哪些內建晶片 class 定義 */
function usedBuiltins(e) {
  return e.chips.flatMap((c) => c.parts.map((p) => (p.clip.kind === 'Builtin' ? p.clip.b : null)))
    .filter((b) => b !== null);
}

/** 產生 gen 內容（JS 原始碼字串） */
function generateJs(e, { asModule = false } = {}) {
  const src = [];
  src.push('// 由 hackjs/hdl2js 自動產生，請勿手動編輯');
  src.push('// ---- 共用工具 ----');
  src.push('function setBits(w, lo, n, val) {');
  src.push('  const mask = n >= 16 ? 0xffff : ((1 << n) - 1);');
  src.push('  return (w & (~(mask << lo) & 0xffff)) | ((val & mask) << lo);');
  src.push('}');
  src.push('');

  src.push('// ---- 內建 Nand ----');
  src.push('class NandChip {');
  src.push('  eval(a, b) { return { out: !(a !== 0 && b !== 0) ? 1 : 0 }; }');
  src.push('  tick() {} tock() {}');
  src.push('}');
  src.push('');

  const ub = usedBuiltins(e);
  if (ub.includes(Builtin.Dff)) {
    src.push('// ---- 內建 DFF（master/slave 兩階段）----');
    src.push('class DffChip {');
    src.push('  constructor() { this.latch = 0; this.q = 0; }');
    src.push('  eval() { return { out: this.q }; }');
    src.push('  sample(in_) { this.latch = in_ & 1; }');
    src.push('  tock() { this.q = this.latch; }');
    src.push('  probeWhole() { return this.latch; }');
    src.push('  probeBit(i) { return (this.latch >> i) & 1; }');
    src.push('}');
    src.push('');
  }
  if (ub.some((b) => b === Builtin.ARegister || b === Builtin.DRegister)) {
    src.push('// ---- 內建 ARegister / DRegister（16-bit register）----');
    src.push('class RegChip {');
    src.push('  constructor() { this.latch = 0; this.q = 0; }');
    src.push('  eval(in_, load) { return { out: this.q }; }');
    src.push('  sample(in_, load) { if (load !== 0) this.latch = in_; }');
    src.push('  tock() { this.q = this.latch; }');
    src.push('  probeWhole() { return this.latch; }');
    src.push('  probeBit(i) { return (this.latch >> i) & 1; }');
    src.push('}');
    src.push('');
  }
  if (ub.includes(Builtin.Rom32k)) {
    src.push('// ---- 內建 ROM32K（程式記憶體，地址空間 32768）----');
    src.push('class Rom32KChip {');
    src.push('  constructor() { this.mem = new Uint16Array(32768); }');
    src.push('  eval(address) { return { out: address < 32768 ? this.mem[address] : 0 }; }');
    src.push('  tick() {} tock() {}');
    src.push('  load(src) {');
    src.push('    const readers = typeof globalThis !== "undefined" ? (globalThis.HACKJS_FS || {}) : {};');
    src.push('    if (typeof src === "string" && !src.includes("\\n")) {');
    src.push('      if (readers.read) {');
    src.push('        const s = readers.read(src);');
    src.push('        if (s !== null && s !== undefined) src = s;');
    src.push('      }');
    src.push('    }');
    src.push('    if (typeof src !== "string" || src.trim() === "") return false;');
    src.push('    let idx = 0;');
    src.push('    for (const line of String(src).split("\\n")) {');
    src.push('      const t = line.trim();');
    src.push('      if (t === "") continue;');
    src.push('      const bin = t.split(/\\s+/)[0];');
    src.push('      const v = parseInt(bin, 2);');
    src.push('      if (Number.isNaN(v)) return false;');
    src.push('      if (idx >= 32768) break;');
    src.push('      this.mem[idx] = v & 0xffff;');
    src.push('      idx += 1;');
    src.push('    }');
    src.push('    return true;');
    src.push('  }');
    src.push('}');
    src.push('');
  }
  if (ub.includes(Builtin.Screen)) {
    src.push('// ---- 內建 Screen（8192 個 word 的螢幕對映）----');
    src.push('class ScreenChip {');
    src.push('  constructor() { this.mem = new Uint16Array(8192); }');
    src.push('  eval(in_, load, address) { return { out: address < 8192 ? this.mem[address] : 0 }; }');
    src.push('  sample(in_, load, address) { if (load !== 0 && address < 8192) this.mem[address] = in_; }');
    src.push('  tock() {}');
    src.push('}');
    src.push('');
  }
  if (ub.includes(Builtin.Keyboard)) {
    src.push('// ---- 內建 Keyboard（記憶體對映鍵盤；值由 set Keyword N 設定）----');
    src.push('class KeyboardChip {');
    src.push('  constructor() { this.key = 0; }');
    src.push('  eval() { return { out: this.key }; }');
    src.push('  setKey(v) { this.key = v & 0xffff; }');
    src.push('  probe() { return this.key; }');
    src.push('  tick() {} tock() {}');
    src.push('}');
    src.push('');
  }

  for (const chip of e.chips) {
    genChip(e, chip, src);
  }
  if (asModule) {
    const topChip = e.chips[e.top];
    src.push(`export { ${san(topChip.name)}Chip };`);
    src.push('');
  }
  return src.join('\n');
}

const RAM_FAMILY = new Set(['RAM8', 'RAM64', 'RAM512', 'RAM4K', 'RAM16K']);
const RAM_SIZE = { RAM8: 8, RAM64: 64, RAM512: 512, RAM4K: 4096, RAM16K: 16384 };

/** 是否為教材標準 RAM 結構（DMux8Way + 8×Register/RAM* + Mux8Way16；位址→cell 對映）：
    這種晶片融合成原生 Uint16Array，語意與 gate 版完全等價，但 eval/sample 從 O(N) 變 O(1)。 */
function isNativeRamChip(e, chip) {
  if (!RAM_FAMILY.has(chip.name)) return false;
  if (!chip.hasState) return false;
  const parts = chip.parts;
  if (parts.length !== 10) return false;
  const types = {};
  for (const p of parts) {
    const cn = p.clip.kind === 'User' ? e.chips[p.clip.idx].name : String(p.clip.b);
    types[cn] = (types[cn] ?? 0) + 1;
  }
  const keys = Object.keys(types);
  if (keys.length !== 3) return false;
  const one = keys.filter((k) => types[k] === 1);
  if (one.length !== 2) return false;
  if (!(one.includes('DMux8Way') && one.includes('Mux8Way16'))) return false;
  const eight = keys.filter((k) => types[k] === 8);
  if (eight.length !== 1) return false;
  const kid = eight[0];
  return kid === 'Register' || RAM_FAMILY.has(kid);
}

/** 原生 RAM chip 生成：Uint16Array cells + 兩相寫入緩衝（sample 記、tock 提交） */
function genNativeRamChip(chip, src) {
  const cn = san(chip.name);
  const size = RAM_SIZE[chip.name] ?? 0;
  src.push(`// ---- ${chip.name}（原生 cell 陣列加速）----`);
  src.push(`class ${cn}Chip {`);
  src.push(`  constructor() { this.mem = new Uint16Array(${size}); this._b = 0; this._ba = 0; this._bl = false; }`);
  src.push('  eval(in_, load, address) {');
  src.push(`    const a = address & 0xffff;`);
  src.push(`    return { out: a < ${size} ? this.mem[a] : 0 };`);
  src.push('  }');
  src.push('  sample(in_, load, address) {');
  src.push(`    this._bl = load !== 0; this._b = in_ & 0xffff; this._ba = address & 0xffff;`);
  src.push('  }');
  src.push('  tock() {');
  src.push(`    if (this._bl && this._ba < ${size}) this.mem[this._ba] = this._b;`);
  src.push('    this._bl = false;');
  src.push('  }');
  src.push('  probe_whole() { return null; }');
  src.push('  probe_indexed(name, i) {');
  src.push(`    const a = i & 0xffff;`);
  src.push(`    return a < ${size} ? this.mem[a] : 0;`);
  src.push('  }');
  src.push('  set_probe(name, i, v) {');
  src.push(`    const a = i & 0xffff;`);
  src.push(`    if (a < ${size}) { this.mem[a] = v & 0xffff; return true; }`);
  src.push('    return false;');
  src.push('  }');
  src.push('  load() { return false; }');
  src.push('}');
  src.push('');
}

function genChip(e, chip, src) {
  if (isNativeRamChip(e, chip)) {
    genNativeRamChip(chip, src);
    return;
  }
  const cn = san(chip.name);
  const params = chip.inPins.map((p) => pinSan(p.name));

  src.push(`// ---- ${chip.name} ----`);
  src.push(`class ${cn}Chip {`);
  src.push('  constructor() {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const part = chip.parts[slot];
    src.push(`    this._p${slot} = new ${chipType(e, part.clip)}();`);
  }
  src.push('  }');

  // ---- eval：獲取關聯性輸出（輸出自狀態，與輸入無關）----
  src.push(`  eval(${params.join(', ')}) {`);
  emitCascade(e, chip, params, '    ', src);
  src.push('    return {');
  for (const op of chip.outPins) {
    src.push(`      ${pinSan(op.name)}: ${wname(chip, chip.wires.findIndex((w) => w.name === op.name))},`);
  }
  src.push('    };');
  src.push('  }');

  // ---- sample：tick 邊緣，先重算落定的 wire，再遞迴取樣有狀態 children ----
  src.push(`  sample(${params.join(', ')}) {`);
  emitCascade(e, chip, params, '    ', src);
  if (hasFeedback(e, chip)) {
    src.push('    // 回饋迴圈：以最終 wire 再完整評估一輪（eval 為純函式）');
    emitPartsEval(e, chip, params, '    ', src);
  }
  if (chip.hasState) {
    src.push('    // 遞迴取樣有狀態 children');
    for (const slot of chip.evalOrder) {
      const part = chip.parts[slot];
      if (!isSeq(e, part.clip)) continue;
      src.push('    {');
      const { lines, args } = emitInputs(chip, params, part, '__c', '      ');
      for (const l of lines) src.push(l);
      src.push(`      this._p${slot}.sample(${args.join(', ')});`);
      src.push('    }');
    }
  }
  src.push('  }');

  // ---- tock：提交所有子晶片狀態 ----
  src.push('  tock() {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    src.push(`    this._p${slot}.tock();`);
  }
  src.push('  }');

  // ---- probe_whole ----
  src.push('  probe_whole(name) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const part = chip.parts[slot];
    src.push(`    // part ${slot}: ${part.label} (${chipType(e, part.clip)})`);
    src.push(`    if (${partNameCond(part)}) {`);
    const clip = part.clip;
    if (clip.kind === 'Builtin' && (clip.b === Builtin.Dff || clip.b === Builtin.ARegister || clip.b === Builtin.DRegister)) {
      src.push(`      return this._p${slot}.probeWhole();`);
    } else if (clip.kind === 'Builtin' && clip.b === Builtin.Keyboard) {
      src.push(`      return this._p${slot}.probe();`);
    } else if (clip.kind === 'User' && !hasAddress(e, clip.idx)) {
      const args = probeArgs(e, clip.idx, 'Whole');
      src.push(`      return this._p${slot}.eval(${args.join(', ')})[${JSON.stringify(chipOut0Field(e, clip.idx))}];`);
    } else {
      src.push('      return null;');
    }
    src.push('    }');
  }
  src.push('    // 遞迴 user parts');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'User') {
      src.push(`    { const v = this._p${slot}.probe_whole(name); if (v !== null) return v; }`);
    }
  }
  src.push('    return null;');
  src.push('  }');

  // ---- probe_indexed ----
  src.push('  probe_indexed(name, i) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const part = chip.parts[slot];
    const clip = part.clip;
    src.push(`    // part ${slot}: ${part.label} (${chipType(e, part.clip)})`);
    src.push(`    if (${partNameCond(part)}) {`);
    if (clip.kind === 'Builtin' && (clip.b === Builtin.Dff || clip.b === Builtin.ARegister || clip.b === Builtin.DRegister)) {
      src.push(`      return this._p${slot}.probeWhole();`);
    } else if (clip.kind === 'Builtin' && clip.b === Builtin.Keyboard) {
      src.push(`      return this._p${slot}.probe();`);
    } else if (clip.kind === 'Builtin' && clip.b === Builtin.Screen) {
      src.push(`      return this._p${slot}.eval(0, 0, i).out;`);
    } else if (clip.kind === 'Builtin' && clip.b === Builtin.Rom32k) {
      src.push(`      return this._p${slot}.eval(i).out;`);
    } else if (clip.kind === 'User' && hasAddress(e, clip.idx)) {
      const args = probeArgs(e, clip.idx, 'Cell');
      src.push(`      return this._p${slot}.eval(${args.join(', ')})[${JSON.stringify(chipOut0Field(e, clip.idx))}];`);
    } else if (clip.kind === 'User') {
      const args = probeArgs(e, clip.idx, 'Whole');
      src.push(`      return this._p${slot}.eval(${args.join(', ')})[${JSON.stringify(chipOut0Field(e, clip.idx))}];`);
    } else {
      src.push('      return null;');
    }
    src.push('    }');
  }
  src.push('    // 遞迴 user parts');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'User') {
      src.push(`    { const v = this._p${slot}.probe_indexed(name, i); if (v !== null) return v; }`);
    }
  }
  src.push('    return null;');
  src.push('  }');

  // ---- set_whole ----
  src.push('  set_whole(name, val) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'Builtin' && chip.parts[slot].clip.b === Builtin.Keyboard) {
      src.push(`    if (${partNameCond(chip.parts[slot])}) { this._p${slot}.setKey(val); return true; }`);
    }
  }
  src.push('    // 遞迴 user parts');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'User') {
      src.push(`    if (this._p${slot}.set_whole(name, val)) return true;`);
    }
  }
  src.push('    return false;');
  src.push('  }');

  // ---- set_probe ----
  src.push('  set_probe(name, i, val) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const part = chip.parts[slot];
    const clip = part.clip;
    src.push(`    // part ${slot}: ${part.label} (${chipType(e, part.clip)})`);
    src.push(`    if (${partNameCond(part)}) {`);
    if (clip.kind === 'Builtin' && clip.b === Builtin.Screen) {
      src.push(`      this._p${slot}.sample(val, 1, i);`);
      src.push(`      this._p${slot}.tock();`);
      src.push('      return true;');
    } else if (clip.kind === 'User' && hasAddress(e, clip.idx)) {
      const args = probeArgs(e, clip.idx, 'Set');
      src.push(`      this._p${slot}.sample(${args.join(', ')});`);
      src.push(`      this._p${slot}.tock();`);
      src.push('      return true;');
    } else {
      src.push('      return false;');
    }
    src.push('    }');
  }
  src.push('    // 遞迴 user parts');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'User') {
      src.push(`    if (this._p${slot}.set_probe(name, i, val)) return true;`);
    }
  }
  src.push('    return false;');
  src.push('  }');

  // ---- load_program ----
  src.push('  load_program(p) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const clip = chip.parts[slot].clip;
    if (clip.kind === 'Builtin' && clip.b === Builtin.Rom32k) {
      src.push(`    if (this._p${slot}.load(p)) return true;`);
    } else if (clip.kind === 'User') {
      src.push(`    if (this._p${slot}.load_program(p)) return true;`);
    }
  }
  src.push('    return false;');
  src.push('  }');

  src.push('}');
  src.push('');
}

/** 產生 eval/sample 共用的「先算 wire 再算 part」程式碼 */
function emitCascade(e, chip, params, indent, src) {
  emitWireDecls(chip, indent, src);
  emitPartsEval(e, chip, params, indent, src);
}

/** 每個 wire 的 `let w_xxx = 0;` 宣告 */
function emitWireDecls(chip, indent, src) {
  for (const w of chip.wires) {
    src.push(`${indent}let ${wname(chip, chip.wires.indexOf(w))} = 0;`);
  }
}

/** 依 eval_order 逐一評估 part，把輸出合併進 wire */
function emitPartsEval(e, chip, params, indent, src) {
  for (const slot of chip.evalOrder) {
    const part = chip.parts[slot];
    const ty = chipType(e, part.clip);
    src.push(`${indent}{ // part ${slot}: ${part.label} (${ty})`);
    const inner = indent + '  ';
    if (part.clip.kind === 'Builtin' && part.clip.b === Builtin.Dff) {
      src.push(`${inner}const __o = this._p${slot}.eval();`);
    } else {
      const { lines, args } = emitInputs(chip, params, part, '__i', inner);
      for (const l of lines) src.push(l);
      src.push(`${inner}const __o = this._p${slot}.eval(${args.join(', ')});`);
    }
    emitOutMerges(e, chip, part, inner, src);
    src.push(`${indent}}`);
  }
}

/** 把 part 的輸出合併到 wire */
function emitOutMerges(e, chip, part, indent, src) {
  for (let opi = 0; opi < part.outWires.length; opi++) {
    const childOut = childOutPin(e, part, opi);
    for (const ow of part.outWires[opi]) {
      const w = wname(chip, ow.wire);
      const s = sub(`__o.${childOut}`, ow.pinLo, ow.n);
      src.push(`${indent}${w} = setBits(${w}, ${ow.destLo}, ${ow.n}, ${s});`);
    }
  }
}

/** top 晶片 class 名稱（供 CLI 編譯後取用） */
function topClassExpr(e) {
  return `${san(e.chips[e.top].name)}Chip`;
}

/***** lib/rt/fmt.js *****/
// 官方 HardwareSimulator 的輸出格式（逐字元對齊 .cmp）
// （對應 _eda/hackrt/src/fmt.rs）

const Kind = { Bin: 'B', Dec: 'D', Hex: 'X', Sym: 'S' };

class OutField {
  constructor(name, kind, a, b, c) {
    this.name = name;
    this.kind = kind;
    this.a = a;
    this.b = b;
    this.c = c;
  }
  width() { return this.a + this.b + this.c; }
}

/** 把文字置中到寬度 w（截斷到 w，奇數餘格放右邊） */
function center(text, w) {
  if (text.length >= w) {
    return text.slice(0, w);
  }
  const left = Math.floor((w - text.length) / 2);
  const right = w - text.length - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

/** 值欄位：二進位零填補到寬度 b（超過則不放開） */
function binField(v, b) {
  let s = (v & 0xffff).toString(2);
  if (s.length >= b) return s;
  return '0'.repeat(b - s.length) + s;
}

/** 值欄位：有號十進位右對齊（寬度 b） */
function decField(v, b) {
  let s = String((v & 0xffff) > 0x7fff ? (v & 0xffff) - 0x10000 : (v & 0xffff));
  if (s.length >= b) return s;
  return ' '.repeat(b - s.length) + s;
}

/** 值欄位：十六進位右對齊（寬度 b） */
function hexField(v, b) {
  let s = (v & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  if (s.length >= b) return s;
  return ' '.repeat(b - s.length) + s;
}

/** 產生表頭列（第一行） */
function headerLine(fields) {
  const body = fields.map((f) => center(f.name, f.width()));
  return `|${body.join('|')}|`;
}

/**
 * 由目前值產生一列資料。
 * `get` 傳回該名稱的值；null 表示未定義（輸出 `***`）。
 * `timeStr` 在 `%S` 欄位（名稱 `time`）使用。
 */
function dataLine(fields, timeStr, get) {
  const body = [];
  for (const f of fields) {
    if (f.kind === Kind.Sym) {
      const txt = f.name === 'time' ? timeStr : '';
      const cell = txt.length >= f.b ? txt : txt.padEnd(f.b);
      body.push(' '.repeat(f.a) + cell + ' '.repeat(f.c));
      continue;
    }
    const v = get(f.name);
    if (v === null || v === undefined) {
      body.push('*'.repeat(f.width()));
      continue;
    }
    const cell = f.kind === Kind.Bin ? binField(v, f.b)
      : f.kind === Kind.Dec ? decField(v, f.b)
      : hexField(v, f.b);
    body.push(' '.repeat(f.a) + cell + ' '.repeat(f.c));
  }
  return `|${body.join('|')}|`;
}

/***** lib/rt/tst.js *****/
// `.tst` 測試腳本的解析與執行（對應 _eda/hackrt/src/tst.rs）
//
// 支援：load、output-file、compare-to、output-list、set、eval、tick、tock、
// output、repeat、while、echo、clear-echo、`<chip> load <file>`。
// 指令用 `,` 或 `;` 分隔；repeat/while 的區塊用 `{ }`。


/** 腳位引用：Whole（無括號或 `[]`）｜ Bit(i)（`[i]`） */
class PinRef {
  constructor(name, idx) {
    this.name = name;
    this.idx = idx; // { kind:'Whole' } | { kind:'Bit', i }
  }
  raw() {
    if (this.idx.kind === 'Whole') return this.name;
    return `${this.name}[${this.idx.i}]`;
  }
  static parse(s) {
    const open = s.indexOf('[');
    if (open >= 0) {
      const close = s.indexOf(']', open);
      const inner = s.slice(open + 1, close < 0 ? s.length : close).trim();
      let idx = { kind: 'Whole' };
      if (inner !== '') {
        const n = Number(inner);
        if (Number.isFinite(n)) idx = { kind: 'Bit', i: n };
      }
      return new PinRef(s.slice(0, open), idx);
    }
    return new PinRef(s, { kind: 'Whole' });
  }
}

/** 把 `%B..`、`%X..`、十進位（含負數）解析成 u16 */
function parseVal(s) {
  const t = s.trim();
  if (t.startsWith('%B')) {
    const v = parseInt(t.slice(2), 2);
    return Number.isFinite(v) ? (v & 0xffff) : null;
  }
  if (t.startsWith('%X')) {
    const v = parseInt(t.slice(2), 16);
    return Number.isFinite(v) ? (v & 0xffff) : null;
  }
  const i = Number(t);
  if (!Number.isFinite(i)) return null;
  return ((i % 0x10000) + 0x10000) % 0x10000;
}

/** 原始掃描結果：文字區塊，`{`/`}` 各自成塊 */
const Raw = {};

/** 把來源切成 Raw 序列。`"..."` 字串會保留原樣，`,` `;` `{` `}` 都是分隔符 */
function lexRaw(src) {
  const out = [];
  let buf = '';
  let inStr = false;
  for (const c of src) {
    if (inStr) {
      buf += c;
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      buf += c;
      inStr = true;
      continue;
    }
    if (c === ',' || c === ';' || c === '{' || c === '}') {
      const t = buf.trim();
      if (t !== '') out.push({ kind: 'Text', s: t });
      buf = '';
      if (c === '{') out.push({ kind: 'Open' });
      if (c === '}') out.push({ kind: 'Close' });
      continue;
    }
    buf += c;
  }
  const t = buf.trim();
  if (t !== '') out.push({ kind: 'Text', s: t });
  return out;
}

/** 移除 `//` 行註解（保留 `"..."` 字串內的字元） */
function stripComments(src) {
  let out = '';
  let inStr = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === '"') inStr = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const TST_KEYWORDS = ['set', 'echo', 'repeat', 'while', 'eval', 'tick', 'tock',
  'output', 'clear-echo', 'compare-to', 'output-file', 'output-list', 'load'];

/** 把指令文字轉成 Step（block 給 repeat/while） */
function parseStepText(cmd, block) {
  cmd = cmd.trim().replace(/,+$/, '');
  if (cmd === '') return null;

  if (cmd.startsWith('repeat ')) {
    const n = Number(cmd.slice('repeat '.length).trim());
    if (!Number.isInteger(n) || n < 0) throw new Error(`repeat 數值錯誤：${cmd.slice(8)}`);
    if (!block) throw new Error('repeat 後面缺少 { ... }');
    return { type: 'Repeat', n, body: block };
  }

  if (cmd.startsWith('while ')) {
    if (!block) throw new Error('while 後面缺少 { ... }');
    const parts = cmd.slice('while '.length).trim().split(/\s+/);
    if (parts.length !== 3) throw new Error(`while 條件格式錯誤：${cmd.slice(6)}`);
    let op;
    if (parts[1] === '<>') op = 'Ne';
    else if (parts[1] === '=' || parts[1] === '==') op = 'Eq';
    else throw new Error(`不支援的 while 運算子: ${parts[1]}`);
    const val = parseVal(parts[2]);
    if (val === null) throw new Error(`while 值解析失敗：${parts[2]}`);
    return { type: 'While', name: parts[0], op, val, body: block, limit: 100_000 };
  }

  // `<chip> load <file>`：ROM32K load Add.hack
  const sp = cmd.indexOf(' load ');
  if (sp >= 0) {
    const prefix = cmd.slice(0, sp).trim();
    const first = cmd.split(/\s+/)[0] || '';
    const kw = TST_KEYWORDS;
    const file = cmd.slice(sp + ' load '.length).trim().replace(/,+$/, '');
    const chipOk = prefix !== '' && !/\s/.test(prefix) && prefix === first && !kw.includes(first);
    if (chipOk && file !== '') {
      return { type: 'LoadRom', file };
    }
  }

  switch (cmd) {
    case 'eval': return { type: 'Eval' };
    case 'tick': return { type: 'Tick' };
    case 'tock': return { type: 'Tock' };
    case 'output': return { type: 'Output' };
    case 'clear-echo': return { type: 'ClearEcho' };
  }
  if (cmd.startsWith('set ')) {
    const [pin, val] = parseSet(cmd.slice(4));
    return { type: 'Set', pin, val };
  }
  if (cmd.startsWith('echo')) {
    const s = cmd.slice(4).trim().replace(/^"|"$/g, '');
    return { type: 'Echo', msg: s };
  }
  throw new Error(`無法辨識的指令：${cmd}`);
}

function parseSet(rest) {
  rest = rest.trim();
  const sp = rest.search(/\s/);
  if (sp < 0) throw new Error(`set 格式錯誤：${rest}`);
  const pinname = rest.slice(0, sp);
  const valstr = rest.slice(sp);
  const val = parseVal(valstr);
  if (val === null) throw new Error(`set 值解析失敗：${valstr}`);
  return [PinRef.parse(pinname), val];
}

/** 從 index 開始解析指令序列。stopOnClose=true：遇到 `}` 就停止。 */
function parseSeq(raws, index, stopOnClose) {
  const steps = [];
  let i = index;
  while (i < raws.length) {
    const r = raws[i];
    if (r.kind === 'Open') throw new Error('意外的 {');
    if (r.kind === 'Close') {
      if (stopOnClose) return [steps, i + 1];
      throw new Error('意外的 }');
    }
    if (r.kind === 'Text') {
      const trimmed = r.s.trim();
      if (i + 1 < raws.length && raws[i + 1].kind === 'Open'
        && (trimmed.startsWith('repeat') || trimmed.startsWith('while'))) {
        const [block, next] = parseSeq(raws, i + 2, true);
        const step = parseStepText(trimmed, block);
        if (step) steps.push(step);
        i = next;
        continue;
      }
      const step = parseStepText(trimmed, null);
      if (step) steps.push(step);
      i += 1;
    }
  }
  if (stopOnClose) throw new Error('區塊沒有配對的 }');
  return [steps, i];
}

/** 解析 `output-list` 的文字內容（不含前綴） */
function parseOutputListFields(s) {
  const fields = [];
  let p = 0;
  while (p < s.length) {
    while (p < s.length && !/[A-Za-z0-9_]/.test(s[p])) p += 1;
    if (p >= s.length) break;
    const start = p;
    while (p < s.length && /[A-Za-z0-9_\[\]]/.test(s[p])) p += 1;
    const name = s.slice(start, p);
    if (p >= s.length || s[p] !== '%') {
      throw new Error(`output-list 欄位格式錯誤：${name}（缺 %）`);
    }
    p += 1;
    const kc = s[p].toUpperCase();
    const kind = kc === 'B' ? 'B' : kc === 'D' ? 'D' : kc === 'X' ? 'X' : kc === 'S' ? 'S'
      : (() => { throw new Error(`output-list 不支援的格式 ${kc}（${name}）`); })();
    p += 1;
    const readNum = () => {
      const st = p;
      while (p < s.length && /[0-9]/.test(s[p])) p += 1;
      const n = Number(s.slice(st, p));
      if (!Number.isFinite(n)) throw new Error('output-list 數字解析失敗');
      return n;
    };
    const a = readNum();
    if (p >= s.length || s[p] !== '.') throw new Error(`output-list ${name} 缺 a.b.c`);
    p += 1;
    const b = readNum();
    if (p >= s.length || s[p] !== '.') throw new Error(`output-list ${name} 缺 a.b.c`);
    p += 1;
    const c = readNum();
    if (p < s.length && s[p] === ',') p += 1;
    fields.push({ field: new OutField(name.trim(), kind, a, b, c), pin: PinRef.parse(name) });
  }
  if (fields.length === 0) throw new Error('output-list 沒有欄位');
  return fields;
}

/** 解析整個腳本 */
function parseScript(src) {
  const raws = lexRaw(stripComments(src));
  const script = { load: null, outputFile: null, compareTo: null, outputList: [], romLoad: null, steps: [] };
  const steps = [];
  let i = 0;
  while (i < raws.length) {
    const r = raws[i];
    if (r.kind === 'Close') throw new Error('意外的 }');
    if (r.kind === 'Open') throw new Error('意外的 {');
    const trimmed = r.s.trim();
    if (trimmed.startsWith('output-list')) {
      script.outputList = parseOutputListFields(trimmed.slice('output-list'.length));
      i += 1;
      continue;
    }
    let handled = false;
    for (const kw of ['output-file', 'compare-to', 'load', 'rom-load']) {
      if (trimmed.startsWith(kw)) {
        let value = trimmed.slice(kw.length).trim().replace(/,+$/, '');
        if (kw === 'output-file') script.outputFile = value;
        else if (kw === 'compare-to') script.compareTo = value;
        else if (kw === 'load') { if (!value.endsWith('.tst')) script.load = value; }
        else if (kw === 'rom-load') script.romLoad = value;
        handled = true;
        break;
      }
    }
    if (handled) { i += 1; continue; }
    if (i + 1 < raws.length && raws[i + 1].kind === 'Open') {
      const [block, next] = parseSeq(raws, i + 2, true);
      const step = parseStepText(trimmed, block);
      if (step) steps.push(step);
      i = next;
      continue;
    }
    const [more, next] = parseSeq(raws, i, false);
    steps.push(...more);
    i = next;
  }
  script.steps = steps;
  return script;
}

class RunErr extends Error {
  constructor(line, msg) {
    super(`第 ${line} 行：${msg}`);
    this.line = line;
    this.msg = msg;
  }
}

/**
 * 執行測試：`.out` 內容寫進 out，並依 output-file/compare-to 產檔與比對。
 * baseDir：腳本中所有相對路徑的基準。
 */
function run(model, script, baseDir, out, verbose) {
  if (script.outputList.length > 0) {
    const fields = script.outputList.map((f) => f.field);
    out.push(headerLine(fields) + '\n');
  }
  if (verbose) console.error(`load ${script.load ?? '(none)'}`);
  if (script.romLoad) {
    model.loadRom(path.join(baseDir, script.romLoad));
  }
  const st = { cycle: 0, half: false };
  runSteps(model, script, script.steps, baseDir, out, st, verbose);
  if (script.outputFile) {
    const outPath = path.join(baseDir, script.outputFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, out.join(''));
    if (script.compareTo) {
      const cmpPath = path.join(baseDir, script.compareTo);
      reportCompare(outPath, cmpPath, verbose);
    }
  }
}

function runSteps(model, script, steps, baseDir, out, st, verbose) {
  for (const step of steps) {
    switch (step.type) {
      case 'Set': {
        if (!model.setInput(step.pin.raw(), step.val)) {
          throw new RunErr(0, `set 失敗：找不到輸入腳 ${step.pin.raw()}`);
        }
        break;
      }
      case 'LoadRom':
        model.loadRom(path.join(baseDir, step.file));
        break;
      case 'Eval':
        model.doEval();
        break;
      case 'Tick':
        model.tick();
        st.half = true;
        break;
      case 'Tock':
        model.tock();
        st.half = false;
        st.cycle += 1;
        break;
      case 'Output': {
        const timeStr = `${st.cycle}${st.half ? '+' : ''}`;
        if (script.outputList.length > 0) {
          const fields = script.outputList.map((f) => f.field);
          const line = dataLine(fields, timeStr, (n) => model.getOutput(n));
          out.push(line + '\n');
        }
        break;
      }
      case 'Repeat':
        for (let k = 0; k < step.n; k++) {
          runSteps(model, script, step.body, baseDir, out, st, verbose);
        }
        break;
      case 'While': {
        let iters = 0;
        for (;;) {
          const cur = model.getOutput(step.name) ?? 0;
          const matched = step.op === 'Ne' ? cur !== step.val : cur === step.val;
          if (!matched) break;
          iters += 1;
          if (iters > step.limit) {
            throw new RunErr(0, `while ${step.name} 迴圈次數超過上限 ${step.limit}`);
          }
          runSteps(model, script, step.body, baseDir, out, st, verbose);
        }
        break;
      }
      case 'Echo':
        if (verbose) console.error(step.msg);
        break;
      case 'ClearEcho':
        break;
    }
  }
}

/** 比對 .out 與 .cmp，把結果印到 stdout/stderr */
function reportCompare(outPath, cmpPath, verbose) {
  const outText = fs.readFileSync(outPath, 'utf8');
  const cmpText = fs.readFileSync(cmpPath, 'utf8');
  const outLines = outText.split('\n');
  const cmpLines = cmpText.split('\n');
  // 檔尾換行與否無關內容：把兩邊最後的空串去除（Rust 用 lines() 也如此）
  while (outLines.length > 0 && outLines[outLines.length - 1] === '') outLines.pop();
  while (cmpLines.length > 0 && cmpLines[cmpLines.length - 1] === '') cmpLines.pop();
  let bad = 0;
  const n = Math.min(outLines.length, cmpLines.length);
  for (let i = 0; i < n; i++) {
    if (outLines[i].trimEnd() !== cmpLines[i].trimEnd()) {
      bad += 1;
      if (bad <= 5 || verbose) {
        console.error(`  第 ${i + 1} 行不符：`);
        console.error(`    out: ${JSON.stringify(outLines[i])}`);
        console.error(`    cmp: ${JSON.stringify(cmpLines[i])}`);
      }
    }
  }
  const lineMismatch = outLines.length !== cmpLines.length;
  if (lineMismatch) {
    console.error(`  行數不符：out=${outLines.length} cmp=${cmpLines.length}`);
  }
  if (bad === 0 && !lineMismatch) {
    console.log(`PASS ${cmpPath}`);
    return;
  }
  console.log(`FAIL ${cmpPath}（${Math.max(bad, 1)} 行不符）`);
  throw new RunErr(0, `與 ${cmpPath} 比對失敗`);
}

/***** lib/rt/model.js *****/
// 頂層晶片的 runtime 包裝（對應 _eda/hackrt/src/main.rs 的 Wrap<Top>）
// 負責：輸入/輸出以 pin 名稱操作、tick/tock、outM/writeM 特例、
//        PinRef 探測（RAM/螢幕等記憶體對映腳位）、load_program。

class TopModel {
  /**
   * @param {Function} TopClass 產出的 top 晶片 class
   * @param {object} chip ElabChip（提供 inPins/outPins/hasState）
   * @param {Function} evalInRaw evaluate 用的參考實作（測試用，可省略）
   */
  constructor(TopClass, chip) {
    this.chip = new TopClass();
    this.inPins = chip.inPins.map((p) => p.name);
    this.outPins = chip.outPins.map((p) => p.name);
    this.ins = Object.fromEntries(this.inPins.map((n) => [n, 0]));
    this.outs = Object.fromEntries(this.outPins.map((n) => [n, undefined]));
    this.hasState = chip.hasState;
    this.time = 0;
  }

  /** 由輸入 pin 名稱取值（未定義回 0） */
  getIn(name) {
    return (this.ins[name] ?? 0) & 0xffff;
  }

  getInNames() {
    return this.inPins;
  }

  getOutNames() {
    return this.outPins;
  }

  /** 由輸出 pin 名稱取值；outM 特例：writeM==0 時回 undefined */
  getOut(name) {
    if (name === 'outM' && this.outPins.includes('writeM')) {
      if (this.getOut('writeM') === 0) return undefined;
    }
    return this.outs[name] ?? 0;
  }

  /** 設定：outM 特例寫入（writeM==1） */
  setOut(name, val) {
    if (name !== 'outM') return;
    if (this.getOut('writeM') !== 1 && this.outPins.includes('writeM')) {
      throw new Error(`${name}: 試圖寫入，但 writeM 不是 1`);
    }
    this.outs[name] = val & 0xffff;
  }

  /** 把 `<pin> = val` 寫進輸入：支援 PinRef 或純字串（`a`、`RAM[3]`） */
  setInput(pin, val) {
    const name = typeof pin === 'string' ? pin : pin.raw();
    if (name.includes('[')) {
      return this.setIdx(name, val);
    }
    if (this.inPins.includes(name)) {
      this.ins[name] = val & 0xffff;
      return true;
    }
    return this.chip.set_whole ? this.chip.set_whole(name, val) ?? false : false;
  }

  setIdx(raw, val) {
    const m = raw.match(/^(\w+)\[(\d+)\]$/);
    if (!m) return false;
    const name = m[1];
    const idx = Number(m[2]);
    if (this.inPins.includes(name)) {
      const bitMask = 1 << idx;
      this.ins[name] = ((this.ins[name] ?? 0) & ~bitMask) | ((val & 1) << idx);
      return true;
    }
    return this.chip.set_probe ? this.chip.set_probe(name, idx, val) ?? false : false;
  }

  /** evaluate：算出組合輸出 */
  doEval() {
    const args = this.inPins.map((n) => this.getIn(n));
    this.outs = this.chip.eval(...args);
  }

  /** tick：master 半週期──取樣有狀態晶片，然後重新求值組合輸出（DFF 仍是舊值） */
  tick() {
    if (this.hasState) {
      const args = this.inPins.map((n) => this.getIn(n));
      this.chip.sample(...args);
    }
    this.doEval();
  }

  /** tock：slave 半週期──提交狀態，然後重新求值輸出 */
  tock() {
    if (this.chip.tock) this.chip.tock();
    this.doEval();
    this.time += 1;
  }

  /** 寫入程式（ROM32K load）；回傳原本成功與否 */
  loadRom(p) {
    if (!this.chip.load_program) return false;
    try {
      return this.chip.load_program(p);
    } catch (e) {
      return false;
    }
  }

  /** 由 pin 名稱取值：輸出、輸入、探測（RAM/Screen/Keyboard 記憶體對映）。對應 Rust Wrap::get_output */
  getOutput(name) {
    const pr = PinRef.parse(name);
    if (pr.idx.kind === 'Whole') {
      if (this.outPins.includes(pr.name)) return this.getOut(pr.name);
      if (this.inPins.includes(pr.name)) return this.getIn(pr.name);
      return this.chip.probe_whole ? this.chip.probe_whole(pr.name) ?? undefined : undefined;
    }
    // Bit(i)：探測（`RAM16K[0]`、`ARegister[0]`、`PC[]` 整根）
    return this.chip.probe_indexed ? this.chip.probe_indexed(pr.name, pr.idx.i) ?? undefined : undefined;
  }

  now() {
    return this.time;
  }
}

/***** exports *****/
(function (win) {
  win.HackVM = {
    Vm,
    SCREEN_BASE, SCREEN_WORDS, SCREEN_ROWS, SCREEN_COLS, KBD_ADDR, RAM_WORDS,
    KEY_NEWLINE, KEY_BACKSPACE, KEY_LEFT, KEY_UP, KEY_RIGHT, KEY_DOWN,
  };
  win.HackAsm = { D_MAP, C_MAP, J_MAP, PREDEFINED, parseAsmLine, code2binary, assemble };
  win.HackVm2Asm = { translate };
  win.HackJack2Vm = { compileJack };
  win.HackHdl = {
    parseHdl,
    loadLibrary, mergeLibs, mergeLibsList, elab, Builtin,
    generateJs, topClassExpr, pinSan,
    parseScript, run,
    TopModel,
  };
})(window);
