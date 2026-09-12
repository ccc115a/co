#!/usr/bin/env node
// browser_jack_smoke.js：模擬 jack.html 瀏覽器工作流（corpus＋shim＋embed 同一環境）：
//   對每個內建 Jack 程式：parseJack(dir) → compileJack（.vm）→ vm2asm（.asm）→
//   hackasm（.hack）→ hackemu 跑完 → 報表。chain 驗證 RAM[16]=5（oracle）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');

globalThis.window = globalThis;
(0, eval)(fs.readFileSync(path.join(dist, 'corpus.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(dist, 'hdl-rt.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(dist, 'embed.js'), 'utf8'));

const { compileJack } = globalThis.HackJack2Vm;
const { translate } = globalThis.HackVm2Asm;
const { assemble } = globalThis.HackAsm;
const { Vm } = globalThis.HackVM;
const corpus = globalThis.HACKJS_CORPUS;

const OS_DIR = 'gen/os_src';
const PROGRAMS = [
  { name: 'Seven', dir: '../11/jack/Seven', needsOS: true },
  { name: 'Average', dir: '../11/jack/Average', needsOS: true },
  { name: 'ComplexArrays', dir: '../11/jack/ComplexArrays', needsOS: true },
  { name: 'ConvertToBin', dir: '../11/jack/ConvertToBin', needsOS: true },
  { name: 'Square', dir: '../11/jack/Square', needsOS: true },
  { name: 'Pong', dir: '../11/jack/Pong', needsOS: true },
  { name: 'Sum', dir: '../11/jackNoOs/Sum', needsOS: false },
  { name: 'Factorial', dir: '../11/jackNoOs/Factorial', needsOS: false },
  { name: 'Fib', dir: '../11/jackNoOs/Fib', needsOS: false },
  { name: 'GCD', dir: '../11/jackNoOs/GCD', needsOS: false },
  { name: 'PrimeUnder100', dir: '../11/jackNoOs/PrimeUnder100', needsOS: false },
  { name: 'chain', dir: 'gen/chain', needsOS: false },
];

function jackSources(dir) {
  return Object.keys(corpus)
    .filter((k) => k.startsWith(dir + '/') && k.endsWith('.jack'))
    .sort();
}

function pipeline(prog) {
  const srcFiles = [];
  const compile = (k) => ({ path: k.split('/').pop().replace(/\.jack$/, '.vm'), src: compileJack(corpus[k]).join('\n') + '\n' });
  if (prog.needsOS) {
    for (const k of jackSources(OS_DIR)) srcFiles.push(compile(k));
  }
  for (const k of jackSources(prog.dir)) srcFiles.push(compile(k));
  const asm = translate(srcFiles);
  const { hack, bin } = assemble(asm);
  return { srcFiles, asm, hack, bin };
}

let pass = 0;
let fail = 0;
for (const prog of PROGRAMS) {
  try {
    const { srcFiles, asm, hack, bin } = pipeline(prog);
    if (!asm || !hack || bin.length === 0) throw new Error('管線產出為空');
    const vm = new Vm();
    vm.loadHack(hack);
    const steps = prog.name === 'chain' ? 5000 : 200000;
    vm.run(steps);
    const pc = vm.pc;
    const ram16 = vm.ram[16];
    let ok = Number.isFinite(pc);
    if (prog.name === 'chain') ok = ok && ram16 === 5;
    if (!ok) throw new Error(`意外結果：pc=${pc} RAM[16]=${ram16}（期望 chain 得 5）`);
    console.log(`PASS ${prog.name}（vm=${srcFiles.length} rom=${hack.split('\n').filter(Boolean).length} pc=${pc} RAM[16]=${ram16}）`);
    pass += 1;
  } catch (err) {
    fail += 1;
    console.log(`FAIL ${prog.name}: ${err.message.split('\n')[0]}`);
  }
}
console.log(`browser-jack-smoke：${pass} 通過，${fail} 失敗`);
process.exit(fail > 0 ? 1 : 0);