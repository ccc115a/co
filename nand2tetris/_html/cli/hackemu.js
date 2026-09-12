#!/usr/bin/env node
// hackemu headless CLI：`node cli/hackemu.js --headless <file.bin> [--max N] [--dump A,B] [--keys F] [--trace N]`
import fs from 'node:fs';
import path from 'node:path';
import { Vm, KEY_LEFT, KEY_UP, KEY_RIGHT, KEY_DOWN } from '../lib/vm/hackemu.js';

const KEY_CODES = {
  newline: 128, backspace: 129, left: 130, up: 131, right: 132, down: 133,
  home: 134, end: 135, pageup: 136, pagedown: 137, insert: 138, delete: 139, escape: 140,
};

function parseKeys(p) {
  const events = [];
  const txt = fs.readFileSync(p, 'utf8');
  txt.split('\n').forEach((raw, idx) => {
    const ln = raw.split('#')[0].trim();
    if (!ln) return;
    const toks = ln.split(/\s+/);
    if (toks.length < 2) throw new Error(`--keys:${idx + 1}: 需要 '指令數 按鍵' 兩欄`);
    const at = Number(toks[0]);
    const keyName = toks[1].toLowerCase();
    if (!Number.isInteger(at)) throw new Error(`--keys:${idx + 1}: '${toks[0]}' 不是指令數`);
    let code;
    if (/^[a-z]$/.test(keyName)) code = keyName.toUpperCase().charCodeAt(0);
    else if (/^\d$/.test(keyName)) code = keyName.charCodeAt(0);
    else code = KEY_CODES[keyName];
    if (code === undefined) throw new Error(`--keys:${idx + 1}: 未知按鍵 '${keyName}'`);
    const down = toks.length < 3 || toks[2] !== 'up';
    events.push([at, code, down]);
  });
  return events.sort((a, b) => a[0] - b[0]);
}

function headless(args) {
  const file = args[0];
  if (!file) {
    console.error('usage: node cli/hackemu.js --headless <file> [--max N] [--dump A,B] [--keys FILE] [--trace N]');
    process.exit(2);
  }
  let max = 100_000;
  let trace = 0;
  let keysPath = '';
  let imgPath = '';
  const dumps = [];
  let i = 1;
  while (i < args.length) {
    if (args[i] === '--max') { max = Number(args[i + 1]); i += 2; }
    else if (args[i] === '--dump') {
      const toks = args[i + 1].split(',');
      dumps.push([Number(toks[0]), Number(toks[1])]);
      i += 2;
    }
    else if (args[i] === '--trace') { trace = Number(args[i + 1]); i += 2; }
    else if (args[i] === '--keys') { keysPath = args[i + 1]; i += 2; }
      else if (args[i] === '--img') { imgPath = args[i + 1]; i += 2; }
    else i += 1;
  }

  const vm = new Vm();
  const bytes = fs.readFileSync(file);
  if (file.endsWith('.bin')) vm.loadBin(bytes);
  else if (file.endsWith('.hack')) vm.loadHack(bytes.toString('utf8'));
  else throw new Error(`unknown filename (needs .bin or .hack): ${file}`);

  console.log(`loaded ${file} (${vm.rom.length} instructions)`);
  console.log(`before: PC=${vm.pc} A=${vm.a} D=${vm.d} SP=${vm.ram[0]}`);
  const events = keysPath ? parseKeys(keysPath) : [];
  let ei = 0;
  const held = [];
  const ring = [];
  let tick = 0;
  const prevCycles = vm.cycles;

  const runBudget = (budget) => {
    vm.runUntil(budget, (pc, i, a) => {
      tick += 1;
      if (trace === 0) return true;
      let txt;
      if ((i & 0x8000) === 0) {
        txt = `@${(i & 0x7fff).toString().padStart(5)}   ; 0x${i.toString(16).padStart(4, '0').toUpperCase()}`;
      } else {
        const dst = ['', 'M', 'D', 'DM', 'A', 'AM', 'AD', 'ADM'][(i >> 3) & 7];
        const jmp = ['', ';JGT', ';JEQ', ';JGE', ';JLT', ';JNE', ';JLE', ';JMP'][i & 7];
        txt = `D=${(i >> 12) & 1 === 1 ? 'M' : 'A'}+A ${dst}${jmp}`;
      }
      if (ring.length >= trace) ring.shift();
      ring.push({ pc, txt });
      return true;
    });
  };

  for (;;) {
    const at = ei < events.length ? events[ei][0] : max;
    const budget = Math.min(Math.max(at - vm.cycles, 0), max - vm.cycles);
    runBudget(budget);
    if (vm.cycles >= max || vm.cycles === prevCycles) break;
    while (ei < events.length && events[ei][0] <= vm.cycles) {
      const [, code, down] = events[ei];
      if (down) {
        if (!held.includes(code)) held.push(code);
      } else {
        const k = held.indexOf(code);
        if (k >= 0) held.splice(k, 1);
      }
      ei += 1;
    }
    vm.setKey(held.length > 0 ? held[held.length - 1] : 0);
  }

  console.log(`after: PC=${vm.pc} A=${vm.a} D=${vm.d} SP=${vm.ram[0]} cycles=${vm.cycles}`);
  console.log(`RAM[0..16]: [${Array.from(vm.ram.slice(0, 16)).join(', ')}]`);
  console.log(`RAM[16] static: ${vm.ram[16]}`);
  for (const [a, b] of dumps) {
    console.log(`RAM[${a}..=${b}]: [${Array.from(vm.ram.slice(a, b + 1)).join(', ')}]`);
  }
  for (const { pc, txt } of ring) {
    console.log(`${String(pc).padStart(5)}: ${txt}`);
  }
  if (imgPath) {
    const W = 512, H = 256;
    const header = Buffer.from(`P6\n${W} ${H}\n255\n`);
    const data = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = vm.screenPixel(y, x) ? 0 : 255;
        const o = (y * W + x) * 3;
        data[o] = data[o + 1] = data[o + 2] = p;
      }
    }
    fs.writeFileSync(imgPath, Buffer.concat([header, data]));
    console.log(`wrote ${imgPath}`);
  }
}

const argv = process.argv.slice(2);
const h = argv.indexOf('--headless');
if (h < 0) {
  console.error('hackemu 目前僅支援 headless：node cli/hackemu.js --headless <file> [--max N] …');
  process.exit(2);
}
headless(argv.slice(h + 1));