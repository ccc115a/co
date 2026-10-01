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

/***** lib/riscv/vm2riscv.js *****/
// VM → RISC-V 組語翻譯器（對應 lib/asm/vm2asm.js 的 RV32 版本）
//
// 目標：riscv/_web_tools 的 rvasm（RV32I+M）＋ rvemu；只用兩邊都懂的子集：
//   真指令 add/sub/slt/sltiu/and/or/xor/xori/lw/sw/addi/lui/jal/jalr/beq/bne/mul/div/ecall，
//   偽指令 li/mv/j/jr/ret/call，指示 .text/.word，註解 `#`。
// 每行 VM 前加 `# ` 註解、多檔才寫 bootstrap、return label 用全域計數器（與 vm2asm 同慣例）。
// 多檔（bootstrap）模式下，`label/goto/if-goto` 標記加 `函式$` 前綴避免跨檔相撞。
//
// 暫存器／記憶體約定（rvemu 是統一編址、程式從 0 載入；資料區放固定位址避開程式）：
//   s1＝VM SP（byte 位址，初值 STACK_BASE，向上成長，每 push＋4）
//   s2＝LCL、s3＝ARG、s4＝THIS、s5＝THAT（byte 位址；THIS/THAT 同 Hack 存的是基址）
//   t0,t1,t2＝scratch；其餘暫存器不用。
//   temp 0..7 → TEMP_BASE＋4*i；static（第 k 個輸入檔的變數 i）→ STATIC_BASE＋k*STRIDE＋4*i。
//   真值沿用 Hack/Jack 慣例：true＝-1（0xffffffff）、false＝0。
//   整數語意為 32-bit（Hack 原生 16-bit；本鏈路小數值行為一致，大數 wrap 位寬不同）。
// 注意：只用「數字版」li（rvasm 對 `li rd, label` 的 pass1 佔位與 pass2 實際字數可能不一致，
//   小位址標籤會留下 0x00000000 非法字——故 return 地址走 ra 壓棧、static 走固定位址，
//   全程不出現符號版 li）。程式本體須小於 TEMP_BASE（28KB；noOS 課程程式約 1–2KB）。
//
// 函式呼叫沿用 Hack VM 幀格式（return/LCL/ARG/THIS/THAT＋ARG/LCL 重定位），
// return 地址是 jal 寫入 ra 後壓進 VM 堆疊保存，返回時 `jalr x0, 0(t1)`（不依賴 ra 當下值，
// 巢狀呼叫安全）。
// Math.multiply／Math.divide 內聯為 M 擴充 mul／div（Jack 小整數行為一致）；
// Output.printChar／printInt／println／printString 內聯為 UART 輸出（ecall a7=1，
// gen/os_src 的 Output 是空殼，內聯後 Seven 等的 print 真正看得到；void 語意照推 0）。
// 其餘 OS 呼叫（Memory.*、String.*、Screen.* …）嚴格模式直接 throw，
// 顯示模式（translate 第二參數 { lenient: true }）照發 jal 並列在表頭僅供檢視。
//
// 注意：本檔包在 Vm2Rv 命名空間 IIFE 內——tools/embed.js 會把 lib/ 全部剝掉 import/export
// 拼進同一全域作用域，本檔的 translate/trim/scope 等與 lib/asm/vm2asm.js 同名，
// 不包起來會互相覆蓋（前例：tst.js 的 KEYWORDS 改名 TST_KEYWORDS）。

const Vm2Rv = (() => {
// 記憶體布局（byte 位址；rvemu 預設 256KB＝0x40000；程式從 0 載入，須＜TEMP_BASE）：
//   程式本體 …………… 0x00000 起（Seven+OS 約 20KB、Pong+OS 約 34KB，上限 64KB）
//   temp 0..7 ………… TEMP_BASE＝0x10000＋4*i；UART_BUF（printInt 數字暫存）在＋32
//   static（第 k 檔變數 i）… STATIC_BASE＝0x11000＋k*0x400＋4*i（≤32 檔，每檔 ≤256）
//   VM 堆疊（s1＝SP，向上）… STACK_BASE＝0x1C000 起（到 MIRROR 約 16KB）
//   Jack 位址鏡像 …… MIRROR_BASE＋4*W：Jack 的 word 位址 W（含 heap/SCREEN/KBD）
//     對應的 RV byte 位址（heap words 2048..16383、SCREEN 16384..、KBD 24576 全落
//     在 0x20000..0x38000，與程式/堆疊/static 皆不相交）
const TEMP_BASE = 0x10000;
const UART_BUF = 0x10020;
const STATIC_BASE = 0x11000;
const STATIC_STRIDE = 0x400; // 每檔 256 個 static（0x400 bytes）
const STACK_BASE = 0x1C000;
const MIRROR_BASE = 0x20000;
const MAX_FILES = 32;
const MAX_STATIC = 255;

let label_count = 0;
let return_count = 0;
let aux_count = 0;
let current_file = '';
let scope = false;
let cur_func = '';

const definedFuncs = new Set();
const calledFuncs = new Set();
const fileIndex = new Map(); // sanitized file -> 輸入順序 k（static 位址用）
const externalCalls = new Set(); // lenient 模式下未定義的 OS 呼叫（僅顯示用）
let lenient = false;

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

function sanFile(fn) {
  const s = fn.replace(/\\/g, '/');
  const base = s.slice(s.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '');
  const clean = base.replace(/[^A-Za-z0-9_]/g, '_') || 'File';
  return /^[0-9]/.test(clean) ? `F_${clean}` : clean;
}

function fileIdx(file) {
  let k = fileIndex.get(file);
  if (k === undefined) {
    k = fileIndex.size;
    if (k >= MAX_FILES) throw new Error(`輸入檔超過 ${MAX_FILES} 個：${file}`);
    fileIndex.set(file, k);
  }
  return k;
}

function staticAddr(file, i) {
  if (i > MAX_STATIC) throw new Error(`static 索引超出 0..${MAX_STATIC}：${file} ${i}`);
  return STATIC_BASE + fileIdx(file) * STATIC_STRIDE + i * 4;
}

// ---- 堆疊原語（t0 持有值） ----
function emitPush(out) {
  out.push('sw t0, 0(s1)', 'addi s1, s1, 4');
}

function emitPopTo(out, reg) {
  out.push('addi s1, s1, -4', `lw ${reg}, 0(s1)`);
}

function writeArithmetic(out, command) {
  switch (command) {
    case 'add':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('add t0, t0, t1');
      emitPush(out);
      break;
    case 'sub':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('sub t0, t0, t1');
      emitPush(out);
      break;
    case 'neg':
      out.push('lw t0, -4(s1)', 'sub t0, x0, t0', 'sw t0, -4(s1)');
      break;
    case 'and':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('and t0, t0, t1');
      emitPush(out);
      break;
    case 'or':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('or t0, t0, t1');
      emitPush(out);
      break;
    case 'not':
      out.push('lw t0, -4(s1)', 'xori t0, t0, -1', 'sw t0, -4(s1)');
      break;
    case 'eq':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('sub t0, t0, t1', 'sltiu t0, t0, 1', 'sub t0, x0, t0');
      emitPush(out);
      break;
    case 'gt': // x > y ⟺ y < x（有號）
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('slt t0, t1, t0', 'sub t0, x0, t0');
      emitPush(out);
      break;
    case 'lt':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('slt t0, t0, t1', 'sub t0, x0, t0');
      emitPush(out);
      break;
    default:
      throw new Error(`不支援的運算指令：${command}`);
  }
}

const SEG_BASE = { local: 's2', argument: 's3', this: 's4', that: 's5' };

function writePush(out, segment, index) {
  if (!Number.isInteger(index) || index < 0) throw new Error(`push 索引須為非負整數：${segment} ${index}`);
  if (segment === 'constant') {
    out.push(`li t0, ${index}`);
    emitPush(out);
  } else if (segment === 'local' || segment === 'argument') {
    out.push(`li t1, ${index * 4}`, `add t1, ${SEG_BASE[segment]}, t1`, 'lw t0, 0(t1)');
    emitPush(out);
  } else if (segment === 'this' || segment === 'that') {
    // Jack 位址是 Hack word 位址；RV byte 位址＝MIRROR_BASE＋4*base＋4*index
    // （含 heap/SCREEN/KBD/OOM 絕對位址，pointer 持有的是 word 值本身）
    out.push(`li t2, ${MIRROR_BASE + index * 4}`, `slli t1, ${SEG_BASE[segment]}, 2`);
    out.push('add t1, t1, t2', 'lw t0, 0(t1)');
    emitPush(out);
  } else if (segment === 'temp') {
    if (index > 7) throw new Error(`temp 索引超出 0..7：${index}`);
    out.push(`li t1, ${TEMP_BASE + index * 4}`, 'lw t0, 0(t1)');
    emitPush(out);
  } else if (segment === 'pointer') {
    if (index !== 0 && index !== 1) throw new Error(`pointer 索引須為 0 或 1：${index}`);
    out.push(index === 0 ? 'addi t0, s4, 0' : 'addi t0, s5, 0');
    emitPush(out);
  } else if (segment === 'static') {
    out.push(`li t1, ${staticAddr(current_file, index)}`, 'lw t0, 0(t1)');
    emitPush(out);
  } else {
    throw new Error(`不支援的 segment：${segment}`);
  }
}

function writePop(out, segment, index) {
  if (!Number.isInteger(index) || index < 0) throw new Error(`pop 索引須為非負整數：${segment} ${index}`);
  if (segment === 'local' || segment === 'argument') {
    out.push(`li t1, ${index * 4}`, `add t1, ${SEG_BASE[segment]}, t1`);
    emitPopTo(out, 't0');
    out.push('sw t0, 0(t1)');
  } else if (segment === 'this' || segment === 'that') {
    out.push(`li t2, ${MIRROR_BASE + index * 4}`, `slli t1, ${SEG_BASE[segment]}, 2`);
    out.push('add t1, t1, t2');
    emitPopTo(out, 't0');
    out.push('sw t0, 0(t1)');
  } else if (segment === 'temp') {
    if (index > 7) throw new Error(`temp 索引超出 0..7：${index}`);
    out.push(`li t1, ${TEMP_BASE + index * 4}`);
    emitPopTo(out, 't0');
    out.push('sw t0, 0(t1)');
  } else if (segment === 'pointer') {
    if (index !== 0 && index !== 1) throw new Error(`pointer 索引須為 0 或 1：${index}`);
    emitPopTo(out, 't0');
    out.push(index === 0 ? 'addi s4, t0, 0' : 'addi s5, t0, 0');
  } else if (segment === 'static') {
    out.push(`li t1, ${staticAddr(current_file, index)}`);
    emitPopTo(out, 't0');
    out.push('sw t0, 0(t1)');
  } else {
    throw new Error(`不支援的 segment：${segment}`);
  }
}

function labelName(arg) {
  return scope && cur_func !== '' ? `${cur_func}$${arg}` : arg;
}

function writeLabel(out, label) {
  out.push(`${labelName(label)}:`);
}

function writeGoto(out, label) {
  out.push(`jal x0, ${labelName(label)}`);
}

function writeIfGoto(out, label) {
  emitPopTo(out, 't0');
  out.push(`bne t0, x0, ${labelName(label)}`);
}

function writeFunction(out, funcName, numLocals) {
  if (!Number.isInteger(numLocals) || numLocals < 0) throw new Error(`function 區域變數數須為非負整數：${funcName} ${numLocals}`);
  definedFuncs.add(funcName);
  out.push(`${funcName}:`);
  // 呼叫者已留好 5 格幀（含 return 槽位 placeholder）；jal 寫入 ra 的正是返回位址，在此回填
  out.push('sw ra, -20(s2)');
  for (let i = 0; i < numLocals; i++) {
    out.push('li t0, 0');
    emitPush(out);
  }
}

// Output.printChar／printInt／println／printString 內聯為 UART 輸出（ecall a7=1）。
// 用到 a0-a3 作暫存（呼叫者保存、瞬時使用安全）；t0/t1/t2 照 scratch 用。
// void 語意：結尾推 0（呼叫端 do 敘述會 pop temp 0 丟掉，與正常 void 函式一致）。
function writeOutputInline(out, funcName, numArgs) {
  const need = { 'Output.printChar': 1, 'Output.printInt': 1, 'Output.println': 0, 'Output.printString': 1 }[funcName];
  if (numArgs !== need) throw new Error(`${funcName} 參數須為 ${need}，得 ${numArgs}`);
  const L = `out${aux_count++}`;
  if (funcName === 'Output.printChar') {
    emitPopTo(out, 't0');
    out.push('addi a0, t0, 0', 'li a7, 1', 'ecall');
  } else if (funcName === 'Output.println') {
    out.push('li a0, 10', 'li a7, 1', 'ecall');
  } else if (funcName === 'Output.printInt') {
    emitPopTo(out, 't0');
    out.push(`li t1, ${UART_BUF}`);
    out.push(`bge t0, x0, pint_pos_${L}`);
    out.push('li a0, 45', 'li a7, 1', 'ecall'); // '-'
    out.push('sub t0, x0, t0');
    out.push(`pint_pos_${L}:`);
    out.push(`bne t0, x0, pint_div_${L}`);
    out.push('li a0, 48', 'li a7, 1', 'ecall'); // '0'
    out.push(`jal x0, pint_done_${L}`);
    out.push(`pint_div_${L}:`);
    out.push('li a1, 0'); // 位數
    out.push(`pint_d_${L}:`);
    out.push('li a2, 10', 'remu a3, t0, a2', 'divu t0, t0, a2', 'addi a3, a3, 48');
    out.push('sw a3, 0(t1)', 'addi t1, t1, 4', 'addi a1, a1, 1');
    out.push(`bne t0, x0, pint_d_${L}`);
    out.push(`pint_o_${L}:`);
    out.push('addi t1, t1, -4', 'lw a0, 0(t1)', 'li a7, 1', 'ecall');
    out.push('addi a1, a1, -1');
    out.push(`bne a1, x0, pint_o_${L}`);
    out.push(`pint_done_${L}:`);
  } else { // Output.printString：String 物件＝[field0 buffer, field1 buffer_len, field2 str_len]
    emitPopTo(out, 't0'); // s（heap word 位址）
    out.push('slli t1, t0, 2', `li t2, ${MIRROR_BASE}`, 'add t1, t1, t2');
    out.push('lw t2, 0(t1)', 'lw a1, 8(t1)', `li a2, ${MIRROR_BASE}`);
    out.push(`beq a1, x0, pstr_done_${L}`);
    out.push('li a3, 0'); // i
    out.push(`pstr_loop_${L}:`);
    out.push('slli t1, t2, 2', 'add t1, t1, a2', 'slli t0, a3, 2', 'add t1, t1, t0');
    out.push('lw a0, 0(t1)', 'li a7, 1', 'ecall');
    out.push('addi a3, a3, 1');
    out.push(`blt a3, a1, pstr_loop_${L}`);
    out.push(`pstr_done_${L}:`);
  }
  out.push('li t0, 0');
  emitPush(out);
}

function emitCallSeq(out, funcName) {  const ret = `${funcName}$ret.${return_count++}`;
  // 依 Hack 幀格式壓 5 格：第 1 格是 return 槽位，先填 0，由被呼叫者 prologue 回填真正的 ra；
  // 接著壓 LCL/ARG/THIS/THAT（jal 會蓋掉 ra，故不能先 push ra——舊 ra 不是返回位址）
  out.push('li t0, 0');
  emitPush(out);
  for (const r of ['s2', 's3', 's4', 's5']) {
    out.push(`addi t0, ${r}, 0`);
    emitPush(out);
  }
  return ret;
}

function writeCall(out, funcName, numArgs) {
  if (!Number.isInteger(numArgs) || numArgs < 0) throw new Error(`call 參數數須為非負整數：${funcName} ${numArgs}`);
  // OS 內聯：Math.multiply／Math.divide 走 M 擴充，不產生呼叫
  if (funcName === 'Math.multiply' || funcName === 'Math.divide') {
    if (numArgs !== 2) throw new Error(`${funcName} 參數須為 2，得 ${numArgs}`);
    emitPopTo(out, 't1');
    emitPopTo(out, 't0');
    out.push(funcName === 'Math.multiply' ? 'mul t0, t0, t1' : 'div t0, t0, t1');
    emitPush(out);
    return;
  }
  // OS 內聯：Output 顯示走 UART（ecall a7=1），void 語意照推 0 保持堆疊平衡
  // （gen/os_src 的 Output 是空殼；內聯後 Seven 等的 print 真正看得到）
  if (funcName === 'Output.printChar' || funcName === 'Output.printInt'
    || funcName === 'Output.println' || funcName === 'Output.printString') {
    writeOutputInline(out, funcName, numArgs);
    return;
  }
  // OS 呼叫（Memory.* 等）若輸入檔自帶定義（如 OS 全量）就走正常呼叫；
  // 是否支援在翻譯結尾統一判定（未定義才 throw／列外部）。
  calledFuncs.add(funcName);
  const ret = emitCallSeq(out, funcName);
  out.push(`li t0, ${numArgs * 4 + 20}`, 'sub s3, s1, t0', 'addi s2, s1, 0');
  out.push(`jal ra, ${funcName}`);
  out.push(`${ret}:`);
}

function writeReturn(out) {
  // t2＝FRAME（舊 LCL）；t1＝RET（FRAME-20，byte 位移＝5 words）
  out.push('addi t2, s2, 0', 'lw t1, -20(t2)');
  emitPopTo(out, 't0');
  out.push('sw t0, 0(s3)', 'addi s1, s3, 4');
  out.push('lw s5, -4(t2)', 'lw s4, -8(t2)', 'lw s3, -12(t2)', 'lw s2, -16(t2)');
  out.push('jalr x0, 0(t1)');
}

function writeBootstrap(out) {
  out.push('# Bootstrap code', `# Initialize VM SP = ${STACK_BASE} (0x${STACK_BASE.toString(16)})`);
  out.push(`li s1, ${STACK_BASE}`);
  out.push('# Call Sys.init');
  calledFuncs.add('Sys.init');
  const ret = emitCallSeq(out, 'Sys.init');
  out.push('li t0, 20', 'sub s3, s1, t0', 'addi s2, s1, 0');
  out.push('jal ra, Sys.init');
  out.push(`${ret}:`);
  out.push('# Halt (Sys.init 正常不返回；保險起見)');
  out.push('li a0, 0', 'li a7, 10', 'ecall');
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
  current_file = sanFile(filename);
  out.push(`\n# ========== File: ${filename} ==========`);
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = removeComment(raw);
    const trimmed = trim(line);
    if (trimmed.length > 0) {
      out.push(`# ${trimmed}`);
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0];
      const a1 = parts[1] ?? '';
      const a2 = Number.isInteger(Number(parts[2])) && parts[2] !== undefined ? Number(parts[2]) : parts[2] ?? '';
      if ((cmd === 'push' || cmd === 'pop' || cmd === 'function' || cmd === 'call') && !Number.isInteger(a2)) {
        throw new Error(`參數 2 應為整數：${trimmed}`);
      }
      processCommand(out, cmd, a1, a2);
    }
  }
}

/** 翻譯多個 .vm 原始檔 → RISC-V 組語文字。files: [{ path, src }]，多檔時自動加 bootstrap。
 *  opts.lenient＝true 時為「顯示模式」：未定義的 OS 呼叫照發 jal 並列在表頭
 *  （僅供檢視，不可直接組譯執行）；預設嚴格模式直接 throw。 */
function translate(files, opts = {}) {
  label_count = 0;
  return_count = 0;
  aux_count = 0;
  scope = files.length > 1;
  cur_func = '';
  lenient = !!opts.lenient;
  definedFuncs.clear();
  calledFuncs.clear();
  externalCalls.clear();
  fileIndex.clear();
  const out = ['.text'];
  if (files.length > 1) writeBootstrap(out);
  for (const f of files) translateFile(out, f.path, f.src);
  for (const name of calledFuncs) {
    if (definedFuncs.has(name)) continue;
    const isOS = /^(Math|Memory|String|Array|Screen|Keyboard|Output)\./.test(name);
    if (lenient) {
      if (isOS) externalCalls.add(name); // 顯示模式：已照發 jal，表頭列為外部未定義
      continue;
    }
    if (isOS) {
      throw new Error(`不支援的 OS 呼叫（僅內聯 Math.multiply／Math.divide＋Output.printChar／printInt／println／printString）：${name}`);
    }
    throw new Error(`未定義函式：${name}（輸入 .vm 缺少對應 function，或屬尚未支援的 OS 呼叫）`);
  }
  if (lenient && externalCalls.size > 0) {
    out.splice(1, 0,
      '# 注意：以下外部呼叫無對應 function 定義，本 .s 僅供檢視，不可直接組譯執行：',
      ...[...externalCalls].sort().map((n) => `#   外部：${n}`));
  }
  return out.join('\n') + '\n';
}

return { translate, STACK_BASE, TEMP_BASE, UART_BUF, STATIC_BASE, STATIC_STRIDE, MIRROR_BASE };
})();


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
  Rom32w: 'ROM32',     // 32-bit word 程式記憶體（Riscv32 用）
  Ram32w: 'RAM32W',    // 32-bit word 資料記憶體（Riscv32 用）
  Rf32: 'RF32',        // 32×32 暫存器檔（Riscv32 用）
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
  ROM32: 'Rom32w',
  RAM32W: 'Ram32w',
  RF32: 'Rf32',
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
    case Builtin.Rom32w:
      return [[{ name: 'address', width: 15 }], [{ name: 'out', width: 32 }]];
    case Builtin.Ram32w:
      return [
        [{ name: 'in', width: 32 }, { name: 'load', width: 1 }, { name: 'address', width: 15 }],
        [{ name: 'out', width: 32 }],
      ];
    case Builtin.Rf32:
      return [
        [
          { name: 'a1', width: 5 }, { name: 'a2', width: 5 }, { name: 'a3', width: 5 },
          { name: 'rd', width: 5 }, { name: 'wd', width: 32 }, { name: 'we', width: 1 },
        ],
        [{ name: 'd1', width: 32 }, { name: 'd2', width: 32 }, { name: 'd3', width: 32 }],
      ];
  }
}

/** 是否為有狀態（clocked）晶片 */
function builtinSequential(b) {
  return b === Builtin.Dff || b === Builtin.ARegister || b === Builtin.DRegister || b === Builtin.Screen
    || b === Builtin.Ram32w || b === Builtin.Rf32;
}

class ElabError extends Error {
  constructor(msg) { super(msg); this.msg = msg; }
}

function mask(n) {
  return n >= 32 ? 0xffffffff : (1 << n) - 1;
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
  if (n >= 32) return expr;
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
    case Builtin.Rom32w: return 'Rom32WChip';
    case Builtin.Ram32w: return 'Ram32WChip';
    case Builtin.Rf32: return 'Rf32Chip';
  }
}

/** 內建晶片多輸出 pin 的欄位名（RF32 有 d1/d2/d3；其餘單一 out） */
function builtinOutField(b, opi) {
  if (b === Builtin.Rf32) return ['d1', 'd2', 'd3'][opi] ?? 'out';
  return 'out';
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
  const pats = [part.label];
  if (part.clip.kind === 'Builtin' && part.clip.b === Builtin.Screen) {
    pats.push('SCREEN', 'Screen');
  }
  if (part.clip.kind === 'Builtin' && part.clip.b === Builtin.Keyboard) {
    pats.push('KBD', 'Keyboard');
  }
  const uniq = [...new Set(pats)];
  return uniq.map((p) => `name === ${JSON.stringify(p)}`).join(' || ');
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
  return builtinOutField(part.clip.b, opi);
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
  src.push('  const mask = n >= 32 ? 0xffffffff : ((1 << n) - 1);');
  src.push('  return ((w & (~(mask << lo) & 0xffffffff)) | ((val & mask) << lo)) & 0xffffffff;');
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
  src.push('  probe_width(name) { return 1; }');
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
    src.push('  probe_width(name) { return 16; }');
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
    src.push('  probe_width(name) { return 16; }');
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
    src.push('  probe_width(name) { return 16; }');
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
    src.push('  probe_width(name) { return 16; }');
    src.push('  tick() {} tock() {}');
    src.push('}');
    src.push('');
  }
  if (ub.includes(Builtin.Rom32w)) {
    src.push('// ---- 內建 ROM32（32 位元指令記憶體，地址空間 32768）----');
    src.push('class Rom32WChip {');
    src.push('  constructor() { this.mem = new Uint32Array(32768); }');
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
    src.push('      this.mem[idx] = v & 0xffffffff;');
    src.push('      idx += 1;');
    src.push('    }');
    src.push('    return true;');
    src.push('  }');
    src.push('  probe_indexed(name, i) { return i < 32768 ? this.mem[i] : 0; }');
    src.push('  probe_width(name) { return 32; }');
    src.push('}');
    src.push('');
  }
  if (ub.includes(Builtin.Ram32w)) {
    src.push('// ---- 內建 RAM32W（32 位元資料記憶體，地址空間 32768，兩相寫入）----');
    src.push('class Ram32WChip {');
    src.push('  constructor() { this.mem = new Uint32Array(32768); this._b = 0; this._ba = 0; this._bl = false; }');
    src.push('  eval(in_, load, address) {');
    src.push('    const a = address & 0xffffffff;');
    src.push('    return { out: a < 32768 ? this.mem[a] : 0 };');
    src.push('  }');
    src.push('  sample(in_, load, address) {');
    src.push('    this._bl = load !== 0; this._b = in_ & 0xffffffff; this._ba = address & 0xffffffff;');
    src.push('  }');
    src.push('  tock() {');
    src.push('    if (this._bl && this._ba < 32768) this.mem[this._ba] = this._b;');
    src.push('    this._bl = false;');
    src.push('  }');
    src.push('  probe_whole() { return null; }');
    src.push('  probe_indexed(name, i) { const a = i & 0xffffffff; return a < 32768 ? this.mem[a] : 0; }');
    src.push('  probe_width(name) { return 32; }');
    src.push('  set_probe(name, i, v) {');
    src.push('    const a = i & 0xffffffff;');
    src.push('    if (a < 32768) { this.mem[a] = v & 0xffffffff; return true; }');
    src.push('    return false;');
    src.push('  }');
    src.push('}');
    src.push('');
  }
  if (ub.includes(Builtin.Rf32)) {
    src.push('// ---- 內建 RF32（32×32 暫存器檔，三讀一寫；x0 硬接 0）----');
    src.push('class Rf32Chip {');
    src.push('  constructor() { this.mem = new Uint32Array(32); this._wd = 0; this._rd = 0; this._we = false; }');
    src.push('  eval(a1, a2, a3, rd, wd, we) {');
    src.push('    const r1 = a1 & 31, r2 = a2 & 31, r3 = a3 & 31;');
    src.push('    return { d1: r1 === 0 ? 0 : this.mem[r1], d2: r2 === 0 ? 0 : this.mem[r2], d3: r3 === 0 ? 0 : this.mem[r3] };');
    src.push('  }');
    src.push('  sample(a1, a2, a3, rd, wd, we) { this._we = we !== 0; this._wd = wd & 0xffffffff; this._rd = rd & 31; }');
    src.push('  tock() { if (this._we && this._rd !== 0) this.mem[this._rd] = this._wd; this._we = false; }');
    src.push('  probe_whole() { return null; }');
    src.push('  probe_indexed(name, i) { const a = i & 31; return a === 0 ? 0 : this.mem[a]; }');
    src.push('  probe_width(name) { return 32; }');
    src.push('  set_probe(name, i, v) {');
    src.push('    const a = i & 31;');
    src.push('    if (a !== 0) { this.mem[a] = v & 0xffffffff; return true; }');
    src.push('    return false;');
    src.push('  }');
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
  src.push('  probe_width(name) { return 16; }');
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
    } else if (clip.kind === 'Builtin' && (clip.b === Builtin.Ram32w || clip.b === Builtin.Rf32 || clip.b === Builtin.Rom32w)) {
      src.push(`      return this._p${slot}.probe_indexed(name, i);`);
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

  // ---- probe_width：name（整根或 [i] 都一樣）→ 位元寬度；找不到回 null ----
  src.push('  probe_width(name) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const part = chip.parts[slot];
    src.push(`    // part ${slot}: ${part.label} (${chipType(e, part.clip)})`);
    src.push(`    if (${partNameCond(part)}) {`);
    const clip = part.clip;
    if (clip.kind === 'User') {
      const ow = e.chips[clip.idx].outPins[0]?.width ?? 16;
      src.push(`      return ${ow};`);
    } else if (clip.b === Builtin.Nand) {
      src.push('      return null;');
    } else if (clip.b === Builtin.Dff) {
      src.push('      return 1;');
    } else if (clip.b === Builtin.ARegister || clip.b === Builtin.DRegister || clip.b === Builtin.Rom32k
        || clip.b === Builtin.Screen || clip.b === Builtin.Keyboard) {
      src.push('      return 16;');
    } else {
      src.push('      return 32;');
    }
    src.push('    }');
  }
  src.push('    // 遞迴 user parts');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'User') {
      src.push(`    { const w = this._p${slot}.probe_width(name); if (w !== null) return w; }`);
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
    } else if (clip.kind === 'Builtin' && (clip.b === Builtin.Ram32w || clip.b === Builtin.Rf32)) {
      src.push(`      return this._p${slot}.set_probe(name, i, val);`);
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
    if (clip.kind === 'Builtin' && (clip.b === Builtin.Rom32k || clip.b === Builtin.Rom32w)) {
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

/** 產生 eval/sample 共用的「先算 wire 再算 part」程式碼。
 *  以定點收斂取代固定次數的評估：依拓樸序反覆求值，直到所有 wire 與上一輪相同。
 *  （依賴鏈深時（Dec→RF 讀→ALU→RAM 位址→wbVal）兩輪常不足以讓落定值正確，
 *   此處用穩定檢查，最多 wires.length+8 輪即收斂。） */
function emitCascade(e, chip, params, indent, src) {
  emitWireDecls(chip, indent, src);
  if (chip.wires.length === 0) return;
  src.push(`${indent}// 定點收斂：依拓樸序反覆求值直到所有 wire 穩定`);
  src.push(`${indent}for (let __it = 0; __it < ${chip.wires.length + 8}; __it++) {`);
  src.push(`${indent}  const ${chip.wires.map((_, i) => `s${i} = ${wname(chip, i)}`).join(', ')};`);
  emitPartsEval(e, chip, params, indent + '  ', src);
  const stable = chip.wires.map((_, i) => `${wname(chip, i)} === s${i}`).join(' && ');
  src.push(`${indent}  if (${stable}) break;`);
  src.push(`${indent}}`);
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

/** 值欄位：二進位零填補到寬度 b（超過則不放開；v 以 u32 呈現） */
function binField(v, b) {
  let s = (v >>> 0).toString(2);
  if (s.length >= b) return s;
  return '0'.repeat(b - s.length) + s;
}

/**
 * 值欄位：有號十進位右對齊（寬度 b）。
 * w = 腳位/記憶體的實際位元寬度（32 → u32 語意；< 32 → 16-bit 有號語意，
 * 與教材 .cmp 的 hex/tst %D 一致。兩者位元相同，僅顯示語意不同）。
 */
function decField(v, b, w) {
  let s;
  if (w === 32) {
    const u = v >>> 0;
    s = String(u > 0x7fffffff ? u - 0x100000000 : u);
  } else {
    const x = (v & 0xffff) > 0x7fff ? (v & 0xffff) - 0x10000 : (v & 0xffff);
    s = String(x);
  }
  if (s.length >= b) return s;
  return ' '.repeat(b - s.length) + s;
}

/** 值欄位：十六進位右對齊（寬度 b，w=32 → 8 位數、<32 → 4 位數） */
function hexField(v, b, w) {
  let s = (v >>> 0).toString(16).toUpperCase().padStart(w === 32 ? 8 : 4, '0');
  if (s.length >= b) return s;
  return ' '.repeat(b - s.length) + s;
}

/** 產生表頭列（第一行） */
function headerLine(fields) {
  const body = fields.map((f) => center(f.name, f.width()));
  return `|${body.join('|')}|`;
}

/**
 * 產生一列資料。
 * `get` 傳回一個欄位的取值：物件 `{ v, w }`（v=值、w=位元寬度）或 null（輸出 `***`）；
 * 純值（無 w）視為 32 位元。寬度決定十進位/十六進位的有號語意。
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
    const o = get(f.name);
    if (o === null || o === undefined) {
      body.push('*'.repeat(f.width()));
      continue;
    }
    const v = typeof o === 'object' ? o.v : o;
    const w = typeof o === 'object' && o.w !== undefined ? o.w : 32;
    const cell = f.kind === Kind.Bin ? binField(v, f.b)
      : f.kind === Kind.Dec ? decField(v, f.b, w)
      : hexField(v, f.b, w);
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
function run(model, script, baseDir, out, verbose, keyboard) {
  if (script.outputList.length > 0) {
    const fields = script.outputList.map((f) => f.field);
    out.push(headerLine(fields) + '\n');
  }
  if (verbose) console.error(`load ${script.load ?? '(none)'}`);
  if (script.romLoad) {
    model.loadRom(path.join(baseDir, script.romLoad));
  }
  if (keyboard !== undefined) {
    model.setInput('KBD', keyboard);
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
          const line = dataLine(fields, timeStr, (n) => {
            const v = model.getOutput(n);
            if (v === null || v === undefined) return null;
            return { v, w: model.pinWidth(n) };
          });
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
        // 鍵盤 wait-while（`while out <> <key>`）：批次模式下直接送出腳本期待的按鍵
        if (step.name === 'out' && typeof step.val === 'number') model.setInput('KBD', step.val);
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
    /** 頂層輸入/輸出腳位的實際位元寬度（決定 %D/%X 的有號語意） */
    this.pinWidthOf = new Map(
      [...chip.inPins, ...chip.outPins].map((p) => [p.name, p.width]),
    );
  }

  /**
   * 欄位位元寬度：頂層腳位內建已知；記憶體對映/內部晶片探測走生成的 probe_width。
   * 找不到時回 32（新 32-bit 記憶體的預設語意）。
   */
  pinWidth(name) {
    const pr = PinRef.parse(name);
    if (pr.idx.kind === 'Whole' && this.pinWidthOf.has(pr.name)) {
      return this.pinWidthOf.get(pr.name);
    }
    if (this.chip.probe_width) {
      const w = this.chip.probe_width(pr.name);
      if (w) return w;
    }
    return 32;
  }

  /** 由輸入 pin 名稱取值（未定義回 0） */
  getIn(name) {
    return (this.ins[name] ?? 0) & 0xffffffff;
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
    this.outs[name] = val & 0xffffffff;
  }

  /** 把 `<pin> = val` 寫進輸入：支援 PinRef 或純字串（`a`、`RAM[3]`） */
  setInput(pin, val) {
    const name = typeof pin === 'string' ? pin : pin.raw();
    if (name.includes('[')) {
      return this.setIdx(name, val);
    }
    if (this.inPins.includes(name)) {
      this.ins[name] = val & 0xffffffff;
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

/***** riscv toolchain (rvasm+rvemu) *****/
const RvToolchain = (() => {

/***** ../../riscv/_web_tools/lib/isa.js *****/
// lib/isa.js：RV32 指令集定義與編解碼原語（純 ES module、零依賴）。
// 涵蓋 RV32I 全部真指令＋M 擴充 8 條＋fence/ecall/ebreak。

// 暫存器 ABI 名→編號對照表。
const REG = {
  zero: 0, ra: 1, sp: 2, gp: 3, tp: 4,
  t0: 5, t1: 6, t2: 7,
  s0: 8, fp: 8, s1: 9,
  a0: 10, a1: 11, a2: 12, a3: 13, a4: 14, a5: 15, a6: 16, a7: 17,
  s2: 18, s3: 19, s4: 20, s5: 21, s6: 22, s7: 23,
  s8: 24, s9: 25, s10: 26, s11: 27,
  t3: 28, t4: 29, t5: 30, t6: 31,
};

// 編號→x 名（反組譯用）。
const REG_NAMES = Array.from({ length: 32 }, (_, i) => 'x' + i);

// 解析暫存器名：同時支援 x0-x31 與 ABI 名，大小寫皆可；非法則 throw。
function regNum(name) {
  if (typeof name === 'number' && Number.isInteger(name)) {
    if (name >= 0 && name <= 31) return name;
    throw new Error(`非法暫存器：${name}`);
  }
  if (typeof name !== 'string') throw new Error(`非法暫存器：${name}`);
  const s = name.trim().toLowerCase();
  let m = /^x(\d{1,2})$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (n >= 0 && n <= 31) return n;
    throw new Error(`非法暫存器：${name}`);
  }
  if (s in REG) return REG[s];
  throw new Error(`非法暫存器：${name}`);
}

// ---- 內部檢查小工具 ----
function chkReg(v, what) {
  if (!Number.isInteger(v) || v < 0 || v > 31) throw new Error(`暫存器編號超出範圍：${what}=${v}`);
}
function chkOp(op) {
  if (!Number.isInteger(op) || op < 0 || op > 0x7f) throw new Error(`opcode 超出範圍：${op}`);
}
function chkF3(f3) {
  if (!Number.isInteger(f3) || f3 < 0 || f3 > 7) throw new Error(`funct3 超出範圍：${f3}`);
}
function chkF7(f7) {
  if (!Number.isInteger(f7) || f7 < 0 || f7 > 0x7f) throw new Error(`funct7 超出範圍：${f7}`);
}
function chkImmRange(imm, lo, hi, what) {
  if (!Number.isInteger(imm) || imm < lo || imm > hi) {
    throw new Error(`立即數超出範圍：${what}=${imm}（允許 ${lo}..${hi}）`);
  }
}

// R 型：f7|rs2|rs1|f3|rd|op。
function encodeR(op, rd, rs1, rs2, f3, f7) {
  chkOp(op); chkReg(rd, 'rd'); chkReg(rs1, 'rs1'); chkReg(rs2, 'rs2'); chkF3(f3); chkF7(f7);
  return (((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0);
}

// I 型：imm[11:0]|rs1|f3|rd|op，imm 為 12 位有號數。
function encodeI(op, rd, rs1, f3, imm) {
  chkOp(op); chkReg(rd, 'rd'); chkReg(rs1, 'rs1'); chkF3(f3);
  chkImmRange(imm, -2048, 2047, 'imm');
  return ((((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0);
}

// S 型：imm[11:5]|rs2|rs1|f3|imm[4:0]|op，imm 為 12 位有號數。
function encodeS(op, rs1, rs2, f3, imm) {
  chkOp(op); chkReg(rs1, 'rs1'); chkReg(rs2, 'rs2'); chkF3(f3);
  chkImmRange(imm, -2048, 2047, 'imm');
  const u = imm & 0xfff;
  return ((((u >> 5) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((u & 0x1f) << 7) | op) >>> 0);
}

// B 型：imm 為 13 位有號偶數位移（-4096..4095 且最低位為 0）。
function encodeB(op, rs1, rs2, f3, imm) {
  chkOp(op); chkReg(rs1, 'rs1'); chkReg(rs2, 'rs2'); chkF3(f3);
  chkImmRange(imm, -4096, 4095, 'imm');
  if ((imm & 1) !== 0) throw new Error(`分支位移必須為偶數：${imm}`);
  const u = imm & 0x1fff;
  const b12 = (u >> 12) & 1, b11 = (u >> 11) & 1, b10_5 = (u >> 5) & 0x3f, b4_1 = (u >> 1) & 0xf;
  return (((b12 << 31) | (b10_5 << 25) | (rs2 << 20) | (rs1 << 15) |
    (f3 << 12) | (b4_1 << 8) | (b11 << 7) | op) >>> 0);
}

// U 型：imm20 為高 20 位（接受 0..0xfffff，或 -524288..-1 以有號表示）。
function encodeU(op, rd, imm20) {
  chkOp(op); chkReg(rd, 'rd');
  chkImmRange(imm20, -524288, 0xfffff, 'imm20');
  return ((((imm20 & 0xfffff) << 12) | (rd << 7) | op) >>> 0);
}

// J 型：imm 為 21 位有號偶數位移（-1048576..1048575 且最低位為 0）。
function encodeJ(op, rd, imm) {
  chkOp(op); chkReg(rd, 'rd');
  chkImmRange(imm, -1048576, 1048575, 'imm');
  if ((imm & 1) !== 0) throw new Error(`跳躍位移必須為偶數：${imm}`);
  const u = imm & 0x1fffff;
  const b20 = (u >> 20) & 1, b19_12 = (u >> 12) & 0xff, b11 = (u >> 11) & 1, b10_1 = (u >> 1) & 0x3ff;
  return (((b20 << 31) | (b19_12 << 12) | (b11 << 20) | (b10_1 << 21) | (rd << 7) | op) >>> 0);
}

// 有號擴展小工具。
function signExtend(v, bits) {
  const s = 32 - bits;
  return ((v << s) >> s);
}

// 解碼一個 32 位字 → {op,rd,rs1,rs2,funct3,funct7,imm,fmt}，imm 已符號擴展。
function decodeWord(w) {
  w = (Number(w) >>> 0);
  const op = w & 0x7f;
  const rd = (w >>> 7) & 0x1f;
  const funct3 = (w >>> 12) & 0x7;
  const rs1 = (w >>> 15) & 0x1f;
  const rs2 = (w >>> 20) & 0x1f;
  const funct7 = (w >>> 25) & 0x7f;
  let fmt, imm;
  switch (op) {
    case 0x33: // R
      fmt = 'R'; imm = 0;
      break;
    case 0x03: case 0x13: case 0x67: case 0x0f: case 0x73: { // I
      fmt = 'I';
      imm = signExtend((w >>> 20) & 0xfff, 12);
      break;
    }
    case 0x23: { // S
      fmt = 'S';
      imm = signExtend((((w >>> 25) & 0x7f) << 5) | ((w >>> 7) & 0x1f), 12);
      break;
    }
    case 0x63: { // B
      fmt = 'B';
      const b12 = (w >>> 31) & 1, b11 = (w >>> 7) & 1;
      const b10_5 = (w >>> 25) & 0x3f, b4_1 = (w >>> 8) & 0xf;
      imm = signExtend((b12 << 12) | (b11 << 11) | (b10_5 << 5) | (b4_1 << 1), 13);
      break;
    }
    case 0x37: case 0x17: // U：回傳完整 32 位（含低 12 個 0）的有號值
      fmt = 'U';
      imm = (w & 0xfffff000) | 0;
      break;
    case 0x0b: // G：riscvgpu custom-0（tid/ntid/barrier）
      fmt = 'G'; imm = 0;
      break;    case 0x6f: { // J
      fmt = 'J';
      const b20 = (w >>> 31) & 1, b19_12 = (w >>> 12) & 0xff;
      const b11 = (w >>> 20) & 1, b10_1 = (w >>> 21) & 0x3ff;
      imm = signExtend((b20 << 20) | (b19_12 << 12) | (b11 << 11) | (b10_1 << 1), 21);
      break;
    }
    default: // 未知 opcode：fmt 標示為 X，呼叫端（反組譯）據此印 (unknown)
      fmt = 'X'; imm = 0;
      break;
  }
  return { op, rd, rs1, rs2, funct3, funct7, imm, fmt };
}

// 指令表：每筆 {mn, fmt, op, f3, f7}。
// U/J 型無 funct3/funct7，I 型非移位指令 f7 未使用：統一填 0。
const INSTR = [
  // U 型
  { mn: 'lui', fmt: 'U', op: 0x37, f3: 0, f7: 0 },
  { mn: 'auipc', fmt: 'U', op: 0x17, f3: 0, f7: 0 },
  // J 型
  { mn: 'jal', fmt: 'J', op: 0x6f, f3: 0, f7: 0 },
  // I 型：jalr / 載入 / 算術（含移位）/ fence / system
  { mn: 'jalr', fmt: 'I', op: 0x67, f3: 0, f7: 0 },
  { mn: 'lb', fmt: 'I', op: 0x03, f3: 0, f7: 0 },
  { mn: 'lh', fmt: 'I', op: 0x03, f3: 1, f7: 0 },
  { mn: 'lw', fmt: 'I', op: 0x03, f3: 2, f7: 0 },
  { mn: 'lbu', fmt: 'I', op: 0x03, f3: 4, f7: 0 },
  { mn: 'lhu', fmt: 'I', op: 0x03, f3: 5, f7: 0 },
  { mn: 'addi', fmt: 'I', op: 0x13, f3: 0, f7: 0 },
  { mn: 'slti', fmt: 'I', op: 0x13, f3: 2, f7: 0 },
  { mn: 'sltiu', fmt: 'I', op: 0x13, f3: 3, f7: 0 },
  { mn: 'xori', fmt: 'I', op: 0x13, f3: 4, f7: 0 },
  { mn: 'ori', fmt: 'I', op: 0x13, f3: 6, f7: 0 },
  { mn: 'andi', fmt: 'I', op: 0x13, f3: 7, f7: 0 },
  { mn: 'slli', fmt: 'I', op: 0x13, f3: 1, f7: 0x00 },
  { mn: 'srli', fmt: 'I', op: 0x13, f3: 5, f7: 0x00 },
  { mn: 'srai', fmt: 'I', op: 0x13, f3: 5, f7: 0x20 },
  { mn: 'fence', fmt: 'I', op: 0x0f, f3: 0, f7: 0 },
  { mn: 'ecall', fmt: 'I', op: 0x73, f3: 0, f7: 0 },
  { mn: 'ebreak', fmt: 'I', op: 0x73, f3: 0, f7: 0 },
  // S 型：儲存
  { mn: 'sb', fmt: 'S', op: 0x23, f3: 0, f7: 0 },
  { mn: 'sh', fmt: 'S', op: 0x23, f3: 1, f7: 0 },
  { mn: 'sw', fmt: 'S', op: 0x23, f3: 2, f7: 0 },
  // B 型：分支
  { mn: 'beq', fmt: 'B', op: 0x63, f3: 0, f7: 0 },
  { mn: 'bne', fmt: 'B', op: 0x63, f3: 1, f7: 0 },
  { mn: 'blt', fmt: 'B', op: 0x63, f3: 4, f7: 0 },
  { mn: 'bge', fmt: 'B', op: 0x63, f3: 5, f7: 0 },
  { mn: 'bltu', fmt: 'B', op: 0x63, f3: 6, f7: 0 },
  { mn: 'bgeu', fmt: 'B', op: 0x63, f3: 7, f7: 0 },
  // R 型：基本算術邏輯
  { mn: 'add', fmt: 'R', op: 0x33, f3: 0, f7: 0x00 },
  { mn: 'sub', fmt: 'R', op: 0x33, f3: 0, f7: 0x20 },
  { mn: 'sll', fmt: 'R', op: 0x33, f3: 1, f7: 0x00 },
  { mn: 'slt', fmt: 'R', op: 0x33, f3: 2, f7: 0x00 },
  { mn: 'sltu', fmt: 'R', op: 0x33, f3: 3, f7: 0x00 },
  { mn: 'xor', fmt: 'R', op: 0x33, f3: 4, f7: 0x00 },
  { mn: 'srl', fmt: 'R', op: 0x33, f3: 5, f7: 0x00 },
  { mn: 'sra', fmt: 'R', op: 0x33, f3: 5, f7: 0x20 },
  { mn: 'or', fmt: 'R', op: 0x33, f3: 6, f7: 0x00 },
  { mn: 'and', fmt: 'R', op: 0x33, f3: 7, f7: 0x00 },
  // R 型：M 擴充（f7=0x01）
  { mn: 'mul', fmt: 'R', op: 0x33, f3: 0, f7: 0x01 },
  { mn: 'mulh', fmt: 'R', op: 0x33, f3: 1, f7: 0x01 },
  { mn: 'mulhsu', fmt: 'R', op: 0x33, f3: 2, f7: 0x01 },
  { mn: 'mulhu', fmt: 'R', op: 0x33, f3: 3, f7: 0x01 },
  { mn: 'div', fmt: 'R', op: 0x33, f3: 4, f7: 0x01 },
  { mn: 'divu', fmt: 'R', op: 0x33, f3: 5, f7: 0x01 },
  { mn: 'rem', fmt: 'R', op: 0x33, f3: 6, f7: 0x01 },
  { mn: 'remu', fmt: 'R', op: 0x33, f3: 7, f7: 0x01 },
  // G 型：riscvgpu custom-0（op=0x0b，rs1=rs2=0，f7=0）
  { mn: 'tid', fmt: 'G', op: 0x0b, f3: 0, f7: 0 },
  { mn: 'ntid', fmt: 'G', op: 0x0b, f3: 1, f7: 0 },
  { mn: 'barrier', fmt: 'G', op: 0x0b, f3: 2, f7: 0 },
];

// 以助憶符查表（小寫鍵）。
const INSTR_MAP = Object.fromEntries(INSTR.map(e => [e.mn, e]));

// 虛擬指令名錄（展開規則見 rvasm.js）。
const PSEUDO = ['nop', 'li', 'mv', 'not', 'neg', 'j', 'jr', 'ret', 'call'];


/***** ../../riscv/_web_tools/lib/rvasm.js *****/
// lib/rvasm.js：RV32 組譯器（純 ES module、零依賴）。
// assemble(src, {origin}) → {words, labels, listing, errors}；兩 pass；錯誤一律 throw（含行號）。


// 解析數字：十進位／0x 十六進位／正負號；非數字回傳 null。
function parseNum(tok) {
  if (tok == null) return null;
  const s = String(tok).trim();
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(s) || /^[+-]?\d+$/.test(s)) {
    const v = Number(s);
    if (!Number.isInteger(v)) return null;
    return v;
  }
  return null;
}

// 去註解（# 起至行尾；雙引號字串內的不算）。
function stripComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inStr = !inStr;
    else if (c === '#' && !inStr) return line.slice(0, i);
  }
  return line;
}

// 以逗號或空白切 token（.ascii 需保留引號字串：先抽出字串）。
function splitTokens(s) {
  const strs = [];
  const masked = s.replace(/"((?:[^"\\]|\\.)*)"/g, (_, inner) => {
    strs.push(inner);
    return ` \u0000${strs.length - 1} `;
  });
  const toks = masked.replace(/,/g, ' ').trim().split(/\s+/).filter(t => t.length > 0)
    .map(t => {
      const m = /^\u0000(\d+)$/.exec(t);
      return m ? { str: strs[Number(m[1])] } : t;
    });
  return toks;
}

// 解析 offset(base) 記憶體運算元 → {offText, baseText}。
function parseMemOp(tok, lineno) {
  const m = /^(.*)\(\s*([^()]+)\s*\)$/.exec(String(tok).trim());
  if (!m) throw new Error(`第${lineno}行：記憶體運算元格式錯誤（應為 offset(base)）：${tok}`);
  return { offText: m[1].trim(), baseText: m[2].trim() };
}

function isLabelName(s) {
  return /^[A-Za-z_.][A-Za-z0-9_.$]*$/.test(s);
}

// 展開 li 的 lui+addi 高低位（標準 algorithm：hi=(v+0x800)>>12，lo=v-hi*4096）。
function liParts(v) {
  const u = v | 0; // 取低 32 位有號值
  if (u >= -2048 && u <= 2047) return { one: u };
  const hi = (u + 0x800) >> 12; // 算術右移，hi 可為負
  const lo = u - (hi << 12); // 必落於 -2048..2047
  return { hi20: hi & 0xfffff, lo };
}

// 單條真指令編碼（運算元皆為字串陣列；label 參照由 labels 解析；pc 為本指令位址）。
function encodeOne(mn, args, labels, pc, lineno) {
  const e = INSTR_MAP[mn];
  if (!e) throw new Error(`第${lineno}行：未定義指令：${mn}`);
  const need = (n) => {
    if (args.length !== n) throw new Error(`第${lineno}行：${mn} 運算元數量錯誤（要 ${n} 個，得 ${args.length} 個）`);
  };
  const R = (t) => {
    try { return regNum(t); }
    catch { throw new Error(`第${lineno}行：非法暫存器：${t}`); }
  };
  const N = (t) => {
    const v = parseNum(t);
    if (v === null) throw new Error(`第${lineno}行：數字格式錯誤：${t}`);
    return v;
  };
  // 分支／jal 第三運算元：標籤→相對位移，數字→直接位移。
  const relOff = (t) => {
    const v = parseNum(t);
    if (v !== null) return v;
    if (!isLabelName(t)) throw new Error(`第${lineno}行：標籤格式錯誤：${t}`);
    if (!labels.has(t)) throw new Error(`第${lineno}行：未定義標籤：${t}`);
    return labels.get(t) - pc;
  };
  try {
    switch (e.fmt) {
      case 'R': {
        need(3);
        return [encodeR(e.op, R(args[0]), R(args[1]), R(args[2]), e.f3, e.f7)];
      }
      case 'I': {
        if (mn === 'ecall' || mn === 'ebreak' || mn === 'fence') {
          if (args.length !== 0) throw new Error(`第${lineno}行：${mn} 不帶運算元`);
          const imm = mn === 'ebreak' ? 1 : 0;
          return [encodeI(e.op, 0, 0, e.f3, imm)];
        }
        if (mn === 'jalr') {
          if (args.length === 2) { // jalr rd, offset(rs1)
            const mem = parseMemOp(args[1], lineno);
            return [encodeI(e.op, R(args[0]), R(mem.baseText), e.f3, N(mem.offText))];
          }
          need(3); // jalr rd, rs1, imm
          return [encodeI(e.op, R(args[0]), R(args[1]), e.f3, N(args[2]))];
        }
        if (mn === 'lb' || mn === 'lh' || mn === 'lw' || mn === 'lbu' || mn === 'lhu') {
          need(2); // lw rd, offset(rs1)
          const mem = parseMemOp(args[1], lineno);
          return [encodeI(e.op, R(args[0]), R(mem.baseText), e.f3, N(mem.offText))];
        }
        if (mn === 'slli' || mn === 'srli' || mn === 'srai') {
          need(3);
          const sh = N(args[2]);
          if (sh < 0 || sh > 31) throw new Error(`第${lineno}行：移位量超出範圍：${args[2]}`);
          const base = mn === 'srai' ? 0x400 : 0x000;
          return [encodeI(e.op, R(args[0]), R(args[1]), e.f3, base | sh)];
        }
        need(3); // addi rd, rs1, imm
        return [encodeI(e.op, R(args[0]), R(args[1]), e.f3, N(args[2]))];
      }
      case 'S': {
        need(2); // sw rs2, offset(rs1)
        const mem = parseMemOp(args[1], lineno);
        return [encodeS(e.op, R(mem.baseText), R(args[0]), e.f3, N(mem.offText))];
      }
      case 'B': {
        need(3); // beq rs1, rs2, label|offset
        return [encodeB(e.op, R(args[0]), R(args[1]), e.f3, relOff(args[2]))];
      }
      case 'U': {
        need(2); // lui rd, imm20
        const v = N(args[1]);
        return [encodeU(e.op, R(args[0]), v)];
      }
      case 'J': {
        if (args.length === 1) return [encodeJ(e.op, 1, relOff(args[0]))]; // jal label → jal x1, label
        need(2); // jal rd, label|offset
        return [encodeJ(e.op, R(args[0]), relOff(args[1]))];
      }
      case 'G': { // riscvgpu custom-0：rs1=rs2=0，f7=0
        if (mn === 'barrier') {
          need(0);
          return [encodeR(e.op, 0, 0, 0, e.f3, 0)];
        }
        need(1); // tid rd／ntid rd
        return [encodeR(e.op, R(args[0]), 0, 0, e.f3, 0)];
      }
      default:
        throw new Error(`第${lineno}行：未定義指令：${mn}`);
    }
  } catch (err) {
    // encode* 丟出的範圍錯誤補上行號。
    if (/^第\d+行/.test(err.message)) throw err;
    throw new Error(`第${lineno}行：${err.message}`);
  }
}

// 虛擬指令展開 → 真指令字串陣列（每條為 {mn, args}）。
function expandPseudo(mn, args, pc, lineno) {
  const need = (n) => {
    if (args.length !== n) throw new Error(`第${lineno}行：${mn} 運算元數量錯誤（要 ${n} 個，得 ${args.length} 個）`);
  };
  switch (mn) {
    case 'nop': need(0); return [{ mn: 'addi', args: ['x0', 'x0', '0'] }];
    case 'mv': need(2); return [{ mn: 'addi', args: [args[0], args[1], '0'] }];
    case 'not': need(2); return [{ mn: 'xori', args: [args[0], args[1], '-1'] }];
    case 'neg': need(2); return [{ mn: 'sub', args: [args[0], 'x0', args[1]] }];
    case 'j': need(1); return [{ mn: 'jal', args: ['x0', args[0]] }];
    case 'jr': need(1); return [{ mn: 'jalr', args: ['x0', `0(${args[0]})`] }];
    case 'ret': need(0); return [{ mn: 'jalr', args: ['x0', '0(ra)'] }];
    case 'call': need(1); return [{ mn: 'jal', args: ['ra', args[0]] }];
    case 'li': {
      need(2);
      const v = parseNum(args[1]);
      if (v !== null) {
        const p = liParts(v);
        if (p.one !== undefined) return [{ mn: 'addi', args: [args[0], 'x0', String(p.one)] }];
        return [
          { mn: 'lui', args: [args[0], String(p.hi20 > 0x7ffff ? p.hi20 - 0x100000 : p.hi20)] },
          { mn: 'addi', args: [args[0], args[0], String(p.lo)] },
        ];
      }
      // li rd, label：標籤絕對位址未知，先佔 lui+addi 兩格，pass 2 回填。
      if (!isLabelName(args[1])) throw new Error(`第${lineno}行：數字格式錯誤：${args[1]}`);
      return [
        { mn: 'lui', args: [args[0], `%%HI%%${args[1]}`] },
        { mn: 'addi', args: [args[0], args[0], `%%LO%%${args[1]}`] },
      ];
    }
    default: throw new Error(`第${lineno}行：未定義指令：${mn}`);
  }
}

function assemble(src, { origin = 0 } = {}) {
  const lines = String(src).split('\n');
  // pass 1：掃標籤、算每列位址與佔位（li 遇標籤一律佔 2 格）。
  const labels = new Map();
  const items = []; // {lineno, text, kind, ...}
  let pc = origin >>> 0;
  const alignPC = () => { while (pc % 4 !== 0) pc++; };

  const defineLabel = (name, lineno) => {
    if (!isLabelName(name)) throw new Error(`第${lineno}行：標籤格式錯誤：${name}`);
    if (labels.has(name)) throw new Error(`第${lineno}行：標籤重複定義：${name}`);
    labels.set(name, pc);
  };

  for (let li = 0; li < lines.length; li++) {
    const lineno = li + 1;
    const raw = stripComment(lines[li]).trim();
    if (raw === '') continue;
    let rest = raw;
    // 行首 label:（同一列冒號後可接指令）。
    const lm = /^([A-Za-z_.][A-Za-z0-9_.$]*)\s*:\s*(.*)$/.exec(rest);
    if (lm) {
      defineLabel(lm[1], lineno);
      rest = lm[2].trim();
      if (rest === '') {
        items.push({ lineno, text: lines[li].trim(), kind: 'empty' });
        continue;
      }
    }
    if (rest.startsWith('.')) {
      const toks = splitTokens(rest);
      const dir = toks[0].toLowerCase();
      if (dir === '.text') {
        items.push({ lineno, text: lines[li].trim(), kind: 'empty' });
        continue;
      }
      if (dir === '.word') {
        if (toks.length < 2) throw new Error(`第${lineno}行：.word 缺少數值`);
        alignPC();
        items.push({ lineno, text: lines[li].trim(), kind: 'word', vals: toks.slice(1), addr: pc });
        pc += 4 * (toks.length - 1);
        continue;
      }
      if (dir === '.byte') {
        if (toks.length < 2) throw new Error(`第${lineno}行：.byte 缺少數值`);
        items.push({ lineno, text: lines[li].trim(), kind: 'byte', vals: toks.slice(1), addr: pc });
        pc += (toks.length - 1);
        continue;
      }
      if (dir === '.ascii' || dir === '.asciz') {
        if (toks.length !== 2 || typeof toks[1] !== 'object' || typeof toks[1].str !== 'string') {
          throw new Error(`第${lineno}行：${dir} 需接一個雙引號字串`);
        }
        items.push({ lineno, text: lines[li].trim(), kind: 'str', val: toks[1].str, nul: dir === '.asciz', addr: pc });
        pc += toks[1].str.length + (dir === '.asciz' ? 1 : 0);
        continue;
      }
      throw new Error(`第${lineno}行：未知指示：${toks[0]}`);
    }
    // 指令列。
    const sp = rest.search(/\s/);
    const mn = (sp === -1 ? rest : rest.slice(0, sp)).toLowerCase();
    const argStr = sp === -1 ? '' : rest.slice(sp + 1);
    const args = argStr.trim() === '' ? [] : splitTokens(argStr).map(t => (typeof t === 'object' ? t.str : t));
    if (INSTR_MAP[mn]) {
      alignPC();
      items.push({ lineno, text: lines[li].trim(), kind: 'insn', ops: [{ mn, args }], addr: pc });
      pc += 4;
    } else if (PSEUDO.includes(mn)) {
      alignPC();
      const ops = expandPseudo(mn, args, pc, lineno);
      // li 符號版佔 2 格；其餘依展開條數（li 數值版大小已在此確定）。
      let n = ops.length;
      if (mn === 'li' && parseNum(args[1]) === null) n = 2;
      items.push({ lineno, text: lines[li].trim(), kind: 'insn', ops, addr: pc, pseudo: mn, pseudoArgs: args });
      pc += 4 * n;
    } else {
      throw new Error(`第${lineno}行：未定義指令：${mn}`);
    }
  }

  // pass 2：以位元組緩衝發射，最後拼成 words。
  const bytes = [];
  const listing = [];
  const emitByte = (b) => bytes.push(b & 0xff);
  const emitWordLE = (w) => { emitByte(w); emitByte(w >>> 8); emitByte(w >>> 16); emitByte(w >>> 24); };
  const padTo = (addr) => { while ((origin + bytes.length) < addr) emitByte(0); };

  const resolveVal = (t, lineno, bits) => {
    const v = parseNum(t);
    if (v !== null) return v;
    if (isLabelName(t) && labels.has(t)) return labels.get(t);
    if (isLabelName(t)) throw new Error(`第${lineno}行：未定義標籤：${t}`);
    throw new Error(`第${lineno}行：數字格式錯誤：${t}`);
  };

  for (const it of items) {
    if (it.kind === 'empty') continue;
    if (it.kind === 'word') {
      padTo(it.addr);
      for (const t of it.vals) {
        if (typeof t === 'object') throw new Error(`第${it.lineno}行：.word 不接受字串`);
        const a = origin + bytes.length;
        emitWordLE(resolveVal(t, it.lineno) >>> 0);
        listing.push({ addr: a, word: bytesToWord(bytes, bytes.length - 4), text: it.text });
      }
      continue;
    }
    if (it.kind === 'byte') {
      for (const t of it.vals) {
        if (typeof t === 'object') throw new Error(`第${it.lineno}行：.byte 不接受字串`);
        const v = resolveVal(t, it.lineno);
        if (v < -128 || v > 255) throw new Error(`第${it.lineno}行：.byte 數值超出範圍：${t}`);
        emitByte(v);
      }
      // .byte 的 listing：按完整字（補 0）列出。
      const start = it.addr - origin;
      const end = bytes.length;
      for (let o = start - (start % 4); o < end; o += 4) {
        const w = packRange(bytes, o);
        listing.push({ addr: origin + o, word: w, text: it.text });
      }
      continue;
    }
    if (it.kind === 'str') {
      for (let i = 0; i < it.val.length; i++) emitByte(it.val.charCodeAt(i) & 0xff);
      if (it.nul) emitByte(0);
      const start = it.addr - origin;
      const end = bytes.length;
      if (end > start) {
        for (let o = start - (start % 4); o < end; o += 4) {
          const w = packRange(bytes, o);
          listing.push({ addr: origin + o, word: w, text: it.text });
        }
      }
      continue;
    }
    if (it.kind === 'insn') {
      padTo(it.addr);
      // li 符號版回填高低位。
      let ops = it.ops;
      if (it.pseudo === 'li' && parseNum(it.pseudoArgs[1]) === null) {
        const sym = it.pseudoArgs[1];
        if (!labels.has(sym)) throw new Error(`第${it.lineno}行：未定義標籤：${sym}`);
        const v = labels.get(sym);
        const p = liParts(v);
        if (p.one !== undefined) {
          ops = [{ mn: 'addi', args: [it.pseudoArgs[0], 'x0', String(p.one)] }];
        } else {
          const hiSigned = p.hi20 > 0x7ffff ? p.hi20 - 0x100000 : p.hi20;
          ops = [
            { mn: 'lui', args: [it.pseudoArgs[0], String(hiSigned)] },
            { mn: 'addi', args: [it.pseudoArgs[0], it.pseudoArgs[0], String(p.lo)] },
          ];
        }
      }
      // li 數值大數版的 lui 操作數是「有號 hi」字串；encodeOne 的 U 分支只接受數值，
      //此處先把 %%HI%%/%%LO%% 以外的有號 hi 轉為 encodeU 可接受的 20 位。
      let cur = it.addr;
      for (const o of ops) {
        let ws;
        if (o.mn === 'lui' && typeof o.args[1] === 'string' && o.args[1].startsWith('%%')) {
          throw new Error(`第${it.lineno}行：內部錯誤：未解析的符號高低位`);
        }
        ws = encodeOne(o.mn, o.args, labels, cur, it.lineno);
        for (const w of ws) {
          const a = origin + bytes.length;
          emitWordLE(w);
          listing.push({ addr: a, word: w >>> 0, text: it.text });
          cur += 4;
        }
      }
      continue;
    }
  }

  // 位元組緩衝→字陣列（尾端不足一字補 0）。
  const words = [];
  for (let o = 0; o < bytes.length; o += 4) words.push(packRange(bytes, o));
  return { words, labels, listing, errors: [] };
}

function bytesToWord(bytes, o) {
  return ((((bytes[o + 3] || 0) << 24) | ((bytes[o + 2] || 0) << 16) |
    ((bytes[o + 1] || 0) << 8) | (bytes[o] || 0)) >>> 0);
}
function packRange(bytes, o) {
  let w = 0;
  for (let i = 0; i < 4; i++) w |= ((bytes[o + i] || 0) << (8 * i));
  return w >>> 0;
}


/***** ../../riscv/_web_tools/lib/rvdis.js *****/
// lib/rvdis.js：RV32 反組譯器（純 ES module、零依賴）。
// disassemble(words, origin) → string 陣列，每列 `addr8hex: word8hex  mn ops`。


function hex8(v) {
  return (v >>> 0).toString(16).padStart(8, '0');
}

// 依解碼欄位還原助憶符；無法對應回傳 null（呼叫端印 (unknown)）。
function mnemonic(d, w) {
  const { op, funct3: f3, funct7: f7, imm } = d;
  switch (op) {
    case 0x37: return 'lui';
    case 0x17: return 'auipc';
    case 0x6f: return 'jal';
    case 0x67: return f3 === 0 ? 'jalr' : null;
    case 0x0f: return f3 === 0 ? 'fence' : null;
    case 0x73:
      if (f3 !== 0) return null;
      if (imm === 0) return 'ecall';
      if (imm === 1) return 'ebreak';
      return null;
    case 0x03:
      return { 0: 'lb', 1: 'lh', 2: 'lw', 4: 'lbu', 5: 'lhu' }[f3] ?? null;
    case 0x13: {
      const top = (w >>> 25) & 0x7f;
      switch (f3) {
        case 0: return 'addi';
        case 1: return (top === 0x00) ? 'slli' : null;
        case 2: return 'slti';
        case 3: return 'sltiu';
        case 4: return 'xori';
        case 5: return top === 0x00 ? 'srli' : top === 0x20 ? 'srai' : null;
        case 6: return 'ori';
        case 7: return 'andi';
        default: return null;
      }
    }
    case 0x23:
      return { 0: 'sb', 1: 'sh', 2: 'sw' }[f3] ?? null;
    case 0x63:
      return { 0: 'beq', 1: 'bne', 4: 'blt', 5: 'bge', 6: 'bltu', 7: 'bgeu' }[f3] ?? null;
    case 0x33: {
      if (f7 === 0x00) {
        return {
          0: ((w >>> 30) & 1) ? 'sub' : 'add',
          1: 'sll', 2: 'slt', 3: 'sltu', 4: 'xor',
          5: ((w >>> 30) & 1) ? 'sra' : 'srl', 6: 'or', 7: 'and',
        }[f3] ?? null;
      }
      if (f7 === 0x01) {
        return {
          0: 'mul', 1: 'mulh', 2: 'mulhsu', 3: 'mulhu',
          4: 'div', 5: 'divu', 6: 'rem', 7: 'remu',
        }[f3] ?? null;
      }
      return null;
    }
    case 0x0b: { // riscvgpu custom-0：rs1=rs2=0，f7=0 才認
      if (d.rs1 !== 0 || d.rs2 !== 0 || f7 !== 0) return null;
      return { 0: 'tid', 1: 'ntid', 2: 'barrier' }[f3] ?? null;
    }
    default: return null;
  }
}

// 依助憶符排運算元（暫存器一律用 x 名）。
function operands(mn, d, w) {
  const R = (i) => REG_NAMES[i];
  switch (mn) {
    // R 型
    case 'add': case 'sub': case 'sll': case 'slt': case 'sltu':
    case 'xor': case 'srl': case 'sra': case 'or': case 'and':
    case 'mul': case 'mulh': case 'mulhsu': case 'mulhu':
    case 'div': case 'divu': case 'rem': case 'remu':
      return `${R(d.rd)}, ${R(d.rs1)}, ${R(d.rs2)}`;
    // I 型算術（移位只印 shamt）
    case 'addi': case 'slti': case 'sltiu': case 'xori': case 'ori': case 'andi':
      return `${R(d.rd)}, ${R(d.rs1)}, ${d.imm}`;
    case 'slli': case 'srli': case 'srai':
      return `${R(d.rd)}, ${R(d.rs1)}, ${(w >>> 20) & 0x1f}`;
    // 載入／jalr：offset(base)
    case 'lb': case 'lh': case 'lw': case 'lbu': case 'lhu': case 'jalr':
      return `${R(d.rd)}, ${d.imm}(${R(d.rs1)})`;
    // S 型：sw rs2, offset(rs1)
    case 'sb': case 'sh': case 'sw':
      return `${R(d.rs2)}, ${d.imm}(${R(d.rs1)})`;
    // B／J 型：十進位位移
    case 'beq': case 'bne': case 'blt': case 'bge': case 'bltu': case 'bgeu':
      return `${R(d.rs1)}, ${R(d.rs2)}, ${d.imm}`;
    case 'jal':
      return `${R(d.rd)}, ${d.imm}`;
    // U 型：高 20 位印十六進位
    case 'lui': case 'auipc':
      return `${R(d.rd)}, 0x${((w >>> 12) & 0xfffff).toString(16)}`;
    // G 型：tid/ntid 取 rd；barrier 無運算元
    case 'tid': case 'ntid':
      return `${R(d.rd)}`;
    case 'barrier':
      return '';
    // 無運算元
    case 'fence': case 'ecall': case 'ebreak':
      return '';
    default: return '';
  }
}

function disassemble(words, origin = 0) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const addr = (origin + i * 4) >>> 0;
    const w = words[i] >>> 0;
    const d = decodeWord(w);
    const mn = mnemonic(d, w);
    const head = `${hex8(addr)}: ${hex8(w)}  `;
    if (mn === null) out.push(head + '(unknown)');
    else {
      const ops = operands(mn, d, w);
      out.push(ops === '' ? head + mn : head + `${mn} ${ops}`);
    }
  }
  return out;
}


/***** ../../riscv/_web_tools/lib/rvemu.js *****/
// lib/rvemu.js：RV32 模擬器（純 ES module、零依賴）。
// 支援 INSTR 全部指令（含 M 擴充）；記憶體小端序；UART 位址 0x10000000。


const UART_ADDR = 0x10000000;
const INT_MIN = -0x80000000;

// 無號／有號轉換小工具。
const U = (v) => v >>> 0;
const S = (v) => v | 0;

class Emulator {
  constructor(memSize = 262144) {
    if (!Number.isInteger(memSize) || memSize <= 0) throw new Error(`記憶體大小非法：${memSize}`);
    this.memSize = memSize;
    this.mem = new Uint8Array(memSize);
    this.regs = new Uint32Array(32);
    this.reset();
  }

  reset() {
    this.regs.fill(0);
    this.pc = 0;
    this.uart = '';
    this.halted = false;
    this.exitCode = 0;
  }

  loadWords(words, origin = 0) {
    origin = origin >>> 0;
    this.checkAccess(origin, words.length * 4);
    for (let i = 0; i < words.length; i++) {
      const w = words[i] >>> 0;
      const a = origin + i * 4;
      this.mem[a] = w & 0xff;
      this.mem[a + 1] = (w >>> 8) & 0xff;
      this.mem[a + 2] = (w >>> 16) & 0xff;
      this.mem[a + 3] = (w >>> 24) & 0xff;
    }
    this.pc = origin;
    this.halted = false;
    this.exitCode = 0;
    this.uart = '';
  }

  getReg(i) {
    if (!Number.isInteger(i) || i < 0 || i > 31) throw new Error(`暫存器編號非法：${i}`);
    return this.regs[i] >>> 0;
  }

  dumpWords(addr, n) {
    addr = addr >>> 0;
    this.checkAccess(addr, n * 4);
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.loadWord(addr + i * 4));
    return out;
  }

  checkAccess(addr, len) {
    if (addr + len > this.memSize || len < 0) {
      throw new Error(`記憶體越界（缺頁）：addr=0x${(addr >>> 0).toString(16)} len=${len}`);
    }
  }

  loadByte(a) { this.checkAccess(a, 1); return this.mem[a]; }
  loadHalf(a) { this.checkAccess(a, 2); return this.mem[a] | (this.mem[a + 1] << 8); }
  loadWord(a) {
    this.checkAccess(a, 4);
    return (this.mem[a] | (this.mem[a + 1] << 8) | (this.mem[a + 2] << 16) | (this.mem[a + 3] << 24)) >>> 0;
  }
  storeByte(a, v) { this.checkAccess(a, 1); this.mem[a] = v & 0xff; }
  storeHalf(a, v) { this.checkAccess(a, 2); this.mem[a] = v & 0xff; this.mem[a + 1] = (v >>> 8) & 0xff; }
  storeWord(a, v) {
    this.checkAccess(a, 4);
    this.mem[a] = v & 0xff; this.mem[a + 1] = (v >>> 8) & 0xff;
    this.mem[a + 2] = (v >>> 16) & 0xff; this.mem[a + 3] = (v >>> 24) & 0xff;
  }

  // 寫暫存器：x0 寫入忽略。
  setReg(rd, v) {
    if (rd !== 0) this.regs[rd] = v >>> 0;
  }

  step() {
    if (this.halted) return { pc: this.pc >>> 0, word: 0, halted: true };
    const pc = this.pc >>> 0;
    const word = this.loadWord(pc); // 越界即 throw（缺頁）
    const d = decodeWord(word);
    const { op, rd, rs1, rs2, funct3: f3, funct7: f7, imm } = d;
    const rv1 = this.regs[rs1] >>> 0, rv2 = this.regs[rs2] >>> 0;
    const sv1 = rv1 | 0, sv2 = rv2 | 0;
    let next = (pc + 4) >>> 0;

    const branchTaken = (cond) => { if (cond) next = (pc + imm) >>> 0; };
    const loadAddr = (rv1 + imm) >>> 0; // rs1+imm（載入／儲存共用）

    switch (op) {
      case 0x37: this.setReg(rd, word & 0xfffff000); break; // lui
      case 0x17: this.setReg(rd, (pc + (word & 0xfffff000)) >>> 0); break; // auipc
      case 0x6f: // jal
        this.setReg(rd, pc + 4);
        next = (pc + imm) >>> 0;
        break;
      case 0x67: { // jalr（僅 f3=0）
        if (f3 !== 0) throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        const t = ((rv1 + imm) & ~1) >>> 0;
        this.setReg(rd, pc + 4);
        next = t;
        break;
      }
      case 0x03: { // 載入
        const a = loadAddr;
        if (a === UART_ADDR) throw new Error(`UART 位址不可讀：pc=0x${pc.toString(16)}`);
        switch (f3) {
          case 0: this.setReg(rd, (this.loadByte(a) << 24) >> 24); break; // lb 符號擴展
          case 1: this.setReg(rd, (this.loadHalf(a) << 16) >> 16); break; // lh
          case 2: this.setReg(rd, this.loadWord(a)); break; // lw
          case 4: this.setReg(rd, this.loadByte(a)); break; // lbu
          case 5: this.setReg(rd, this.loadHalf(a)); break; // lhu
          default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      }
      case 0x23: { // 儲存
        const a = loadAddr;
        if (a === UART_ADDR) {
          // SB／SW 往 UART：追加低位元組，不真寫記憶體。
          if (f3 === 0 || f3 === 2) this.uart += String.fromCharCode(rv2 & 0xff);
          else throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
          break;
        }
        switch (f3) {
          case 0: this.storeByte(a, rv2); break;
          case 1: this.storeHalf(a, rv2); break;
          case 2: this.storeWord(a, rv2); break;
          default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      }
      case 0x13: { // I 型算術
        switch (f3) {
          case 0: this.setReg(rd, (sv1 + imm) | 0); break; // addi
          case 1: // slli（高位須為 0）
            if ((imm & 0xfe0) !== 0) throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
            this.setReg(rd, (rv1 << (imm & 0x1f)) >>> 0); break;
          case 2: this.setReg(rd, sv1 < imm ? 1 : 0); break; // slti
          case 3: this.setReg(rd, rv1 < U(imm) ? 1 : 0); break; // sltiu（imm 零擴展比較）
          case 4: this.setReg(rd, (sv1 ^ imm) | 0); break; // xori
          case 5:
            if ((imm & 0x400) === 0 && (imm & 0xfe0) === 0) this.setReg(rd, (rv1 >>> (imm & 0x1f)) >>> 0); // srli
            else if ((imm & 0xfe0) === 0x400) this.setReg(rd, (sv1 >> (imm & 0x1f)) >>> 0); // srai
            else throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
            break;
          case 6: this.setReg(rd, (sv1 | imm) | 0); break; // ori
          case 7: this.setReg(rd, (sv1 & imm) | 0); break; // andi
          default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      }
      case 0x33: { // R 型（含 M 擴充）
        const sh = rv2 & 0x1f;
        if (f7 === 0x00 || (f7 === 0x20 && (f3 === 0 || f3 === 5))) {
          switch (f3) {
            case 0:
              if (f7 === 0x00) this.setReg(rd, (sv1 + sv2) | 0); // add
              else this.setReg(rd, (sv1 - sv2) | 0); // sub
              break;
            case 1: this.setReg(rd, (rv1 << sh) >>> 0); break; // sll
            case 2: this.setReg(rd, sv1 < sv2 ? 1 : 0); break; // slt
            case 3: this.setReg(rd, rv1 < rv2 ? 1 : 0); break; // sltu
            case 4: this.setReg(rd, (sv1 ^ sv2) >>> 0); break; // xor
            case 5:
              if (f7 === 0x00) this.setReg(rd, (rv1 >>> sh) >>> 0); // srl
              else this.setReg(rd, (sv1 >> sh) >>> 0); // sra
              break;
            case 6: this.setReg(rd, (sv1 | sv2) >>> 0); break; // or
            case 7: this.setReg(rd, (sv1 & sv2) >>> 0); break; // and
            default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
          }
        } else if (f7 === 0x01) {
          const a = BigInt(sv1), b = BigInt(sv2);
          const ua = BigInt(rv1), ub = BigInt(rv2);
          const M32 = BigInt(0xffffffff);
          switch (f3) {
            case 0: this.setReg(rd, Number((a * b) & M32)); break; // mul 取低 32
            case 1: this.setReg(rd, Number((a * b >> BigInt(32)) & M32)); break; // mulh
            case 2: this.setReg(rd, Number((a * ub >> BigInt(32)) & M32)); break; // mulhsu
            case 3: this.setReg(rd, Number((ua * ub >> BigInt(32)) & M32)); break; // mulhu
            case 4: // div：除零→-1，溢出（INT_MIN/-1）→被除數
              if (sv2 === 0) this.setReg(rd, -1);
              else if (sv1 === INT_MIN && sv2 === -1) this.setReg(rd, INT_MIN);
              else this.setReg(rd, Math.trunc(sv1 / sv2));
              break;
            case 5: // divu：除零→全 1
              this.setReg(rd, sv2 === 0 ? 0xffffffff : Math.floor(rv1 / rv2));
              break;
            case 6: // rem：除零→被除數，溢出→0
              if (sv2 === 0) this.setReg(rd, sv1);
              else if (sv1 === INT_MIN && sv2 === -1) this.setReg(rd, 0);
              else this.setReg(rd, sv1 % sv2);
              break;
            case 7: // remu：除零→被除數
              this.setReg(rd, sv2 === 0 ? rv1 : rv1 % rv2);
              break;
            default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
          }
        } else {
          throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      }
      case 0x63: // B 型分支
        switch (f3) {
          case 0: branchTaken(sv1 === sv2); break;
          case 1: branchTaken(sv1 !== sv2); break;
          case 4: branchTaken(sv1 < sv2); break;
          case 5: branchTaken(sv1 >= sv2); break;
          case 6: branchTaken(rv1 < rv2); break;
          case 7: branchTaken(rv1 >= rv2); break;
          default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      case 0x0f: break; // fence：空運算
      case 0x0b: { // riscvgpu custom-0（單通道語意：tid=0、ntid=1、barrier=nop；多通道以 iverilog 為準）
        if (f7 !== 0 || rs1 !== 0 || rs2 !== 0) throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        if (f3 === 0) this.setReg(rd, 0); // tid
        else if (f3 === 1) this.setReg(rd, 1); // ntid
        else if (f3 === 2) { /* barrier：單通道無需等待 */ }
        else throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        break;
      }
      case 0x73: { // ecall／ebreak
        if (f3 !== 0) throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        if (imm === 1) { this.halted = true; this.exitCode = 0; break; } // ebreak：停機
        if (imm !== 0) throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        const a7 = this.regs[17] >>> 0, a0 = this.regs[10] >>> 0;
        if (a7 === 1) this.uart += String.fromCharCode(a0 & 0xff);
        else if (a7 === 10) { this.halted = true; this.exitCode = a0 | 0; }
        else throw new Error(`ECALL 未支援的 a7=${a7}：pc=0x${pc.toString(16)}`);
        break;
      }
      default:
        throw new Error(`未支援 opcode 0x${op.toString(16)}：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
    }

    this.pc = next;
    return { pc, word, halted: this.halted };
  }

  run({ maxSteps = 100000 } = {}) {
    let steps = 0;
    while (!this.halted) {
      if (steps >= maxSteps) throw new Error(`超過最大步數 ${maxSteps}`);
      this.step();
      steps++;
    }
    return { steps, halted: this.halted, exitCode: this.exitCode, uart: this.uart };
  }
}


return { assemble, disassemble, Emulator };
})();

/***** exports *****/
(function (win) {
  win.HackVM = {
    Vm,
    SCREEN_BASE, SCREEN_WORDS, SCREEN_ROWS, SCREEN_COLS, KBD_ADDR, RAM_WORDS,
    KEY_NEWLINE, KEY_BACKSPACE, KEY_LEFT, KEY_UP, KEY_RIGHT, KEY_DOWN,
  };
  win.HackAsm = { D_MAP, C_MAP, J_MAP, PREDEFINED, parseAsmLine, code2binary, assemble };
  win.HackVm2Asm = { translate };
  win.HackVm2Rv = { translate: Vm2Rv.translate };
  win.HackRv = {
    assemble: RvToolchain.assemble,
    disassemble: RvToolchain.disassemble,
    Emulator: RvToolchain.Emulator,
  };
  win.HackJack2Vm = { compileJack };
  win.HackHdl = {
    parseHdl,
    loadLibrary, mergeLibs, mergeLibsList, elab, Builtin,
    generateJs, topClassExpr, pinSan,
    parseScript, run,
    TopModel,
  };
})(window);
