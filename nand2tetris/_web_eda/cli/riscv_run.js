#!/usr/bin/env node
// riscv_run CLI：`node cli/riscv_run.js <in>.s [--max N] [--dump A,C]`
// 組譯 RV32 組語（經 third_party/rvtools 的 rvasm）後定步執行（rvemu），印暫存器與記憶體。
// 注意：vm2riscv 產物尾端是無窮迴圈、不 halt，故永遠「跑滿 --max 即停」，結果看 STATIC 區。
import fs from 'node:fs';
import { assemble } from '../third_party/rvtools/rvasm.js';
import { Emulator } from '../third_party/rvtools/rvemu.js';
import { Vm2Rv } from '../lib/riscv/vm2riscv.js';
import { needVal, parseRange, parseMax } from './cliutil.js';

const { STATIC_BASE } = Vm2Rv;
const DEFAULT_MAX = 200000;

function usage() {
  console.error('用法：node cli/riscv_run.js <in.s> [--max N] [--dump A,B]（A,B 可為十進位或 0x 十六進位，可重複）');
}

function hex8(v) {
  return `0x${(v >>> 0).toString(16).padStart(8, '0')}`;
}

function main() {
  const a = process.argv.slice(2);
  let srcPath = '';
  let max = DEFAULT_MAX;
  const dumps = [[STATIC_BASE, STATIC_BASE + 7]];
  let i = 0;
  while (i < a.length) {
    if (a[i] === '--max') {
      max = parseMax(needVal(a, i, '--max'));
      i += 2;
    } else if (a[i] === '--dump') {
      dumps.push(parseRange(needVal(a, i, '--dump')));
      i += 2;
    } else if (a[i].startsWith('-')) {
      console.error(`錯誤：未知選項 '${a[i]}'`);
      usage();
      process.exit(1);
    } else {
      if (srcPath) { console.error('錯誤：只能指定一個輸入檔'); usage(); process.exit(1); }
      srcPath = a[i];
      i += 1;
    }
  }
  if (!srcPath) { usage(); process.exit(1); }

  let asmText;
  try {
    asmText = fs.readFileSync(srcPath, 'utf8');
  } catch (e) {
    console.error(`錯誤：讀取 ${srcPath} 失敗：${e.message}`);
    process.exit(1);
  }
  let words;
  try {
    ({ words } = assemble(asmText, { origin: 0 }));
  } catch (e) {
    console.error(`組譯失敗：${e.message}`);
    process.exit(1);
  }

  const emu = new Emulator();
  emu.loadWords(words, 0);
  try {
    for (let k = 0; k < max; k++) emu.step();
  } catch (e) {
    console.error(`執行失敗：${e.message}`);
    process.exit(1);
  }

  console.log(`loaded ${srcPath} (${words.length} instructions), 跑滿 ${max} 步即停（不 halt）`);
  const reg = (n, name) => `${name}=${hex8(emu.getReg(n))} (${emu.getReg(n) | 0})`;
  console.log(`PC=${hex8(emu.pc)} ${reg(1, 'ra')} ${reg(9, 's1/SP')} ${reg(10, 'a0')}`);
  console.log(`UART:\n${emu.uart}`);
  for (const [x, y] of dumps) {
    const vs = [];
    for (let w = x; w <= y; w += 4) vs.push(emu.loadWord(w));
    console.log(`RAM[${hex8(x)}..=${hex8(y)}]: [${vs.join(', ')}]`);
  }
}

main();
