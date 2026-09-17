// lib/rvasm.js：RV32 組譯器（純 ES module、零依賴）。
// assemble(src, {origin}) → {words, labels, listing, errors}；兩 pass；錯誤一律 throw（含行號）。

import { regNum, encodeR, encodeI, encodeS, encodeB, encodeU, encodeJ, INSTR_MAP, PSEUDO } from './isa.js';

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

export function assemble(src, { origin = 0 } = {}) {
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
