import { assemble, toHex, listingText } from './public/mcu0asm.js';
import fs from 'node:fs';
let fail = 0; const ck = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, x); if (!c) fail++; };
const ARTICLE = `
LOOP:   LD    I      // the MCU0m article's program
        CMP   N
        JEQ   EXIT
        ADD   K1
        ST    I
        LD    SUM
        ADD   I
        ST    SUM
        JMP   LOOP
EXIT:   JMP   EXIT
SUM:    WORD  0
I:      WORD  0
K1:     WORD  1
N:      WORD  10
`;
const r = assemble(ARTICLE);
ck('article program assembles', r.ok, JSON.stringify(r.errors));
ck('encoding matches the article word for word', r.words.map(w => w.toString(16).padStart(4, '0')).join(' ') === '0016 401a 5012 1018 3016 0014 1016 3014 2000 2012 0000 0000 0001 000a');
ck('labels get byte addresses', r.symbols.SUM === 0x14 && r.symbols.EXIT === 0x12 && r.symbols.N === 0x1a);
const art = fs.readFileSync(new URL('./public/examples/mcu0m-sim/mcu0m.hex', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').split(/\s+/).filter(Boolean).slice(0, 28).join('');
const bytes = assemble('FORMAT BYTES\n' + ARTICLE);
ck('BYTES format reproduces the article\'s mcu0m.hex bytes', toHex(bytes).replace(/\/\/.*$/gm, '').split(/\s+/).filter(Boolean).join('').toLowerCase() === art.toLowerCase());
ck('hex keeps source as comments', /^0016 \/\/ 00\s+LOOP:\s+LD\s+I/.test(toHex(r)));
ck('listing has address, word, source', listingText(r)[1].startsWith('002  401a'));
ck('forward and backward labels, numbers, offsets', assemble('JMP END+2\nWORD 0x10\nWORD 0b11\nWORD -1\nEND: WORD 7').words.join() === [0x2000 | 10, 16, 3, 0xffff, 7].join(), assemble('JMP END+2\nEND: WORD 7').errors.map(e => e.message).join());
ck('case-insensitive mnemonics, ; comments', assemble('ld 4 ; hi\nLd 4').words.join() === '4,4');
ck('ORG pads with zeros', assemble('ORG 4\nWORD 9').words.join() === '0,0,9');
ck('SIZE pads the image to a fixed depth', assemble('SIZE 8\nWORD 1').words.length === 8);
const bad = (src, re) => { const x = assemble(src); return !x.ok && re.test(x.errors.map(e => `${e.line}:${e.message}`).join('|')); };
ck('error: unknown mnemonic with line number', bad('LD 1\nFOO 2', /^2:unknown instruction/));
ck('error: undefined label', bad('JMP NOWHERE', /undefined label "NOWHERE"/));
ck('error: duplicate label', bad('A: WORD 1\nA: WORD 2', /2:label "A" is already defined/));
ck('error: operand too large for 12 bits', bad('LD 4096', /does not fit 12 bits/));
ck('error: missing operand', bad('ADD', /needs an operand/));
ck('error: ORG backwards / odd', bad('WORD 1\nWORD 2\nORG 2', /backwards/) && bad('ORG 3', /even/));
ck('error: reserved word as label', bad('LD: WORD 1', /reserved/));
ck('error: program larger than SIZE', bad('SIZE 1\nWORD 1\nWORD 2', /SIZE is 1/));
ck('all errors are reported, not just the first', assemble('FOO\nBAR\nLD X').errors.length === 3);
ck('empty source is a valid empty image', assemble('').ok && assemble('').words.length === 0);
process.exit(fail ? 1 : 0);
