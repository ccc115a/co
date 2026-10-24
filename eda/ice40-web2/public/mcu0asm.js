// Assembler for the MCU0 / MCU0m 16-bit accumulator CPU. Pure functions, shared by the page and the server.
//
//   LOOP:  LD   I        ; or // comments, labels may share a line with an instruction
//          CMP  N
//          JEQ  EXIT
//   SUM:   WORD 0
//
// Instructions: LD ADD JMP ST CMP JEQ <operand>, operand = label or number (decimal, 0x.., 0b..), optionally label+n / label-n.
// Directives:   WORD v  (16-bit data)   ORG addr  (even byte address)   FORMAT WORDS|BYTES   SIZE n  (pad image to n words)
// Addresses are byte addresses; every instruction and WORD takes 2 bytes; the operand field is 12 bits (0..4095).

export const OPCODES = { LD: 0, ADD: 1, JMP: 2, ST: 3, CMP: 4, JEQ: 5 };
const DIRECTIVES = new Set(['WORD', 'ORG', 'FORMAT', 'SIZE']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUM = /^(?:0x[0-9a-f]+|0b[01]+|\d+)$/i;

const num = s => /^0b/i.test(s) ? parseInt(s.slice(2), 2) : /^0x/i.test(s) ? parseInt(s.slice(2), 16) : parseInt(s, 10);

export function assemble(text) {
  const errors = [], symbols = {}, items = [];       // items: { addr, kind: 'op'|'word', op, expr, line, src }
  let addr = 0, format = 'WORDS', size = 0, maxAddr = 0;
  const err = (line, message) => errors.push({ line, message });

  // ---- pass 1: labels, addresses, directives
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    let s = raw.replace(/\/\/.*$|;.*$/, '').trim(); if (!s) return;
    const lab = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(s);
    if (lab) {
      const name = lab[1];
      if (OPCODES[name.toUpperCase()] !== undefined || DIRECTIVES.has(name.toUpperCase())) err(line, `"${name}" is a reserved word and cannot be a label`);
      else if (name in symbols) err(line, `label "${name}" is already defined`);
      else symbols[name] = addr;
      s = lab[2].trim(); if (!s) return;
    }
    const m = /^(\S+)\s*(.*)$/.exec(s), word = m[1].toUpperCase(), arg = m[2].trim();
    if (word in OPCODES) {
      if (!arg) return err(line, `${word} needs an operand`);
      items.push({ addr, kind: 'op', op: OPCODES[word], mnemonic: word, expr: arg, line, src: raw });
      addr += 2; maxAddr = Math.max(maxAddr, addr);
    } else if (word === 'WORD') {
      if (!arg) return err(line, 'WORD needs a value');
      items.push({ addr, kind: 'word', expr: arg, line, src: raw }); addr += 2; maxAddr = Math.max(maxAddr, addr);
    } else if (word === 'ORG') {
      if (!NUM.test(arg)) return err(line, 'ORG needs a number');
      const v = num(arg); if (v % 2) return err(line, 'ORG address must be even'); if (v < addr) return err(line, `ORG ${arg} would move backwards (current address is ${addr})`);
      if (v > 4094) return err(line, 'ORG address does not fit the 12-bit operand field'); addr = v;
    } else if (word === 'FORMAT') {
      const f = arg.toUpperCase(); if (f !== 'WORDS' && f !== 'BYTES') return err(line, 'FORMAT must be WORDS or BYTES'); format = f;
    } else if (word === 'SIZE') {
      if (!NUM.test(arg) || num(arg) < 1 || num(arg) > 2048) return err(line, 'SIZE must be a number from 1 to 2048 (words)'); size = num(arg);
    } else err(line, `unknown instruction or directive "${m[1]}"`);
  });

  // ---- pass 2: operands
  const value = (expr, line) => {
    const m = /^([A-Za-z_][A-Za-z0-9_]*|0x[0-9a-f]+|0b[01]+|-?\d+)\s*(?:([+-])\s*(0x[0-9a-f]+|0b[01]+|\d+))?$/i.exec(expr);
    if (!m) { err(line, `cannot read operand "${expr}"`); return null; }
    let v;
    if (IDENT.test(m[1]) && !NUM.test(m[1])) { if (!(m[1] in symbols)) { err(line, `undefined label "${m[1]}"`); return null; } v = symbols[m[1]]; }
    else v = m[1].startsWith('-') ? -num(m[1].slice(1)) : num(m[1]);
    if (m[2]) v += (m[2] === '-' ? -1 : 1) * num(m[3]);
    return v;
  };
  const words = new Array(maxAddr / 2).fill(0), listing = [];
  for (const it of items) {
    const v = value(it.expr, it.line); if (v === null) continue;
    let w;
    if (it.kind === 'op') {
      if (v < 0 || v > 4095) { err(it.line, `operand ${v} does not fit 12 bits (0..4095)`); continue; }
      w = (it.op << 12) | v;
    } else {
      if (v < -32768 || v > 65535) { err(it.line, `value ${v} does not fit 16 bits`); continue; }
      w = v & 0xffff;
    }
    words[it.addr / 2] = w; listing.push({ addr: it.addr, word: w, line: it.line, src: it.src.trim() });
  }
  if (size && words.length > size) err(1, `program has ${words.length} words but SIZE is ${size}`);
  if (size && !errors.length) while (words.length < size) words.push(0);
  const ok = errors.length === 0;
  return { ok, errors, words, listing, symbols, format, size, bytes: words.length * 2 };
}

const h = (v, n) => v.toString(16).padStart(n, '0');

// $readmemh text. WORDS: one 16-bit word per line. BYTES: two bytes per line (the MCU0m article's layout).
// Source lines are kept as comments after // so the hex file stays readable.
export function toHex(res) {
  const byAddr = new Map(res.listing.map(l => [l.addr, l]));
  return res.words.map((w, i) => {
    const l = byAddr.get(i * 2), note = l ? ` // ${h(i * 2, 2)}  ${l.src}` : '';
    return (res.format === 'BYTES' ? `${h(w >> 8, 2)} ${h(w & 255, 2)} ` : h(w, 4)) + note;
  }).join('\n') + '\n';
}

// Human-readable listing for the log: address, encoding, source.
export function listingText(res) {
  return res.listing.map(l => `${h(l.addr, 3)}  ${h(l.word, 4)}  ${l.src}`);
}
