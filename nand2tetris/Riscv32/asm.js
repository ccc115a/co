#!/usr/bin/env node
// asm.js：RV32S 組譯器（Node）。
// 用法：node asm.js prog1.asm [prog2.asm ...] → 各產生 progN.bin
//       .bin 每行一顆 32 位元指令（binary 字串，直接餵 ROM32 load）。
//
// RV32S 語法（word 定址，一 word=一位址）：
//   R 型： add/sub/and/or/xor rd, rs1, rs2
//   I 型： addi/andi/ori/xori rd, rs1, imm
//   載入： lw  rd, imm(rs1)         存回： sw  rs2, imm(rs1)
//   分支： beq/bne/blt/bge rs1, rs2, label   （imm = label_addr - pc_addr）
//   跳躍： jal rd, label   ； jalr rd, rs1, imm
//   LUI： lui rd, imm20    ； AUIPC： auipc rd, imm20
//   暫存器 x0..x31（r0..r31 亦可）；立即數支援十進位／0x…／label。
//   偽指令： nop（=addi x0,x0,0）、li rd, imm（最多兩顆）。
//   註解： #
'use strict';
const fs = require('fs');
const path = require('path');

function reg(name) {
  const n = name.toLowerCase();
  if (/^[xr]\d+$/.test(n)) {
    const i = parseInt(n.slice(1), 10);
    if (i >= 0 && i <= 31) return i;
  }
  throw new Error('bad register: ' + name);
}

// 解析立即數／label。位移 = 目標位址 - 本指令位址（word）。
function immVal(s, labels, pcAddr) {
  const t = s.trim();
  if (/^-?0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  if (Object.prototype.hasOwnProperty.call(labels, t)) return labels[t] - pcAddr;
  throw new Error('bad immediate/label: ' + s);
}

// imm(rs1) → [imm, reg]
function parseOff(s) {
  const m = s.match(/^(.*)\((.*)\)$/);
  if (!m) throw new Error('bad offset form: ' + s);
  return [m[1].trim(), reg(m[2])];
}

function check12(x, what) {
  if (x < -2048 || x > 2047) throw new Error(what + ' overflow: ' + x);
  return x & 0xFFF;
}

function encode(mnem, args, labels, pcAddr) {
  const m = mnem.toLowerCase();
  const R = { add: [0x33, 0x0, 0x00], sub: [0x33, 0x0, 0x20],
              and: [0x33, 0x7, 0x00], or: [0x33, 0x6, 0x00], xor: [0x33, 0x4, 0x00] };
  const I = { addi: [0x13, 0x0], andi: [0x13, 0x7], ori: [0x13, 0x6], xori: [0x13, 0x4] };

  if (Object.prototype.hasOwnProperty.call(R, m)) {
    const rd = reg(args[0]), rs1 = reg(args[1]), rs2 = reg(args[2]);
    const [op, f3, f7] = R[m];
    return (f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op;
  }
  if (Object.prototype.hasOwnProperty.call(I, m)) {
    const rd = reg(args[0]), rs1 = reg(args[1]);
    const imm = check12(immVal(args[2], labels, pcAddr), 'imm12');
    const [op, f3] = I[m];
    return (imm << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op;
  }
  if (m === 'lw') {
    const rd = reg(args[0]);
    const [immS, rs1] = parseOff(args[1]);
    const imm = check12(immVal(immS, labels, pcAddr), 'imm12');
    return (imm << 20) | (rs1 << 15) | (0x2 << 12) | (rd << 7) | 0x03;
  }
  if (m === 'sw') {
    const rs2 = reg(args[0]);
    const [immS, rs1] = parseOff(args[1]);
    const imm = check12(immVal(immS, labels, pcAddr), 'imm12');
    const hi = (imm >> 5) & 0x7F, lo = imm & 0x1F;
    return (hi << 25) | (rs2 << 20) | (rs1 << 15) | (0x2 << 12) | (lo << 7) | 0x23;
  }
  if (['beq', 'bne', 'blt', 'bge'].includes(m)) {
    const rs1 = reg(args[0]), rs2 = reg(args[1]);
    const off = check12(immVal(args[2], labels, pcAddr), 'branch imm');
    const f3 = { beq: 0x0, bne: 0x1, blt: 0x4, bge: 0x5 }[m];
    const hi = (off >> 5) & 0x7F, lo = off & 0x1F;
    return (hi << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (lo << 7) | 0x63;
  }
  if (m === 'jal') {
    const rd = reg(args[0]);
    const off = immVal(args[1], labels, pcAddr);
    if (off < -(1 << 19) || off >= (1 << 19)) throw new Error('jal imm overflow: ' + off);
    return ((off & 0xFFFFF) << 12) | (rd << 7) | 0x6F;
  }
  if (m === 'jalr') {
    const rd = reg(args[0]), rs1 = reg(args[1]);
    const imm = args.length === 3 ? check12(immVal(args[2], labels, pcAddr), 'imm12') : 0;
    return (imm << 20) | (rs1 << 15) | (rd << 7) | 0x67;
  }
  if (m === 'lui' || m === 'auipc') {
    const rd = reg(args[0]);
    const v = immVal(args[1], labels, pcAddr);
    if (v < 0 || v >= (1 << 20)) throw new Error(m + ' imm20 out of range: ' + v);
    return (v << 12) | (rd << 7) | (m === 'lui' ? 0x37 : 0x17);
  }
  throw new Error('unknown instruction: ' + m);
}

// li 偽指令展開（最多兩顆：lui + addi）
function expandLi(rd, imm) {
  const lo = imm & 0xFFF;
  const loS = (lo & 0x800) ? lo - 0x1000 : lo;
  const hi = (imm - loS) >> 12;
  if (imm >= -2048 && imm <= 2047) return [['addi', [rd, 'x0', String(imm)]]];
  if (lo === 0) return [['lui', [rd, String(hi & 0xFFFFF)]]];
  return [['lui', [rd, String(hi & 0xFFFFF)]], ['addi', [rd, rd, String(loS)]]];
}

function assemble(src) {
  const instrs = [];
  const labels = {};
  for (const raw of src.split('\n')) {
    let line = raw.split('#')[0].trim();
    if (!line) continue;
    const mm = line.match(/^([A-Za-z][\w]*)\s*:\s*(.*)$/);
    if (mm && mm[2].trim()) {
      labels[mm[1]] = instrs.length;
      line = mm[2].trim();
    } else if (line.endsWith(':')) {
      labels[line.slice(0, -1).trim()] = instrs.length;
      continue;
    }
    if (!line) continue;
    const toks = line.split(/[,\s]+/).filter(Boolean);
    const mnem = toks[0].toLowerCase();
    const args = toks.slice(1);
    if (mnem === 'nop') {
      instrs.push(['addi', ['x0', 'x0', '0']]);
    } else if (mnem === 'li') {
      const rd = reg(args[0]);
      const v = immVal(args[1], {}, 0);
      instrs.push(...expandLi('x' + rd, v));
    } else if (mnem === 'halt') {
      instrs.push(['halt', []]);
    } else {
      instrs.push([mnem, args]);
    }
  }
  const words = [];
  for (let pc = 0; pc < instrs.length; pc++) {
    const [mnem, args] = instrs[pc];
    if (mnem === 'halt') { words.push(0x7F); continue; }
    words.push((encode(mnem, args, labels, pc) >>> 0) & 0xFFFFFFFF);
  }
  return words;
}

function main() {
  if (process.argv.length < 3) {
    console.error('usage: node asm.js prog.asm ...');
    process.exit(1);
  }
  for (const f of process.argv.slice(2)) {
    const src = fs.readFileSync(f, 'utf8');
    const words = assemble(src);
    const out = f.endsWith('.asm') ? f.slice(0, -4) + '.bin' : f + '.bin';
    const body = words.map(w => (w >>> 0).toString(2).padStart(32, '0')).join('\n');
    fs.writeFileSync(out, body + '\n');
    console.log(f + ': ' + words.length + ' 指令 → ' + path.basename(out));
  }
}

main();