// rvjs bundle（tools/build.js 產生，勿手動編輯）

/***** lib/isa.js *****/
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


/***** lib/rvasm.js *****/
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


/***** lib/rvdis.js *****/
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


/***** lib/rvemu.js *****/
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


/***** lib/cu2rv.js *****/
// lib/cu2rv.js：自訂高階 kernel 語言 → riscvgpu 組語（純 ES module、零依賴）。
// compileKernel(src) → { asm }；錯誤一律 throw（含行號，第N行）。
//
// 語言（.ku 檔，見 kernels/*.ku）：C-like 大括號、顯式 int、分號結尾、# 註解。
//
//   lanes 4;                 通道數（1..8；riscvgpu 預設 4）
//   n 16;                    總元素數（grid-stride loop，不必被 lanes 整除）
//   mem x[16] = i + 1;       陣列（自動配置，0x100 起；初始式只可用 i／常數／param）
//   mem y[16] @ 0x140;       @ 手動覆寫位址（字對齊、堆疊區外、不重疊）
//   param a: int = 2;        純量常數
//   func axpy(a: int, xi: int, yi: int) -> int {   真實 call/ret（下述 ABI）
//     t: int = a * xi;
//     return t + yi;
//   }
//   kernel saxpy {           單一 kernel（SPMD，每通道跑同一份）
//     for (i: int = tid; i < n; i += ntid) {
//       z[i] = axpy(a, x[i], y[i]);
//     }
//     barrier();
//   }
//   expect {                 lane0 逐項檢查（a0=錯誤數，a7=10 結束）
//     z[i] = 2 * (i + 1) + 10 * (i + 1);
//   }
//
// 敘述：v: int = e; ｜ v = e; ｜ A[e] = e; ｜ f(args); ｜ print(e);
//       if (c) {} else {} ｜ for (i: int = a; i < b; i += s) {} ｜
//       while (c) {} ｜ break; ｜ continue; ｜ return e; ｜ barrier();
// 運算式：整數 + - * / % & | ^ << >>、比較 == != < <= > >=、一元 - ~ !、
//   常數／i／迴圈變數／tid／ntid／n／param／區域變數／A[e]／f(args)。
//   * 的一邊須為常數（硬體無 M 擴充，shift-add 展開）；/ % 只吃 2 的冪次常數；
//   變數相乘、浮點數一律報錯。&&／|| 請用巢狀 if。
// ABI（教學用）：a0–a3 傳參、a0 回傳；每通道私有堆疊 sp = 0x1000 - tid*128；
//   callee 存 ra＋自己寫入的 s-regs；caller spill 活著的 pool／a-home 暫存。
// print(e) 以 ecall(a7=1) 逐字印十進位（IDE／rvemu 可見；硬體上 ecall 會停機，
//   僅供除錯）。輸出只用 RV32I＋li＋tid/ntid/barrier，不用 M 擴充。

const BASE_REGS = ['t2', 't3', 't4', 's0', 's1']; // 每個 mem 一個基址（上限 5 個）
const HOME_REGS = ['s2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
  'a1', 'a2', 'a3', 'a4', 'a5']; // 具名變數家（上限 15 個並存）
const HARD_SCRATCH = ['t5', 't6', 'a6', 'a7']; // 運算式暫存（a7 只在 ecall 空窗期用）
const DMEM_DATA_END = 0xC00; // 資料區上限；0xC00..0xFFF 為 8 通道私有堆疊（各 128B）
const STACK_TOP = 0x1000;
const STACK_SHIFT = 7; // 每通道 128B = 1<<7
const IMEM_LIMIT = 200;

const RESERVED = new Set(['tid', 'ntid', 'n', 'int', 'if', 'else', 'for', 'while',
  'break', 'continue', 'return', 'barrier', 'print', 'lanes', 'mem', 'param',
  'func', 'kernel', 'expect']);

function err(line, msg) {
  throw new Error(`第${line}行：${msg}`);
}

// ---------- lexer ----------
function lex(src) {
  const toks = [];
  let i = 0, line = 1;
  const push = (t, v) => toks.push({ t, v, line });
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '"') err(line, '不支援字串常數');
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '<<', '>>', '+=', '-=', '->'].includes(two)) {
      push('sym', two); i += 2; continue;
    }
    if ('+-*/%&|^~!<>='.includes(c)) { push('sym', c); i++; continue; }
    if ('(){}[];,:@'.includes(c)) { push('sym', c); i++; continue; }
    let m = /^0[xX][0-9a-fA-F]+/.exec(src.slice(i));
    if (m) { push('num', Number(m[0])); i += m[0].length; continue; }
    m = /^\d+/.exec(src.slice(i));
    if (m) {
      if (src[i + m[0].length] === '.' && /\d/.test(src[i + m[0].length + 1] || '')) {
        err(line, `不支援浮點數（riscvgpu 無 F 擴充）：${m[0]}...`);
      }
      push('num', Number(m[0])); i += m[0].length; continue;
    }
    m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (m) { push('id', m[0]); i += m[0].length; continue; }
    if (c === '.') err(line, '不支援浮點數（riscvgpu 無 F 擴充）');
    err(line, `無法解析的字元：${c}`);
  }
  push('eof', '');
  return toks;
}

// ---------- parser ----------
function parseKu(src) {
  const toks = lex(src);
  let pos = 0;
  const peek = (k = 0) => toks[pos + k];
  const next = () => toks[pos++];
  const at = (t, v) => peek().t === t && (v === undefined || peek().v === v);
  const eat = (t, v) => {
    const tk = peek();
    if (tk.t !== t || (v !== undefined && tk.v !== v)) {
      err(tk.line, `語法錯誤：此處須為「${v !== undefined ? v : t}」，實為「${tk.v}」`);
    }
    pos++;
    return tk;
  };
  const eatId = (what) => {
    const tk = peek();
    if (tk.t !== 'id') err(tk.line, `語法錯誤：此處須為${what}`);
    pos++;
    return tk;
  };

  function parseExpr() { return parseEq(); }
  function parseEq() {
    let x = parseRel();
    while (at('sym') && (peek().v === '==' || peek().v === '!=')) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseRel(), line: x.line };
    }
    return x;
  }
  function parseRel() {
    let x = parseShift();
    while (at('sym') && ['<', '<=', '>', '>='].includes(peek().v)) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseShift(), line: x.line };
    }
    return x;
  }
  function parseShift() {
    let x = parseAdd();
    while (at('sym') && (peek().v === '<<' || peek().v === '>>')) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseAdd(), line: x.line };
    }
    return x;
  }
  function parseAdd() {
    let x = parseMul();
    while (at('sym') && (peek().v === '+' || peek().v === '-' || peek().v === '&' || peek().v === '|' || peek().v === '^')) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseMul(), line: x.line };
    }
    return x;
  }
  function parseMul() {
    let x = parseUnary();
    while (at('sym') && (peek().v === '*' || peek().v === '/' || peek().v === '%')) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseUnary(), line: x.line };
    }
    return x;
  }
  function parseUnary() {
    const tk = peek();
    if (tk.t === 'sym' && (tk.v === '-' || tk.v === '~' || tk.v === '!')) {
      next();
      return { k: 'un', op: tk.v, x: parseUnary(), line: tk.line };
    }
    return parsePostfix();
  }
  function parsePostfix() {
    const tk = peek();
    if (tk.t === 'num') { next(); return { k: 'num', v: tk.v, line: tk.line }; }
    if (tk.t === 'id' && (tk.v === 'tid' || tk.v === 'ntid' || tk.v === 'n')) {
      next(); return { k: 'sys', n: tk.v, line: tk.line };
    }
    if (tk.t === 'id') {
      next();
      if (at('sym', '(')) {
        next();
        const args = [];
        if (!at('sym', ')')) {
          args.push(parseExpr());
          while (at('sym', ',')) { next(); args.push(parseExpr()); }
        }
        eat('sym', ')');
        return { k: 'call', f: tk.v, args, line: tk.line };
      }
      if (at('sym', '[')) {
        next();
        const idx = parseExpr();
        eat('sym', ']');
        return { k: 'load', m: tk.v, idx, line: tk.line };
      }
      return { k: 'name', n: tk.v, line: tk.line };
    }
    if (at('sym', '(')) {
      next();
      const x = parseExpr();
      eat('sym', ')');
      return x;
    }
    err(tk.line, `運算式無法解析（多出「${tk.v}」）`);
  }

  function parseBlock() {
    eat('sym', '{');
    const stmts = [];
    while (!at('sym', '}')) {
      if (at('eof')) err(peek().line, '缺少 }');
      stmts.push(parseStmt());
    }
    eat('sym', '}');
    return stmts;
  }

  function parseStmt() {
    const tk = peek();
    if (tk.t !== 'id') err(tk.line, `敘述須以關鍵字或變數開頭（多出「${tk.v}」）`);
    const kw = tk.v;
    if (kw === 'return') {
      next();
      const x = parseExpr();
      eat('sym', ';');
      return { k: 'return', x, line: tk.line };
    }
    if (kw === 'if') {
      next();
      eat('sym', '(');
      const c = parseExpr();
      eat('sym', ')');
      const t = parseBlock();
      let e = null;
      if (at('id', 'else')) { next(); e = parseBlock(); }
      return { k: 'if', c, t, e, line: tk.line };
    }
    if (kw === 'while') {
      next();
      eat('sym', '(');
      const c = parseExpr();
      eat('sym', ')');
      const b = parseBlock();
      return { k: 'while', c, b, line: tk.line };
    }
    if (kw === 'for') {
      next();
      eat('sym', '(');
      const vn = eatId('迴圈變數').v;
      eat('sym', ':');
      const ty = eatId('型別').v;
      if (ty !== 'int') err(tk.line, `只支援 int 型別：${ty}`);
      eat('sym', '=');
      const init = parseExpr();
      eat('sym', ';');
      const cond = parseExpr();
      eat('sym', ';');
      const sv = eatId('迴圈變數').v;
      if (sv !== vn) err(tk.line, `for 步進變數須與迴圈變數一致：${vn}／${sv}`);
      const sop = eat('sym').v;
      if (sop !== '+=' && sop !== '-=') err(tk.line, `for 步進只支援 +=／-=：${sop}`);
      const step = parseExpr();
      eat('sym', ')');
      const b = parseBlock();
      return { k: 'for', vn, init, cond, sop, step, b, line: tk.line };
    }
    if (kw === 'break' || kw === 'continue') {
      next();
      eat('sym', ';');
      return { k: kw, line: tk.line };
    }
    if (kw === 'barrier' || kw === 'print') {
      next();
      eat('sym', '(');
      const args = [];
      if (kw === 'print') args.push(parseExpr());
      eat('sym', ')');
      eat('sym', ';');
      return { k: kw, args, line: tk.line };
    }
    next();
    if (at('sym', ':')) {
      next();
      const ty = eatId('型別').v;
      if (ty !== 'int') err(tk.line, `只支援 int 型別：${ty}`);
      eat('sym', '=');
      const x = parseExpr();
      eat('sym', ';');
      return { k: 'decl', n: kw, x, line: tk.line };
    }
    if (at('sym', '=')) {
      next();
      const x = parseExpr();
      eat('sym', ';');
      return { k: 'assign', n: kw, x, line: tk.line };
    }
    if (at('sym', '[')) {
      next();
      const idx = parseExpr();
      eat('sym', ']');
      eat('sym', '=');
      const x = parseExpr();
      eat('sym', ';');
      return { k: 'store', m: kw, idx, x, line: tk.line };
    }
    if (at('sym', '(')) {
      next();
      const args = [];
      if (!at('sym', ')')) {
        args.push(parseExpr());
        while (at('sym', ',')) { next(); args.push(parseExpr()); }
      }
      eat('sym', ')');
      eat('sym', ';');
      return { k: 'callstmt', f: kw, args, line: tk.line };
    }
    err(tk.line, `無法解析的敘述：${kw} …`);
  }

  // constExpr：支援一元負號的常數運算式（param 值、mem 位址用）
  function parseConstExpr() {
    const x = parseExpr();
    return x;
  }

  const prog = { lanes: 0, n: 0, mems: [], params: [], funcs: [], kernel: null, expect: null };
  const seenHead = {};
  const memNames = new Set();
  const paramNames = new Set();
  const funcNames = new Set();
  while (!at('eof')) {
    const tk = peek();
    if (tk.t !== 'id') err(tk.line, `頂層須為 lanes／n／mem／param／func／kernel／expect（多出「${tk.v}」）`);
    if (tk.v === 'lanes' || tk.v === 'n') {
      if (seenHead[tk.v]) err(tk.line, `${tk.v} 重複定義`);
      seenHead[tk.v] = true;
      next();
      const v = eat('num');
      if (!Number.isInteger(v.v) || v.v < 1) err(tk.line, `${tk.v} 須為正整數`);
      prog[tk.v] = v.v;
      eat('sym', ';');
      continue;
    }
    if (tk.v === 'mem') {
      next();
      const name = eatId('陣列名').v;
      if (memNames.has(name)) err(tk.line, `mem 重複定義：${name}`);
      if (RESERVED.has(name)) err(tk.line, `mem 名稱保留：${name}`);
      memNames.add(name);
      eat('sym', '[');
      const len = parseConstExpr();
      eat('sym', ']');
      let addr = null;
      if (at('sym', '@')) {
        next();
        addr = parseConstExpr();
      }
      let init = null;
      if (at('sym', '=')) {
        next();
        init = parseExpr();
      }
      eat('sym', ';');
      prog.mems.push({ name, len, addr, init, line: tk.line });
      continue;
    }
    if (tk.v === 'param') {
      next();
      const name = eatId('參數名').v;
      if (paramNames.has(name) || memNames.has(name)) err(tk.line, `param 名稱衝突：${name}`);
      if (RESERVED.has(name)) err(tk.line, `param 名稱保留：${name}`);
      paramNames.add(name);
      eat('sym', ':');
      const ty = eatId('型別').v;
      if (ty !== 'int') err(tk.line, `只支援 int 型別：${ty}`);
      eat('sym', '=');
      const v = parseConstExpr();
      eat('sym', ';');
      prog.params.push({ name, v, line: tk.line });
      continue;
    }
    if (tk.v === 'func') {
      next();
      const name = eatId('函式名').v;
      if (funcNames.has(name)) err(tk.line, `func 重複定義：${name}`);
      if (RESERVED.has(name)) err(tk.line, `func 名稱保留：${name}`);
      funcNames.add(name);
      eat('sym', '(');
      const fparams = [];
      if (!at('sym', ')')) {
        for (;;) {
          const pn = eatId('參數名').v;
          if (RESERVED.has(pn)) err(tk.line, `參數名稱保留：${pn}`);
          eat('sym', ':');
          const ty = eatId('型別').v;
          if (ty !== 'int') err(tk.line, `只支援 int 型別：${ty}`);
          fparams.push(pn);
          if (at('sym', ',')) { next(); continue; }
          break;
        }
      }
      eat('sym', ')');
      eat('sym', '->');
      const rt = eatId('回傳型別').v;
      if (rt !== 'int') err(tk.line, `只支援 int 回傳：${rt}`);
      const body = parseBlock();
      if (fparams.length > 4) err(tk.line, `參數太多（上限 4 個）：${name}`);
      if (new Set(fparams).size !== fparams.length) err(tk.line, `參數重名：${name}`);
      prog.funcs.push({ name, fparams, body, line: tk.line });
      continue;
    }
    if (tk.v === 'kernel') {
      if (prog.kernel) err(tk.line, '只支援一個 kernel');
      next();
      const name = eatId('kernel 名').v;
      const body = parseBlock();
      prog.kernel = { name, body, line: tk.line };
      continue;
    }
    if (tk.v === 'expect') {
      if (prog.expect) err(tk.line, '只支援一個 expect 段');
      next();
      const body = parseBlock();
      prog.expect = { body, line: tk.line };
      continue;
    }
    err(tk.line, `頂層關鍵字錯誤：${tk.v}`);
  }
  if (!seenHead.lanes) throw new Error('缺少 lanes 定義');
  if (!seenHead.n) throw new Error('缺少 n 定義');
  if (prog.lanes < 1 || prog.lanes > 8) throw new Error(`lanes 須為 1..8：${prog.lanes}`);
  if (prog.mems.length === 0) throw new Error('至少宣告一個 mem');
  if (prog.mems.length > BASE_REGS.length) throw new Error(`mem 太多（上限 ${BASE_REGS.length} 個）`);
  if (!prog.kernel) throw new Error('缺少 kernel 段');
  return prog;
}

// 常數折疊：純常數回傳數值，否則 null。env：{params, n}。
function constVal(node, env) {
  switch (node.k) {
    case 'num': return node.v;
    case 'sys': return node.n === 'n' ? env.n : null;
    case 'name': return (node.n in env.params) ? env.params[node.n] : null;
    case 'un': {
      const v = constVal(node.x, env);
      if (v === null) return null;
      if (node.op === '-') return -v;
      if (node.op === '~') return ~v;
      return v === 0 ? 1 : 0;
    }
    case 'bin': {
      const a = constVal(node.x, env), b = constVal(node.y, env);
      if (a === null || b === null) return null;
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
        case '<': return a < b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        default: return null;
      }
    }
    default: return null;
  }
}

function isPow2(v) {
  return Number.isInteger(v) && v > 0 && (v & (v - 1)) === 0;
}
function log2int(v) {
  let k = 0;
  while ((1 << k) < v) k++;
  return k;
}

// ---------- 語意驗證＋記憶體配置 ----------
// 回傳 {mems[{name,len,addr,init}], paramRegs{name:reg}, funcMap, env}
function check(prog) {
  const env = { n: prog.n, params: {} };
  // param 值（常數運算式，可引用先前的 param）
  for (const p of prog.params) {
    const v = constVal(p.v, env);
    if (v === null || !Number.isInteger(v)) err(p.line, `param 須為常數運算式：${p.name}`);
    if (v < -0x80000000 || v > 0xffffffff) err(p.line, `param 超出 32 位範圍：${p.name}`);
    env.params[p.name] = v | 0;
  }
  const mems = prog.mems.map((m) => {
    const len = constVal(m.len, env);
    if (len === null || !Number.isInteger(len) || len < 1) err(m.line, `mem 長度須為正整數常數：${m.name}`);
    let addr = null;
    if (m.addr !== null) {
      const a = constVal(m.addr, env);
      if (a === null || !Number.isInteger(a) || a < 0) err(m.line, `mem 位址須為非負整數常數：${m.name}`);
      if (a % 4 !== 0) err(m.line, `mem 位址須字對齊：${m.name}`);
      addr = a;
    }
    return { name: m.name, len, addr, init: m.init, line: m.line };
  });
  let cursor = 0x100;
  for (const m of mems) {
    if (m.addr === null) {
      m.addr = cursor;
      cursor += m.len * 4;
    }
  }
  for (const m of mems) {
    if (m.addr + m.len * 4 > DMEM_DATA_END) {
      err(m.line, `mem ${m.name} 超出資料區（0x100..0x${DMEM_DATA_END.toString(16)}，上方為堆疊保留）`);
    }
  }
  const ranges = mems.map(m => [m.addr, m.addr + m.len * 4, m.name]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] < ranges[i - 1][1]) {
      err(prog.mems.find(m => m.name === ranges[i][2]).line, `mem ${ranges[i][2]} 與 mem ${ranges[i - 1][2]} 位址重疊`);
    }
  }
  const memSet = new Set(mems.map(m => m.name));
  const funcMap = new Map(prog.funcs.map(f => [f.name, f]));

  // home 預配（只計並存量；codegen 重建相同配置）
  const freeHomes = [...HOME_REGS];
  const active = new Map();
  const scopeStack = [[]];
  const allocHome = (name, line) => {
    if (RESERVED.has(name)) err(line, `名稱保留：${name}`);
    const cur = scopeStack[scopeStack.length - 1];
    if (cur.some((e) => e.name === name)) err(line, `變數重複定義：${name}`);
    if (freeHomes.length === 0) err(line, `變數太多（上限 ${HOME_REGS.length} 個並存具名變數）`);
    const reg = freeHomes.shift();
    cur.push({ name, prev: active.has(name) ? active.get(name) : undefined });
    active.set(name, reg);
    return reg;
  };
  const pushScope = () => scopeStack.push([]);
  const freeScope = () => {
    for (const { name, prev } of scopeStack.pop()) {
      freeHomes.unshift(active.get(name));
      if (prev === undefined) active.delete(name);
      else active.set(name, prev);
    }
  };

  function checkExpr(node, o) {
    switch (node.k) {
      case 'num':
        if (!Number.isInteger(node.v) || node.v < -0x80000000 || node.v > 0xffffffff) {
          err(node.line, `常數超出 32 位範圍：${node.v}`);
        }
        return;
      case 'sys': return;
      case 'name':
        if (o.allowI && node.n === 'i') return;
        if (!(node.n in env.params) && !active.has(node.n)) err(node.line, `未定義的變數：${node.n}`);
        return;
      case 'load':
        if (!o.allowLoad) err(node.line, `${o.pure}段不可讀 mem`);
        if (!memSet.has(node.m)) err(node.line, `未宣告的 mem：${node.m}`);
        checkExpr(node.idx, o);
        return;
      case 'un':
        checkExpr(node.x, o);
        return;
      case 'bin': {
        checkExpr(node.x, o);
        checkExpr(node.y, o);
        if (node.op === '*') {
          const a = constVal(node.x, env), b = constVal(node.y, env);
          if (a === null && b === null) {
            err(node.line, '變數相乘需 M 擴充，硬體不支援（* 的一邊須為常數或 param）');
          }
        }
        if (node.op === '/' || node.op === '%') {
          const d = constVal(node.y, env);
          if (d === null || !isPow2(d)) {
            err(node.line, '整數除法只支援 2 的冪次常數除數（硬體無除法器）');
          }
        }
        if (node.op === '&&' || node.op === '||') err(node.line, '不支援 &&／||，請用巢狀 if');
        return;
      }
      case 'call': {
        if (!o.allowCall) err(node.line, `${o.pure}段不可呼叫函式`);
        const f = funcMap.get(node.f);
        if (!f) err(node.line, `未定義的函式：${node.f}`);
        if (node.args.length !== f.fparams.length) {
          err(node.line, `${node.f} 參數數量錯誤（要 ${f.fparams.length} 個，得 ${node.args.length} 個）`);
        }
        for (const a of node.args) checkExpr(a, o);
        return;
      }
    }
  }

  function checkStmts(stmts, s) {
    for (const st of stmts) checkStmt(st, s);
  }
  function checkStmt(st, s) {
    switch (st.k) {
      case 'decl':
        if (memSet.has(st.n) || funcMap.has(st.n)) err(st.line, `名稱衝突：${st.n}`);
        allocHome(st.n, st.line);
        checkExpr(st.x, { allowLoad: true, allowCall: true });
        return;
      case 'assign':
        if (!(st.n in env.params) && !active.has(st.n)) err(st.line, `未定義的變數：${st.n}`);
        checkExpr(st.x, { allowLoad: true, allowCall: true });
        return;
      case 'store':
        if (!memSet.has(st.m)) err(st.line, `未宣告的 mem：${st.m}`);
        checkExpr(st.idx, { allowLoad: true, allowCall: true });
        checkExpr(st.x, { allowLoad: true, allowCall: true });
        return;
      case 'callstmt': {
        const f = funcMap.get(st.f);
        if (!f) err(st.line, `未定義的函式：${st.f}`);
        if (st.args.length !== f.fparams.length) {
          err(st.line, `${st.f} 參數數量錯誤（要 ${f.fparams.length} 個，得 ${st.args.length} 個）`);
        }
        for (const a of st.args) checkExpr(a, { allowLoad: true, allowCall: true });
        return;
      }
      case 'print':
        checkExpr(st.args[0], { allowLoad: true, allowCall: true });
        return;
      case 'barrier':
        if (s.inExpect) err(st.line, 'expect 段不可用 barrier（僅 lane0 執行，會永等）');
        return;
      case 'return':
        if (!s.inFunc) err(st.line, 'return 只可出現在 func 內');
        checkExpr(st.x, { allowLoad: true, allowCall: true });
        s.hasReturn = true;
        return;
      case 'break': case 'continue':
        if (s.loopDepth === 0) err(st.line, `${st.k} 只可出現在迴圈內`);
        return;
      case 'if':
        checkExpr(st.c, { allowLoad: true, allowCall: true });
        pushScope(); checkStmts(st.t, s); freeScope();
        if (st.e) { pushScope(); checkStmts(st.e, s); freeScope(); }
        return;
      case 'while':
        checkExpr(st.c, { allowLoad: true, allowCall: true });
        s.loopDepth++;
        pushScope(); checkStmts(st.b, s); freeScope();
        s.loopDepth--;
        return;
      case 'for': {
        checkExpr(st.init, { allowLoad: true, allowCall: true });
        s.loopDepth++;
        pushScope();
        if (memSet.has(st.vn) || funcMap.has(st.vn)) {
          err(st.line, `迴圈變數名稱衝突：${st.vn}`);
        }
        // 允許遮蔽外層 param／變數（標準 shadowing；mem／func 名仍禁）
        allocHome(st.vn, st.line);
        checkExpr(st.cond, { allowLoad: true, allowCall: true });
        checkExpr(st.step, { allowLoad: true, allowCall: true });
        checkStmts(st.b, s);
        freeScope();
        s.loopDepth--;
        return;
      }
    }
  }

  pushScope();
  const paramRegs = {};
  for (const p of prog.params) paramRegs[p.name] = allocHome(p.name, p.line);
  for (const f of prog.funcs) {
    pushScope();
    const s = { inFunc: true, loopDepth: 0, hasReturn: false, inExpect: false };
    for (const pn of f.fparams) allocHome(pn, f.line);
    checkStmts(f.body, s);
    if (!s.hasReturn) err(f.line, `func 缺少 return：${f.name}`);
    freeScope();
  }
  pushScope();
  checkStmts(prog.kernel.body, { inFunc: false, loopDepth: 0, hasReturn: false, inExpect: false });
  freeScope();
  for (const m of mems) {
    if (!m.init) continue;
    checkExpr(m.init, { allowLoad: false, allowCall: false, pure: 'init', allowI: true });
  }
  if (prog.expect) {
    for (const st of prog.expect.body) {
      if (st.k !== 'store') err(st.line, 'expect 段只接受 M[idx] = 運算式');
      if (!memSet.has(st.m)) err(st.line, `未宣告的 mem：${st.m}`);
      const idxIsI = st.idx.k === 'name' && st.idx.n === 'i';
      if (!idxIsI) {
        const c = constVal(st.idx, env);
        if (c === null || !Number.isInteger(c) || c < 0) err(st.line, 'expect 索引須為 i 或非負常數');
      }
      checkExpr(st.idx, { allowLoad: false, allowCall: false, pure: 'expect', allowI: idxIsI });
      checkExpr(st.x, { allowLoad: true, allowCall: true, pure: 'expect', allowI: idxIsI });
    }
  }
  freeScope();
  return { mems, paramRegs, funcMap, env };
}

// ---------- 程式碼產生 ----------
function Emitter() {
  return {
    lines: [],
    emit(s) { this.lines.push(s); },
    insnCount() {
      return this.lines.filter((l) => {
        const t = l.trim();
        return t !== '' && !t.startsWith('#') && !t.endsWith(':');
      }).length;
    },
  };
}

let labelSeq = 0;
function freshLabel(p) {
  return `${p}${labelSeq++}`;
}

// 常數乘法（shift-add，不用 mul）：out = src * c。scratch 為 2 個空閒 hard 暫存。
function mulConst(em, out, src, c, scratch, line) {
  if (c === 0) { em.emit(`        li      ${out}, 0`); return; }
  if (c === 1) { em.emit(`        addi    ${out}, ${src}, 0`); return; }
  if (c < 0) {
    mulConst(em, out, src, -c, scratch, line);
    em.emit(`        sub     ${out}, x0, ${out}`);
    return;
  }
  const bits = [];
  for (let k = 0; k < 32; k++) if ((c >>> 0) & (1 << k)) bits.push(k);
  if (bits.length === 1) {
    const k = bits[0];
    if (k === 0) em.emit(`        addi    ${out}, ${src}, 0`);
    else em.emit(`        slli    ${out}, ${src}, ${k}`);
    return;
  }
  const [T, U] = scratch;
  if (T === undefined || U === undefined) err(line, '運算式太複雜，請拆成多個敘述');
  const k0 = bits[0];
  em.emit(k0 === 0 ? `        addi    ${T}, ${src}, 0` : `        slli    ${T}, ${src}, ${k0}`);
  for (const k of bits.slice(1)) {
    em.emit(k === 0 ? `        addi    ${U}, ${src}, 0` : `        slli    ${U}, ${src}, ${k}`);
    em.emit(`        add     ${T}, ${T}, ${U}`);
  }
  em.emit(`        addi    ${out}, ${T}, 0`);
}

function makePool() {
  const free = [...HARD_SCRATCH];
  const ownedSet = new Set();
  return {
    alloc(line) {
      if (free.length === 0) err(line, '運算式太複雜，請拆成多個敘述');
      const r = free.pop();
      ownedSet.add(r);
      return r;
    },
    free(r) {
      if (ownedSet.has(r)) { ownedSet.delete(r); free.push(r); }
    },
    owned(r) { return ownedSet.has(r); },
    ownedList() { return [...ownedSet]; },
    peekExcept(line, exclude) {
      const out = free.filter((r) => !exclude.includes(r)).slice(-2);
      return out;
    },
  };
}

function compileKernel(src) {
  labelSeq = 0;
  const prog = parseKu(src);
  const ck = check(prog);
  const em = Emitter();
  const baseOf = (m) => BASE_REGS[ck.mems.findIndex((x) => x.name === m)];

  // home 分配（與 check 相同順序，配置一致）
  const freeHomes = [...HOME_REGS];
  const active = new Map();
  const scopeStack = [[]];
  for (const p of prog.params) {
    const want = ck.paramRegs[p.name];
    const at = freeHomes.indexOf(want);
    freeHomes.splice(at, 1);
    active.set(p.name, want);
    scopeStack[0].push(p.name);
  }
  const allocHome = (name, line) => {
    const cur = scopeStack[scopeStack.length - 1];
    if (cur.some((e) => e.name === name)) err(line, `變數重複定義：${name}`);
    if (freeHomes.length === 0) err(line, `變數太多（上限 ${HOME_REGS.length} 個並存具名變數）`);
    const reg = freeHomes.shift();
    cur.push({ name, prev: active.has(name) ? active.get(name) : undefined });
    active.set(name, reg);
    return reg;
  };
  const homeOf = (name, line) => {
    if (name in ck.env.params) return ck.paramRegs[name];
    if (!active.has(name)) err(line, `未定義的變數：${name}`);
    return active.get(name);
  };
  const pushScope = () => scopeStack.push([]);
  const freeScope = () => {
    for (const { name, prev } of scopeStack.pop()) {
      freeHomes.unshift(active.get(name));
      if (prev === undefined) active.delete(name);
      else active.set(name, prev);
    }
  };
  const ctx = {
    env: ck.env,
    funcMap: ck.funcMap,
    baseOf,
    homeOf,
    hasHome: (name) => (name in ck.env.params) || active.has(name),
    liveAHomes: () => {
      const out = [];
      for (const r of active.values()) if (/^a[1-5]$/.test(r) && !out.includes(r)) out.push(r);
      return out;
    },
    loopStack: [],
    needPrint: false,
    curWrites: null, // func 本體寫入的 s-reg 追蹤（genFunc 設定）
    noteWrite: (r) => {
      if (ctx.curWrites && /^s\d+$/.test(r) && !BASE_REGS.includes(r)) ctx.curWrites.add(r);
    },
  };

  // 索引位址：{base, off}（常數短位移）或 {reg}（pool 所有）
  function indexAddr(pool, mem, idxNode, mode) {
    const line = idxNode.line;
    const c = constVal(idxNode, ctx.env);
    const base = baseOf(mem);
    if (c !== null) {
      const off = c * 4;
      if (off >= -2048 && off <= 2047) return { base, off };
    }
    const iv = evalExpr(pool, idxNode, mode);
    const addr = pool.alloc(line);
    em.emit(`        slli    ${addr}, ${iv}, 2`);
    em.emit(`        add     ${addr}, ${base}, ${addr}`);
    pool.free(iv);
    return { reg: addr };
  }
  function emitLoad(pool, mem, idxNode, mode) {
    const a = indexAddr(pool, mem, idxNode, mode);
    const r = pool.alloc(idxNode.line);
    if (a.reg) {
      em.emit(`        lw      ${r}, 0(${a.reg})`);
      pool.free(a.reg);
    } else {
      em.emit(`        lw      ${r}, ${a.off}(${a.base})`);
    }
    return r;
  }
  function emitStore(pool, mem, idxNode, valReg, mode) {
    const a = indexAddr(pool, mem, idxNode, mode);
    if (a.reg) {
      em.emit(`        sw      ${valReg}, 0(${a.reg})`);
      pool.free(a.reg);
    } else {
      em.emit(`        sw      ${valReg}, ${a.off}(${a.base})`);
    }
    pool.free(valReg);
  }

  // 運算式求值 → 暫存器名（pool 所有；具名 home 直接回傳不佔用）
  function evalExpr(pool, node, mode) {
    const line = node.line;
    switch (node.k) {
      case 'num': {
        const r = pool.alloc(line);
        em.emit(`        li      ${r}, ${node.v}`);
        return r;
      }
      case 'sys': {
        const r = pool.alloc(line);
        if (node.n === 'tid') em.emit(`        addi    ${r}, t0, 0`);
        else if (node.n === 'ntid') em.emit(`        addi    ${r}, t1, 0`);
        else em.emit(`        li      ${r}, ${ctx.env.n}`);
        return r;
      }
      case 'name': {
        if (node.n === 'i' && !ctx.hasHome('i') && mode.idx) {
          const r = pool.alloc(line);
          em.emit(`        addi    ${r}, ${mode.idx}, 0`);
          return r;
        }
        return homeOf(node.n, line);
      }
      case 'load':
        return emitLoad(pool, node.m, node.idx, mode);
      case 'un': {
        const a = evalExpr(pool, node.x, mode);
        if (node.op === '-') {
          if (pool.owned(a)) { em.emit(`        sub     ${a}, x0, ${a}`); return a; }
          const r = pool.alloc(line);
          em.emit(`        sub     ${r}, x0, ${a}`);
          return r;
        }
        if (node.op === '~') {
          if (pool.owned(a)) { em.emit(`        xori    ${a}, ${a}, -1`); return a; }
          const r = pool.alloc(line);
          em.emit(`        xori    ${r}, ${a}, -1`);
          return r;
        }
        if (pool.owned(a)) { em.emit(`        sltiu   ${a}, ${a}, 1`); return a; }
        const r2 = pool.alloc(line);
        em.emit(`        sltiu   ${r2}, ${a}, 1`);
        return r2;
      }
      case 'bin': {
        const op = node.op;
        if (['==', '!=', '<', '<=', '>', '>='].includes(op)) {
          return evalCmp(pool, node, mode);
        }
        if (op === '*') {
          const c = constVal(node.x, ctx.env);
          const d = constVal(node.y, ctx.env);
          if (c !== null && d !== null) {
            const r = pool.alloc(line);
            em.emit(`        li      ${r}, ${c * d}`);
            return r;
          }
          const varSide = c !== null ? node.y : node.x;
          const k = c !== null ? c : d;
          const a = evalExpr(pool, varSide, mode);
          if (pool.owned(a)) {
            mulConst(em, a, a, k, pool.peekExcept(line, []), line);
            return a;
          }
          const r = pool.alloc(line);
          mulConst(em, r, a, k, pool.peekExcept(line, [r]), line);
          return r;
        }
        if (op === '/' || op === '%') {
          const d = constVal(node.y, ctx.env);
          const k = log2int(d);
          const a = evalExpr(pool, node.x, mode);
          const out = pool.owned(a) ? a : pool.alloc(line);
          if (out !== a) em.emit(`        addi    ${out}, ${a}, 0`);
          if (op === '/') {
            // 向零取整除法（2^k）：負數先加偏置
            const adj = pool.alloc(line);
            em.emit(`        srai    ${adj}, ${out}, 31`);
            em.emit(`        andi    ${adj}, ${adj}, ${d - 1}`);
            em.emit(`        add     ${out}, ${out}, ${adj}`);
            em.emit(`        srai    ${out}, ${out}, ${k}`);
            pool.free(adj);
          } else {
            // r = x - trunc(x/d)*d
            const q = pool.alloc(line);
            const adj = pool.alloc(line);
            em.emit(`        srai    ${adj}, ${out}, 31`);
            em.emit(`        andi    ${adj}, ${adj}, ${d - 1}`);
            em.emit(`        add     ${q}, ${out}, ${adj}`);
            em.emit(`        srai    ${q}, ${q}, ${k}`);
            em.emit(`        slli    ${adj}, ${q}, ${k}`);
            em.emit(`        sub     ${out}, ${out}, ${adj}`);
            pool.free(q);
            pool.free(adj);
          }
          return out;
        }
        if (op === '<<' || op === '>>') {
          const a = evalExpr(pool, node.x, mode);
          const b = evalExpr(pool, node.y, mode);
          const mn = op === '<<' ? 'sll' : 'sra';
          if (pool.owned(a)) {
            em.emit(`        ${mn}     ${a}, ${a}, ${b}`);
            pool.free(b);
            return a;
          }
          const r = pool.alloc(line);
          em.emit(`        ${mn}     ${r}, ${a}, ${b}`);
          pool.free(b);
          return r;
        }
        // + - & | ^
        const a = evalExpr(pool, node.x, mode);
        const b = evalExpr(pool, node.y, mode);
        const mn = op === '+' ? 'add' : op === '-' ? 'sub' : op === '&' ? 'and' : op === '|' ? 'or' : 'xor';
        if (pool.owned(a)) {
          em.emit(`        ${mn}     ${a}, ${a}, ${b}`);
          pool.free(b);
          return a;
        }
        if (pool.owned(b)) {
          em.emit(`        ${mn}     ${b}, ${a}, ${b}`);
          return b;
        }
        const r = pool.alloc(line);
        em.emit(`        ${mn}     ${r}, ${a}, ${b}`);
        pool.free(b);
        return r;
      }
      case 'call':
        return evalCall(pool, node.f, node.args, mode, line, true);
    }
  }

  function evalCmp(pool, node, mode) {
    const line = node.line;
    const op = node.op;
    const a = evalExpr(pool, node.x, mode);
    const b = evalExpr(pool, node.y, mode);
    const out = pool.owned(a) ? a : (pool.owned(b) && (op === '==' || op === '!=') ? b : pool.alloc(line));
    const freeA = pool.owned(a) && out !== a;
    const freeB = pool.owned(b) && out !== b;
    const done = (r) => {
      if (freeA) pool.free(a);
      if (freeB) pool.free(b);
      return r;
    };
    switch (op) {
      case '<':
        em.emit(`        slt     ${out}, ${a}, ${b}`);
        return done(out);
      case '>':
        em.emit(`        slt     ${out}, ${b}, ${a}`);
        return done(out);
      case '<=':
        em.emit(`        slt     ${out}, ${b}, ${a}`);
        em.emit(`        xori    ${out}, ${out}, 1`);
        return done(out);
      case '>=':
        em.emit(`        slt     ${out}, ${a}, ${b}`);
        em.emit(`        xori    ${out}, ${out}, 1`);
        return done(out);
      case '==':
        em.emit(`        xor     ${out}, ${a}, ${b}`);
        em.emit(`        sltiu   ${out}, ${out}, 1`);
        return done(out);
      default:
        em.emit(`        xor     ${out}, ${a}, ${b}`);
        em.emit(`        sltu    ${out}, x0, ${out}`);
        return done(out);
    }
  }

  // 函式呼叫（含 caller spill）。wantValue=false 時不留值。
  function evalCall(pool, fname, args, mode, line, wantValue = true) {
    const f = ctx.funcMap.get(fname);
    if (!f) err(line, `未定義的函式：${fname}`);
    if (args.length > 4) err(line, '呼叫參數太多（上限 4 個）');
    const argRegs = args.map((a) => evalExpr(pool, a, mode));
    let dest = null;
    if (wantValue) dest = pool.alloc(line);
    const spill = [];
    for (const r of pool.ownedList()) spill.push(r);
    for (const r of ctx.liveAHomes()) if (!spill.includes(r)) spill.push(r);
    if (spill.length > 0) em.emit(`        addi    sp, sp, -${spill.length * 4}`);
    spill.forEach((r, i) => em.emit(`        sw      ${r}, ${i * 4}(sp)`));
    argRegs.forEach((r, i) => {
      em.emit(`        addi    a${i}, ${r}, 0`);
      pool.free(r);
    });
    em.emit(`        jal     ra, F_${fname}`);
    spill.forEach((r, i) => em.emit(`        lw      ${r}, ${i * 4}(sp)`));
    if (spill.length > 0) em.emit(`        addi    sp, sp, ${spill.length * 4}`);
    if (wantValue) em.emit(`        addi    ${dest}, a0, 0`);
    return dest;
  }

  // ---- 敘述 codegen ----
  function genStmts(stmts, mode) {
    for (const s of stmts) genStmt(s, mode);
  }
  function genStmt(s, mode) {
    const line = s.line;
    switch (s.k) {
      case 'decl': {
        const home = allocHome(s.n, line);
        const pool = makePool();
        const r = evalExpr(pool, s.x, mode);
        em.emit(`        addi    ${home}, ${r}, 0`);
        ctx.noteWrite(home);
        pool.free(r);
        return;
      }
      case 'assign': {
        const home = homeOf(s.n, line);
        const pool = makePool();
        const r = evalExpr(pool, s.x, mode);
        if (r !== home) em.emit(`        addi    ${home}, ${r}, 0`);
        ctx.noteWrite(home);
        pool.free(r);
        return;
      }
      case 'store': {
        const pool = makePool();
        const r = evalExpr(pool, s.x, mode);
        emitStore(pool, s.m, s.idx, r, mode);
        return;
      }
      case 'callstmt': {
        const pool = makePool();
        evalCall(pool, s.f, s.args, mode, line, false);
        return;
      }
      case 'print': {
        const pool = makePool();
        const r = evalExpr(pool, s.args[0], mode);
        const spill = [];
        for (const q of pool.ownedList()) spill.push(q);
        for (const q of ctx.liveAHomes()) if (!spill.includes(q)) spill.push(q);
        if (spill.length > 0) em.emit(`        addi    sp, sp, -${spill.length * 4}`);
        spill.forEach((q, i) => em.emit(`        sw      ${q}, ${i * 4}(sp)`));
        em.emit(`        addi    a0, ${r}, 0`);
        pool.free(r);
        em.emit(`        jal     ra, F___print_int`);
        spill.forEach((q, i) => em.emit(`        lw      ${q}, ${i * 4}(sp)`));
        if (spill.length > 0) em.emit(`        addi    sp, sp, ${spill.length * 4}`);
        ctx.needPrint = true;
        return;
      }
      case 'barrier':
        if (mode.t === 'expect') err(line, 'expect 段不可用 barrier（僅 lane0 執行，會永等）');
        em.emit(`        barrier`);
        return;
      case 'return': {
        const pool = makePool();
        const r = evalExpr(pool, s.x, mode);
        em.emit(`        addi    a0, ${r}, 0`);
        pool.free(r);
        em.emit(`        jal     x0, ${mode.retLabel}`);
        return;
      }
      case 'break': {
        if (ctx.loopStack.length === 0) err(line, 'break 只可出現在迴圈內');
        em.emit(`        jal     x0, ${ctx.loopStack[ctx.loopStack.length - 1].brk}`);
        return;
      }
      case 'continue': {
        if (ctx.loopStack.length === 0) err(line, 'continue 只可出現在迴圈內');
        em.emit(`        jal     x0, ${ctx.loopStack[ctx.loopStack.length - 1].cont}`);
        return;
      }
      case 'if': {
        const pool = makePool();
        const c = evalExpr(pool, s.c, mode);
        const elseL = freshLabel('ELSE');
        const endL = freshLabel('ENDIF');
        em.emit(`        beq     ${c}, x0, ${s.e ? elseL : endL}`);
        pool.free(c);
        pushScope();
        genStmts(s.t, mode);
        freeScope();
        if (s.e) {
          em.emit(`        jal     x0, ${endL}`);
          em.emit(`${elseL}:`);
          pushScope();
          genStmts(s.e, mode);
          freeScope();
          em.emit(`${endL}:`);
        } else {
          em.emit(`${endL}:`);
        }
        return;
      }
      case 'while': {
        const topL = freshLabel('WHILE');
        const endL = freshLabel('WEND');
        ctx.loopStack.push({ brk: endL, cont: topL });
        em.emit(`${topL}:`);
        {
          const pool = makePool();
          const c = evalExpr(pool, s.c, mode);
          em.emit(`        beq     ${c}, x0, ${endL}`);
          pool.free(c);
        }
        pushScope();
        genStmts(s.b, mode);
        freeScope();
        em.emit(`        jal     x0, ${topL}`);
        em.emit(`${endL}:`);
        ctx.loopStack.pop();
        return;
      }
      case 'for': {
        pushScope();
        const home = allocHome(s.vn, line);
        {
          const pool = makePool();
          const r = evalExpr(pool, s.init, mode);
          em.emit(`        addi    ${home}, ${r}, 0`);
          ctx.noteWrite(home);
          pool.free(r);
        }
        const topL = freshLabel('FOR');
        const stepL = freshLabel('FSTEP');
        const endL = freshLabel('FEND');
        ctx.loopStack.push({ brk: endL, cont: stepL });
        em.emit(`${topL}:`);
        {
          const pool = makePool();
          const c = evalExpr(pool, s.cond, mode);
          em.emit(`        beq     ${c}, x0, ${endL}`);
          pool.free(c);
        }
        genStmts(s.b, mode);
        em.emit(`${stepL}:`);
        {
          const pool = makePool();
          const st = evalExpr(pool, s.step, mode);
          em.emit(s.sop === '+=' ? `        add     ${home}, ${home}, ${st}` : `        sub     ${home}, ${home}, ${st}`);
          ctx.noteWrite(home);
          pool.free(st);
        }
        em.emit(`        jal     x0, ${topL}`);
        em.emit(`${endL}:`);
        ctx.loopStack.pop();
        freeScope();
        return;
      }
    }
  }

  // ---- 函式本體（含 frame） ----
  function genFunc(f) {
    const sub = Emitter();
    const saveLines = em.lines;
    em.lines = sub.lines;
    const writes = new Set();
    ctx.curWrites = writes;
    pushScope();
    f.fparams.forEach((pn, i) => {
      const home = allocHome(pn, f.line);
      em.emit(`        addi    ${home}, a${i}, 0`);
      ctx.noteWrite(home);
    });
    const retL = freshLabel(`RET_${f.name}_`);
    genStmts(f.body, { t: 'vec', retLabel: retL, idx: null });
    em.emit(`${retL}:`);
    freeScope();
    ctx.curWrites = null;
    em.lines = saveLines;
    const saveList = [...writes].sort();
    const frame = 4 * (1 + saveList.length);
    em.emit(`F_${f.name}:`);
    em.emit(`        addi    sp, sp, -${frame}`);
    em.emit(`        sw      ra, ${frame - 4}(sp)`);
    saveList.forEach((r, i) => em.emit(`        sw      ${r}, ${i * 4}(sp)`));
    for (const l of sub.lines) em.emit(l);
    saveList.forEach((r, i) => em.emit(`        lw      ${r}, ${i * 4}(sp)`));
    em.emit(`        lw      ra, ${frame - 4}(sp)`);
    em.emit(`        addi    sp, sp, ${frame}`);
    em.emit(`        jalr    x0, 0(ra)`);
  }

  // ---- __print_int：a0 = 整數，UART 逐字印十進位（leaf，只用 t5/t6/a6＋自存 s2/s3） ----
  function genPrintInt() {
    em.emit(`F___print_int:`);
    em.emit(`        addi    sp, sp, -12`);
    em.emit(`        sw      ra, 8(sp)`);
    em.emit(`        sw      s2, 4(sp)`);
    em.emit(`        sw      s3, 0(sp)`);
    em.emit(`        bge     a0, x0, PPI_POS`);
    em.emit(`        addi    sp, sp, -4`);
    em.emit(`        sw      a0, 0(sp)`);
    em.emit(`        li      a0, 45`);
    em.emit(`        li      a7, 1`);
    em.emit(`        ecall`);
    em.emit(`        lw      a0, 0(sp)`);
    em.emit(`        addi    sp, sp, 4`);
    em.emit(`PPI_POS:`);
    em.emit(`        li      s2, 10`);
    em.emit(`        bltu    a0, s2, PPI_DIG`);
    em.emit(`        li      s3, 0`);
    em.emit(`        li      t5, 31`);
    em.emit(`        li      a6, 0`);
    em.emit(`PPIDIV:`);
    em.emit(`        blt     t5, x0, PPIDIVEND`);
    em.emit(`        slli    a6, a6, 1`);
    em.emit(`        srl     t6, a0, t5`);
    em.emit(`        andi    t6, t6, 1`);
    em.emit(`        or      a6, a6, t6`);
    em.emit(`        slli    s3, s3, 1`);
    em.emit(`        bltu    a6, s2, PPIDIVSK`);
    em.emit(`        sub     a6, a6, s2`);
    em.emit(`        ori     s3, s3, 1`);
    em.emit(`PPIDIVSK:`);
    em.emit(`        addi    t5, t5, -1`);
    em.emit(`        jal     x0, PPIDIV`);
    em.emit(`PPIDIVEND:`);
    em.emit(`        addi    sp, sp, -4`);
    em.emit(`        sw      a6, 0(sp)`);
    em.emit(`        addi    a0, s3, 0`);
    em.emit(`        jal     ra, F___print_int`);
    em.emit(`        lw      a6, 0(sp)`);
    em.emit(`        addi    sp, sp, 4`);
    em.emit(`        addi    a0, a6, 0`);
    em.emit(`PPI_DIG:`);
    em.emit(`        addi    a0, a0, 48`);
    em.emit(`        li      a7, 1`);
    em.emit(`        ecall`);
    em.emit(`PPI_END:`);
    em.emit(`        lw      s3, 0(sp)`);
    em.emit(`        lw      s2, 4(sp)`);
    em.emit(`        lw      ra, 8(sp)`);
    em.emit(`        addi    sp, sp, 12`);
    em.emit(`        jalr    x0, 0(ra)`);
  }

  // ---- 主程式 ----
  em.emit(`# cu2rv 產生（高階 DSL→riscvgpu 組語）：lanes=${prog.lanes} n=${prog.n}`);
  em.emit(`# 用法：node cli/rvasm.js <Name>.s → <Name>.hex，載入 riscvgpu 即跑`);
  em.emit(`        tid     t0`);
  em.emit(`        ntid    t1`);
  em.emit(`        li      sp, 0x${STACK_TOP.toString(16)}`);
  em.emit(`        slli    t6, t0, ${STACK_SHIFT}`);
  em.emit(`        sub     sp, sp, t6`);
  for (const m of ck.mems) em.emit(`        li      ${baseOf(m.name)}, 0x${m.addr.toString(16)}`);
  pushScope(); // param scope（全域存活至結尾）
  for (const p of prog.params) {
    em.emit(`        li      ${ck.paramRegs[p.name]}, ${ck.env.params[p.name]}`);
  }

  // --- init：grid-stride 寫入（各通道不重疊） ---
  const initIdx = allocHome('@init_i', prog.kernel.line);
  for (const m of ck.mems) {
    if (!m.init) continue;
    em.emit(`        # --- init ${m.name}[0..${m.len}) ---`);
    const topL = freshLabel('INIT');
    const endL = freshLabel('INITEND');
    em.emit(`        addi    ${initIdx}, t0, 0`);
    em.emit(`${topL}:`);
    {
      const pool = makePool();
      const c = pool.alloc(m.line);
      em.emit(`        sltiu   ${c}, ${initIdx}, ${m.len}`);
      em.emit(`        beq     ${c}, x0, ${endL}`);
      pool.free(c);
    }
    {
      const pool = makePool();
      const r = evalExpr(pool, m.init, { t: 'init', idx: initIdx });
      emitStore(pool, m.name, { k: 'name', n: 'i', line: m.line }, r, { t: 'init', idx: initIdx });
    }
    em.emit(`        add     ${initIdx}, ${initIdx}, t1`);
    em.emit(`        jal     x0, ${topL}`);
    em.emit(`${endL}:`);
  }
  em.emit(`        barrier`);

  // --- kernel ---
  em.emit(`        # --- kernel ${prog.kernel.name} ---`);
  genStmts(prog.kernel.body, { t: 'vec', retLabel: null, idx: null });
  em.emit(`        barrier`);

  // --- expect：僅 lane0 ---
  if (prog.expect) {
    em.emit(`        # --- expect（僅 lane0，a0=錯誤數） ---`);
    em.emit(`        bne     t0, x0, QUIT`);
    em.emit(`        li      a0, 0`);
    for (const m of ck.mems) em.emit(`        li      ${baseOf(m.name)}, 0x${m.addr.toString(16)}`);
    let ei = 0;
    for (const s of prog.expect.body) {
      const idxIsI = s.idx.k === 'name' && s.idx.n === 'i';
      if (idxIsI) {
        const mem = ck.mems.find((x) => x.name === s.m);
        const idxH = allocHome(`@exp${ei}`, s.line);
        const topL = freshLabel(`EXP${ei}_`);
        const nxtL = freshLabel(`EXP${ei}N_`);
        const badL = freshLabel(`EXPBAD${ei}_`);
        em.emit(`        li      ${idxH}, 0`);
        em.emit(`${topL}:`);
        {
          const pool = makePool();
          const c = pool.alloc(s.line);
          em.emit(`        sltiu   ${c}, ${idxH}, ${mem.len}`);
          em.emit(`        beq     ${c}, x0, ${nxtL}`);
          pool.free(c);
        }
        {
          const pool = makePool();
          const r = evalExpr(pool, s.x, { t: 'expect', idx: idxH });
          const t = pool.alloc(s.line);
          const base = baseOf(s.m);
          em.emit(`        slli    ${t}, ${idxH}, 2`);
          em.emit(`        add     ${t}, ${base}, ${t}`);
          em.emit(`        lw      ${t}, 0(${t})`);
          em.emit(`        bne     ${t}, ${r}, ${badL}`);
          pool.free(t);
          pool.free(r);
        }
        em.emit(`        addi    ${idxH}, ${idxH}, 1`);
        em.emit(`        jal     x0, ${topL}`);
        em.emit(`${badL}:`);
        em.emit(`        addi    a0, a0, 1`);
        em.emit(`        addi    ${idxH}, ${idxH}, 1`);
        em.emit(`        jal     x0, ${topL}`);
        em.emit(`${nxtL}:`);
        freeScopeOne(`@exp${ei}`);
      } else {
        const badL = freshLabel(`EXPBAD${ei}_`);
        const nxtL = freshLabel(`EXP${ei}N_`);
        const c = constVal(s.idx, ck.env);
        const pool = makePool();
        const r = evalExpr(pool, s.x, { t: 'expect', idx: null });
        const t = pool.alloc(s.line);
        const base = baseOf(s.m);
        const off = c * 4;
        if (off >= -2048 && off <= 2047) {
          em.emit(`        lw      ${t}, ${off}(${base})`);
        } else {
          em.emit(`        li      ${t}, ${off}`);
          em.emit(`        add     ${t}, ${base}, ${t}`);
          em.emit(`        lw      ${t}, 0(${t})`);
        }
        em.emit(`        bne     ${t}, ${r}, ${badL}`);
        em.emit(`        jal     x0, ${nxtL}`);
        em.emit(`${badL}:`);
        em.emit(`        addi    a0, a0, 1`);
        em.emit(`${nxtL}:`);
        pool.free(t);
        pool.free(r);
      }
      ei++;
    }
  }
  em.emit(`QUIT:   li      a7, 10`);
  em.emit(`        ecall`);

  // ---- 函式區（主流程之後，jal 到達） ----
  for (const f of prog.funcs) genFunc(f);
  if (ctx.needPrint) genPrintInt();

  freeScope(); // param scope

  const count = em.insnCount();
  if (count > IMEM_LIMIT) {
    throw new Error(`產生指令 ${count} 條，超過 IMEM 上限 ${IMEM_LIMIT}（請縮小 n 或拆 kernel）`);
  }
  return { asm: em.lines.join('\n') + '\n' };

  function freeScopeOne(name) {
    const names = scopeStack[scopeStack.length - 1];
    const at = names.map((e) => e.name).lastIndexOf(name);
    if (at >= 0) {
      const [{ prev }] = names.splice(at, 1);
      freeHomes.unshift(active.get(name));
      if (prev === undefined) active.delete(name);
      else active.set(name, prev);
    }
  }
}


/***** exports *****/
globalThis.RVJS = {
  assemble: (typeof assemble !== 'undefined' ? assemble : undefined),
  disassemble: (typeof disassemble !== 'undefined' ? disassemble : undefined),
  Emulator: (typeof Emulator !== 'undefined' ? Emulator : undefined),
  compileKernel: (typeof compileKernel !== 'undefined' ? compileKernel : undefined),
};
