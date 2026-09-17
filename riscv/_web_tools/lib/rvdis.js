// lib/rvdis.js：RV32 反組譯器（純 ES module、零依賴）。
// disassemble(words, origin) → string 陣列，每列 `addr8hex: word8hex  mn ops`。

import { decodeWord, REG_NAMES } from './isa.js';

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

export function disassemble(words, origin = 0) {
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
