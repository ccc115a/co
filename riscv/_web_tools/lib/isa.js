// lib/isa.js：RV32 指令集定義與編解碼原語（純 ES module、零依賴）。
// 涵蓋 RV32I 全部真指令＋M 擴充 8 條＋fence/ecall/ebreak。

// 暫存器 ABI 名→編號對照表。
export const REG = {
  zero: 0, ra: 1, sp: 2, gp: 3, tp: 4,
  t0: 5, t1: 6, t2: 7,
  s0: 8, fp: 8, s1: 9,
  a0: 10, a1: 11, a2: 12, a3: 13, a4: 14, a5: 15, a6: 16, a7: 17,
  s2: 18, s3: 19, s4: 20, s5: 21, s6: 22, s7: 23,
  s8: 24, s9: 25, s10: 26, s11: 27,
  t3: 28, t4: 29, t5: 30, t6: 31,
};

// 編號→x 名（反組譯用）。
export const REG_NAMES = Array.from({ length: 32 }, (_, i) => 'x' + i);

// 解析暫存器名：同時支援 x0-x31 與 ABI 名，大小寫皆可；非法則 throw。
export function regNum(name) {
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
export function encodeR(op, rd, rs1, rs2, f3, f7) {
  chkOp(op); chkReg(rd, 'rd'); chkReg(rs1, 'rs1'); chkReg(rs2, 'rs2'); chkF3(f3); chkF7(f7);
  return (((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0);
}

// I 型：imm[11:0]|rs1|f3|rd|op，imm 為 12 位有號數。
export function encodeI(op, rd, rs1, f3, imm) {
  chkOp(op); chkReg(rd, 'rd'); chkReg(rs1, 'rs1'); chkF3(f3);
  chkImmRange(imm, -2048, 2047, 'imm');
  return ((((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0);
}

// S 型：imm[11:5]|rs2|rs1|f3|imm[4:0]|op，imm 為 12 位有號數。
export function encodeS(op, rs1, rs2, f3, imm) {
  chkOp(op); chkReg(rs1, 'rs1'); chkReg(rs2, 'rs2'); chkF3(f3);
  chkImmRange(imm, -2048, 2047, 'imm');
  const u = imm & 0xfff;
  return ((((u >> 5) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((u & 0x1f) << 7) | op) >>> 0);
}

// B 型：imm 為 13 位有號偶數位移（-4096..4095 且最低位為 0）。
export function encodeB(op, rs1, rs2, f3, imm) {
  chkOp(op); chkReg(rs1, 'rs1'); chkReg(rs2, 'rs2'); chkF3(f3);
  chkImmRange(imm, -4096, 4095, 'imm');
  if ((imm & 1) !== 0) throw new Error(`分支位移必須為偶數：${imm}`);
  const u = imm & 0x1fff;
  const b12 = (u >> 12) & 1, b11 = (u >> 11) & 1, b10_5 = (u >> 5) & 0x3f, b4_1 = (u >> 1) & 0xf;
  return (((b12 << 31) | (b10_5 << 25) | (rs2 << 20) | (rs1 << 15) |
    (f3 << 12) | (b4_1 << 8) | (b11 << 7) | op) >>> 0);
}

// U 型：imm20 為高 20 位（接受 0..0xfffff，或 -524288..-1 以有號表示）。
export function encodeU(op, rd, imm20) {
  chkOp(op); chkReg(rd, 'rd');
  chkImmRange(imm20, -524288, 0xfffff, 'imm20');
  return ((((imm20 & 0xfffff) << 12) | (rd << 7) | op) >>> 0);
}

// J 型：imm 為 21 位有號偶數位移（-1048576..1048575 且最低位為 0）。
export function encodeJ(op, rd, imm) {
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
export function decodeWord(w) {
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
    case 0x6f: { // J
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
export const INSTR = [
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
];

// 以助憶符查表（小寫鍵）。
export const INSTR_MAP = Object.fromEntries(INSTR.map(e => [e.mn, e]));

// 虛擬指令名錄（展開規則見 rvasm.js）。
export const PSEUDO = ['nop', 'li', 'mv', 'not', 'neg', 'j', 'jr', 'ret', 'call'];
