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


/***** exports *****/
globalThis.RVJS = {
  assemble: (typeof assemble !== 'undefined' ? assemble : undefined),
  disassemble: (typeof disassemble !== 'undefined' ? disassemble : undefined),
  Emulator: (typeof Emulator !== 'undefined' ? Emulator : undefined),
};
