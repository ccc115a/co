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
// lib/cu2rv.js：自訂 kernel DSL → riscvgpu 組語（純 ES module、零依賴）。
// compileKernel(src) → { asm }；錯誤一律 throw（含行號，第N行）。
//
// DSL（.ku 檔，見 kernels/*.ku）：
//   lanes 4            通道數（1..8；riscvgpu 預設 4）
//   n 8                總元素數（須被 lanes 整除）
//   mem A @ 0x100      陣列宣告（位址字對齊，4KB 內、不重疊；長度預設 n）
//   mem B @ 0x120 x 8  （可顯式指定長度，須 >= n）
//   param a = 2        純量常數（init/kernel 運算式可用）
//   init:              每通道分區寫入（只可用 i／常數／param，不可讀 mem）
//     A[i] = i + 1
//   kernel:            每通道分區計算（可用 mem 讀寫、暫存變數、barrier）
//     t = a * A[i]
//     C[i] = t + B[i]
//     barrier          （顯式分段；init 後與 kernel 後自動各有一個 barrier）
//
// 運算式：整數 + - *、括號、前置負號；運算元為十進位／0x 常數、i、tid、
// param、暫存變數、A[i]（kernel 限定）。* 的一邊須為常數（硬體無 M 擴充，
// 常數乘以 shift-add 展開；變數*變數、浮點數一律報錯）。
// 語意：i 為 0-based 全域索引；各通道處理連續 n/lanes 個元素。
// 輸出只含 RV32I＋li 偽指令＋tid/ntid/barrier，不用 mul（riscvgpu ALU 無 M 擴充）。
// 驗證段由 lane0 逐項重算 kernel 比對（殘差檢查），a0=錯誤數，a7=10 ecall 結束。

const BASE_REGS = ['t2', 't3', 't4', 's0', 's1']; // 每個 mem 一個基址暫存器（上限 5 個 mem）
const HOME_REGS = ['s2', 's3', 's4', 's5', 's6', 'a1', 'a2', 'a3', 'a4', 'a5']; // param＋暫存變數家（上限 10 個）
const SCRATCH = ['t6', 's7', 's8', 's9', 's10', 's11']; // 運算式求值暫存池
const DMEM_SIZE = 4096;
const IMEM_LIMIT = 200; // 生成指令數上限（riscvgpu IMEM 256 字，留裕度）

function err(lineno, msg) {
  throw new Error(`第${lineno}行：${msg}`);
}

// ---------- 運算式解析（遞迴下降） ----------
// 節點：{k:'num',v} {k:'i'} {k:'tid'} {k:'name',n}（param/暫存）
//       {k:'load',m}（M[i]） {k:'neg',x} {k:'bin',op,x,y}
function parseExpr(s, lineno) {
  let pos = 0;
  const peek = () => s[pos];
  const skip = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
  function parseAdd() {
    let x = parseMul();
    for (;;) {
      skip();
      if (peek() === '+' || peek() === '-') {
        const op = s[pos++];
        const y = parseMul();
        x = { k: 'bin', op, x, y };
      } else return x;
    }
  }
  function parseMul() {
    let x = parseUnary();
    for (;;) {
      skip();
      if (peek() === '*') {
        pos++;
        const y = parseUnary();
        x = { k: 'bin', op: '*', x, y };
      } else return x;
    }
  }
  function parseUnary() {
    skip();
    if (peek() === '-') { pos++; return { k: 'neg', x: parseUnary() }; }
    if (peek() === '+') { pos++; return parseUnary(); }
    return parseAtom();
  }
  function parseAtom() {
    skip();
    if (peek() === '(') {
      pos++;
      const x = parseAdd();
      skip();
      if (peek() !== ')') err(lineno, `運算式括號不配對：${s}`);
      pos++;
      return x;
    }
    let m = /^0[xX][0-9a-fA-F]+/.exec(s.slice(pos));
    if (m) { pos += m[0].length; return { k: 'num', v: Number(m[0]) }; }
    m = /^\d+/.exec(s.slice(pos));
    if (m) {
      if (s.slice(pos + m[0].length, pos + m[0].length + 1) === '.') err(lineno, `不支援浮點數（riscvgpu 無 F 擴充）：${s}`);
      pos += m[0].length;
      return { k: 'num', v: Number(m[0]) };
    }
    m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(pos));
    if (!m) err(lineno, `運算式無法解析：${s}`);
    const name = m[0];
    pos += name.length;
    const save = pos;
    skip();
    if (peek() === '[') {
      pos++;
      skip();
      let idx = '';
      while (pos < s.length && peek() !== ']') idx += s[pos++];
      if (peek() !== ']') err(lineno, `缺少 ]：${s}`);
      pos++;
      if (idx.trim() !== 'i') err(lineno, `陣列索引只支援 [i]：${s}`);
      return { k: 'load', m: name };
    }
    pos = save;
    if (name === 'i') return { k: 'i' };
    if (name === 'tid') return { k: 'tid' };
    return { k: 'name', n: name };
  }
  const x = parseAdd();
  skip();
  if (pos !== s.length) err(lineno, `運算式尾端多出字元：${s}`);
  return x;
}

// 常數折疊：回傳數值；非純常數回傳 null。
function constVal(node, params) {
  switch (node.k) {
    case 'num': return node.v;
    case 'name': return (node.n in params) ? params[node.n] : null;
    case 'neg': { const v = constVal(node.x, params); return v === null ? null : -v; }
    case 'bin': {
      const a = constVal(node.x, params), b = constVal(node.y, params);
      if (a === null || b === null) return null;
      if (node.op === '+') return a + b;
      if (node.op === '-') return a - b;
      return a * b;
    }
    default: return null;
  }
}

function parseKuNum(tok, lineno) {
  const s = String(tok).trim();
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(s) || /^[+-]?\d+$/.test(s)) {
    const v = Number(s);
    if (!Number.isInteger(v)) err(lineno, `數字格式錯誤：${tok}`);
    return v;
  }
  err(lineno, `數字格式錯誤：${tok}`);
}

// ---------- 頂層解析 ----------
function parseKernel(src) {
  const lines = String(src).split('\n');
  const prog = { lanes: 0, n: 0, mems: [], params: {}, init: [], kernel: [] };
  const memNames = new Set();
  let section = 'head'; // head | init | kernel
  const seen = { lanes: 0, n: 0 };

  lines.forEach((raw, li) => {
    const lineno = li + 1;
    const line = raw.split('#')[0].trim();
    if (line === '') return;
    if (line === 'init:') { section = 'init'; return; }
    if (line === 'kernel:') { section = 'kernel'; return; }
    if (section === 'head') {
      let m = /^lanes\s+(\S+)$/.exec(line);
      if (m) {
        if (seen.lanes) err(lineno, 'lanes 重複定義');
        seen.lanes = 1;
        prog.lanes = parseKuNum(m[1], lineno);
        if (prog.lanes < 1 || prog.lanes > 8) err(lineno, `lanes 須為 1..8：${m[1]}`);
        return;
      }
      m = /^n\s+(\S+)$/.exec(line);
      if (m) {
        if (seen.n) err(lineno, 'n 重複定義');
        seen.n = 1;
        prog.n = parseKuNum(m[1], lineno);
        if (prog.n < 1) err(lineno, `n 須為正整數：${m[1]}`);
        return;
      }
      m = /^mem\s+([A-Za-z_][A-Za-z0-9_]*)\s+@\s*(\S+)(?:\s+x\s+(\S+))?$/.exec(line);
      if (m) {
        if (memNames.has(m[1])) err(lineno, `mem 重複定義：${m[1]}`);
        memNames.add(m[1]);
        const addr = parseKuNum(m[2], lineno);
        const len = m[3] === undefined ? 0 : parseKuNum(m[3], lineno); // 0 表預設 n（待 n 確定後回填）
        if (addr % 4 !== 0) err(lineno, `mem 位址須字對齊：${m[1]}`);
        if (len !== 0 && len < 1) err(lineno, `mem 長度須為正整數：${m[1]}`);
        prog.mems.push({ name: m[1], addr, len, lineno });
        return;
      }
      m = /^param\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (m) {
        if (m[1] in prog.params) err(lineno, `param 重複定義：${m[1]}`);
        if (memNames.has(m[1]) || m[1] === 'i' || m[1] === 'tid') err(lineno, `param 名稱衝突：${m[1]}`);
        const v = parseKuNum(m[2].trim(), lineno);
        if (v < -0x80000000 || v > 0xffffffff) err(lineno, `param 超出 32 位範圍：${m[1]}`);
        prog.params[m[1]] = v | 0;
        return;
      }
      err(lineno, `頂層只接受 lanes／n／mem／param／init:／kernel:：${line}`);
    } else {
      if (line === 'barrier') {
        if (section === 'init') err(lineno, 'init 段不接受 barrier（init 後自動同步）');
        prog.kernel.push({ k: 'barrier', lineno });
        return;
      }
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*i\s*\]\s*=\s*(.+)$/.exec(line);
      if (m) {
        if (!memNames.has(m[1])) err(lineno, `未宣告的 mem：${m[1]}`);
        const expr = parseExpr(m[2].trim(), lineno);
        (section === 'init' ? prog.init : prog.kernel).push({ k: 'store', m: m[1], expr, lineno });
        return;
      }
      const t = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (m === null && t) {
        if (section === 'init') err(lineno, 'init 段只接受 M[i] = 運算式');
        const expr = parseExpr(t[2].trim(), lineno);
        prog.kernel.push({ k: 'tmp', name: t[1], expr, lineno });
        return;
      }
      err(lineno, `無法解析：${line}`);
    }
  });

  if (!seen.lanes) throw new Error('缺少 lanes 定義');
  if (!seen.n) throw new Error('缺少 n 定義');
  if (prog.mems.length === 0) throw new Error('至少宣告一個 mem');
  if (prog.mems.length > BASE_REGS.length) throw new Error(`mem 太多（上限 ${BASE_REGS.length} 個）`);
  if (prog.n % prog.lanes !== 0) throw new Error(`n（${prog.n}）須被 lanes（${prog.lanes}）整除`);
  if (prog.kernel.length === 0) throw new Error('kernel 段為空');
  for (const m of prog.mems) {
    if (m.len === 0) m.len = prog.n;
    if (m.len < prog.n) throw new Error(`第${m.lineno}行：mem ${m.name} 長度（${m.len}）小於 n（${prog.n}）`);
    if (m.addr < 0 || m.addr + m.len * 4 > DMEM_SIZE) throw new Error(`第${m.lineno}行：mem ${m.name} 超出 4KB 資料記憶體`);
  }
  // mem 區間重疊檢查
  const ranges = prog.mems.map(m => [m.addr, m.addr + m.len * 4, m.name]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] < ranges[i - 1][1]) throw new Error(`mem ${ranges[i][2]} 與 mem ${ranges[i - 1][2]} 位址重疊`);
  }
  return prog;
}

// ---------- 語意驗證 ----------
function checkExpr(node, prog, temps, lineno, { allowLoad, phase }) {
  switch (node.k) {
    case 'num': {
      if (!Number.isInteger(node.v) || node.v < -0x80000000 || node.v > 0xffffffff) err(lineno, `常數超出 32 位範圍：${node.v}`);
      return;
    }
    case 'i': case 'tid': return;
    case 'name': {
      if (node.n in prog.params) return;
      if (temps.has(node.n)) return;
      err(lineno, `未定義的變數：${node.n}`);
      return;
    }
    case 'load': {
      if (!allowLoad) err(lineno, `${phase} 段不可讀 mem（只可用 i／常數／param）`);
      if (!prog.mems.some(m => m.name === node.m)) err(lineno, `未宣告的 mem：${node.m}`);
      return;
    }
    case 'neg': checkExpr(node.x, prog, temps, lineno, { allowLoad, phase }); return;
    case 'bin': {
      checkExpr(node.x, prog, temps, lineno, { allowLoad, phase });
      checkExpr(node.y, prog, temps, lineno, { allowLoad, phase });
      if (node.op === '*') {
        const a = constVal(node.x, prog.params), b = constVal(node.y, prog.params);
        if (a === null && b === null) {
          // 兩邊都含變數：除非其中一邊是純量暫存變數可展開？一律拒絕（無 M 擴充）
          err(lineno, '變數相乘需 M 擴充，硬體不支援（* 的一邊須為常數或 param）');
        }
      }
      return;
    }
  }
}

function validate(prog) {
  const homes = new Map(); // param＋暫存變數 → 暫存器
  let hi = 0;
  for (const p of Object.keys(prog.params)) homes.set(p, HOME_REGS[hi++]);
  const temps = new Set();
  for (const s of prog.init) {
    checkExpr(s.expr, prog, temps, s.lineno, { allowLoad: false, phase: 'init' });
  }
  for (const s of prog.kernel) {
    if (s.k === 'barrier') continue;
    if (s.k === 'tmp') {
      if (prog.mems.some(m => m.name === s.name) || s.name in prog.params || s.name === 'i' || s.name === 'tid') {
        err(s.lineno, `暫存變數名稱衝突：${s.name}`);
      }
      checkExpr(s.expr, prog, temps, s.lineno, { allowLoad: true, phase: 'kernel' });
      if (!temps.has(s.name)) {
        if (hi >= HOME_REGS.length) err(s.lineno, `變數太多（param＋暫存上限 ${HOME_REGS.length} 個）`);
        homes.set(s.name, HOME_REGS[hi++]);
        temps.add(s.name);
      }
    } else {
      checkExpr(s.expr, prog, temps, s.lineno, { allowLoad: true, phase: 'kernel' });
    }
  }
  return homes;
}

// ---------- 程式碼產生 ----------
function Emitter() {
  return {
    lines: [],
    emit(s) { this.lines.push(s); },
    insnCount() {
      // 標籤／註解／空行不計
      return this.lines.filter(l => {
        const t = l.trim();
        return t !== '' && !t.startsWith('#') && !t.endsWith(':');
      }).length;
    },
  };
}

// 常數乘法（shift-add 展開，不用 mul）：out = src * c。scratch 為可用暫存名陣列。
function mulConst(em, out, src, c, scratch, lineno) {
  if (c === 0) { em.emit(`        li      ${out}, 0`); return; }
  if (c === 1) { em.emit(`        addi    ${out}, ${src}, 0`); return; }
  if (c < 0) {
    mulConst(em, out, src, -c, scratch, lineno);
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
  if (T === undefined || U === undefined) err(lineno, '常數乘法暫存不足');
  const k0 = bits[0];
  em.emit(k0 === 0 ? `        addi    ${T}, ${src}, 0` : `        slli    ${T}, ${src}, ${k0}`);
  for (const k of bits.slice(1)) {
    em.emit(k === 0 ? `        addi    ${U}, ${src}, 0` : `        slli    ${U}, ${src}, ${k}`);
    em.emit(`        add     ${T}, ${T}, ${U}`);
  }
  em.emit(`        addi    ${out}, ${T}, 0`);
}

// 運算式求值 → 暫存器名。pool 為 scratch 分配器 {alloc(), free(r)}。
// mode：{t:'part', j}（分區展開，M[i] 位移 j*4）或 {t:'scalar'}（M[i] 取 0(ptr)）。
function evalExpr(em, prog, baseOf, homes, pool, node, mode, lineno) {
  switch (node.k) {
    case 'num': {
      const r = pool.alloc();
      em.emit(`        li      ${r}, ${node.v}`);
      return r;
    }
    case 'i': {
      const r = pool.alloc();
      em.emit(`        addi    ${r}, t5, 0`);
      return r;
    }
    case 'tid': {
      const r = pool.alloc();
      em.emit(`        addi    ${r}, t0, 0`);
      return r;
    }
    case 'name': return homes.get(node.n);
    case 'load': {
      const r = pool.alloc();
      if (mode.t === 'part') em.emit(`        lw      ${r}, ${mode.j * 4}(${baseOf(node.m)})`);
      else em.emit(`        lw      ${r}, 0(${baseOf(node.m)})`);
      return r;
    }
    case 'neg': {
      const a = evalExpr(em, prog, baseOf, homes, pool, node.x, mode, lineno);
      if (pool.owned(a)) {
        em.emit(`        sub     ${a}, x0, ${a}`);
        return a;
      }
      const r = pool.alloc();
      em.emit(`        sub     ${r}, x0, ${a}`);
      return r;
    }
    case 'bin': {
      if (node.op === '*') {
        const c = constVal(node.x, prog.params) !== null ? constVal(node.x, prog.params) : null;
        const d = constVal(node.y, prog.params) !== null ? constVal(node.y, prog.params) : null;
        if (c !== null && d !== null) {
          const r = pool.alloc();
          em.emit(`        li      ${r}, ${c * d}`);
          return r;
        }
        // 一邊常數：變數邊求值後 shift-add
        const varSide = c !== null ? node.y : node.x;
        const k = c !== null ? c : d;
        const a = evalExpr(em, prog, baseOf, homes, pool, varSide, mode, lineno);
        if (pool.owned(a)) {
          const extra = pool.peek(2);
          mulConst(em, a, a, k, extra, lineno);
          return a;
        }
        const r = pool.alloc();
        const extra = pool.peek(2, [r]);
        mulConst(em, r, a, k, extra, lineno);
        return r;
      }
      const a = evalExpr(em, prog, baseOf, homes, pool, node.x, mode, lineno);
      const b = evalExpr(em, prog, baseOf, homes, pool, node.y, mode, lineno);
      const op = node.op === '+' ? 'add' : 'sub';
      if (pool.owned(a)) {
        em.emit(`        ${op}     ${a}, ${a}, ${b}`);
        pool.free(b);
        return a;
      }
      if (pool.owned(b) && node.op === '+') {
        em.emit(`        ${op}     ${b}, ${a}, ${b}`);
        return b;
      }
      const r = pool.alloc();
      em.emit(`        ${op}     ${r}, ${a}, ${b}`);
      pool.free(b);
      return r;
    }
  }
}

function makePool() {
  const free = [...SCRATCH];
  const ownedSet = new Set();
  return {
    alloc() {
      if (free.length === 0) throw new Error('運算式太複雜（暫存不足）');
      const r = free.pop();
      ownedSet.add(r);
      return r;
    },
    free(r) {
      if (ownedSet.has(r)) { ownedSet.delete(r); free.push(r); }
    },
    owned(r) { return ownedSet.has(r); },
    // 偷看 n 個未分配暫存（供 mulConst 內部使用，不佔用）
    peek(n, exclude = []) {
      const out = free.filter(r => !exclude.includes(r)).slice(-n);
      return out;
    },
  };
}

function compileKernel(src) {
  const prog = parseKernel(src);
  const homes = validate(prog);
  const em = Emitter();
  const E = prog.n / prog.lanes; // 每通道元素數
  const baseOf = (m) => BASE_REGS[prog.mems.findIndex(x => x.name === m)];

  em.emit(`# cu2rv 產生（自訂 DSL→riscvgpu 組語）：lanes=${prog.lanes} n=${prog.n}`);
  em.emit(`# 用法：node cli/rvasm.js <Name>.s → <Name>.hex，載入 riscvgpu 即跑`);
  em.emit(`        tid     t0`);
  em.emit(`        ntid    t1`);
  for (const m of prog.mems) em.emit(`        li      ${baseOf(m.name)}, 0x${m.addr.toString(16)}`);
  for (const [p, v] of Object.entries(prog.params)) em.emit(`        li      ${homes.get(p)}, ${v}`);
  // 各通道指標分區：base += tid*(E*4)，各通道寫連續 E 個字（同 prog.s 的 slli+add 撥開）
  em.emit(`        # --- 分區：我的指標 = 基址 + tid*${E * 4} ---`);
  mulConst(em, 't6', 't0', E * 4, ['s11', 's10'], 0);
  for (const m of prog.mems) em.emit(`        add     ${baseOf(m.name)}, ${baseOf(m.name)}, t6`);

  // --- init：分區展開 ---
  if (prog.init.length > 0) em.emit(`        # --- init（各通道寫自己的 ${E} 個元素） ---`);
  for (const s of prog.init) {
    for (let j = 0; j < E; j++) {
      const pool = makePool();
      if (j === 0) {
        const extra = pool.peek(2);
        mulConst(em, 't5', 't0', E, extra, s.lineno);
      } else {
        const extra = pool.peek(2);
        mulConst(em, 't5', 't0', E, extra, s.lineno);
        em.emit(`        addi    t5, t5, ${j}`);
      }
      const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'part', j }, s.lineno);
      em.emit(`        sw      ${r}, ${j * 4}(${baseOf(s.m)})`);
      pool.free(r);
    }
  }
  em.emit(`        barrier`);

  // --- kernel：分區展開（j 在外、敘述在內：暫存變數生命期不出當次 j） ---
  em.emit(`        # --- kernel（各通道算自己的 ${E} 個元素） ---`);
  for (let j = 0; j < E; j++) {
    for (const s of prog.kernel) {
      if (s.k === 'barrier') { if (j === 0) em.emit(`        barrier`); continue; }
      const pool = makePool();
      const extra = pool.peek(2);
      mulConst(em, 't5', 't0', E, extra, s.lineno);
      if (j !== 0) em.emit(`        addi    t5, t5, ${j}`);
      if (s.k === 'tmp') {
        const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'part', j }, s.lineno);
        em.emit(`        addi    ${homes.get(s.name)}, ${r}, 0`);
        pool.free(r);
      } else {
        const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'part', j }, s.lineno);
        em.emit(`        sw      ${r}, ${j * 4}(${baseOf(s.m)})`);
        pool.free(r);
      }
    }
  }
  em.emit(`        barrier`);

  // --- verify：只有 lane0，全 n 逐項重算比對 ---
  em.emit(`        # --- verify（僅 lane0；重算 kernel 比對，a0=錯誤數） ---`);
  em.emit(`        bne     t0, x0, QUIT`);
  em.emit(`        li      a0, 0`);
  // 基址重載（分區階段走訪後基址暫存器仍為原值，此處直接重設為保險）
  for (const m of prog.mems) em.emit(`        li      ${baseOf(m.name)}, 0x${m.addr.toString(16)}`);
  em.emit(`        li      t5, 0`);
  em.emit(`        li      t6, ${prog.n}`);
  em.emit(`VCHK:`);
  for (const s of prog.kernel) {
    if (s.k === 'barrier') continue; // verify 只有 lane0，barrier 會永等：跳過
    const pool = makePool();
    if (s.k === 'tmp') {
      const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'scalar' }, s.lineno);
      em.emit(`        addi    ${homes.get(s.name)}, ${r}, 0`);
      pool.free(r);
    } else {
      const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'scalar' }, s.lineno);
      const t = pool.alloc();
      em.emit(`        lw      ${t}, 0(${baseOf(s.m)})`);
      em.emit(`        bne     ${t}, ${r}, BAD`);
      pool.free(t);
      pool.free(r);
    }
  }
  for (const m of prog.mems) {
    // 只有 kernel 用到的 mem 才需走訪；統一推進最簡單且正確
    em.emit(`        addi    ${baseOf(m.name)}, ${baseOf(m.name)}, 4`);
  }
  em.emit(`        addi    t5, t5, 1`);
  em.emit(`        addi    t6, t6, -1`);
  em.emit(`        bne     t6, x0, VCHK`);
  em.emit(`        jal     x0, QUIT`);
  em.emit(`BAD:    addi    a0, a0, 1`);
  em.emit(`        jal     x0, VCHK_NEXT`);
  em.emit(`VCHK_NEXT:`);
  // BAD 之後仍要推進，否則無窮迴圈：重複推進段
  for (const m of prog.mems) {
    em.emit(`        addi    ${baseOf(m.name)}, ${baseOf(m.name)}, 4`);
  }
  em.emit(`        addi    t5, t5, 1`);
  em.emit(`        addi    t6, t6, -1`);
  em.emit(`        bne     t6, x0, VCHK`);
  em.emit(`QUIT:   li      a7, 10`);
  em.emit(`        ecall`);

  const count = em.insnCount();
  if (count > IMEM_LIMIT) {
    throw new Error(`產生指令 ${count} 條，超過 IMEM 上限 ${IMEM_LIMIT}（請縮小 n）`);
  }
  return { asm: em.lines.join('\n') + '\n' };
}


/***** exports *****/
globalThis.RVJS = {
  assemble: (typeof assemble !== 'undefined' ? assemble : undefined),
  disassemble: (typeof disassemble !== 'undefined' ? disassemble : undefined),
  Emulator: (typeof Emulator !== 'undefined' ? Emulator : undefined),
  compileKernel: (typeof compileKernel !== 'undefined' ? compileKernel : undefined),
};
