#!/usr/bin/env node
// vm2riscv CLI：`node cli/vm2riscv.js <out>.s <in>.vm [in2.vm ...] [--lenient]`
// （多檔自動寫 bootstrap；--lenient＝顯示模式，未定義 OS 呼叫照發 jal 僅供檢視）
import fs from 'node:fs';
import { Vm2Rv } from '../lib/riscv/vm2riscv.js';

function main() {
  const a = process.argv.slice(2);
  const lenient = a.includes('--lenient');
  const paths = a.filter((p) => p !== '--lenient');
  if (paths.length < 2) {
    console.error('用法：node cli/vm2riscv.js <out.s> <in.vm> [in2.vm ...] [--lenient]');
    process.exit(1);
  }
  const outPath = paths[0];
  const files = paths.slice(1).map((p) => ({ path: p, src: fs.readFileSync(p, 'utf8') }));
  const asm = Vm2Rv.translate(files, { lenient });
  fs.writeFileSync(outPath, asm);
  console.log(`轉換完成：${paths.slice(1).join(' ')} → ${outPath}${lenient ? '（lenient 顯示模式）' : ''}`);
}

main();
