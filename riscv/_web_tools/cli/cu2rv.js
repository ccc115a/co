#!/usr/bin/env node
// cu2rv CLI：`node cli/cu2rv.js <Name>.ku [-o <Name>.s]` → 讀自訂 kernel DSL、寫 riscvgpu 組語
import fs from 'node:fs';
import { compileKernel } from '../lib/cu2rv.js';

function usage() {
  console.error('用法：node cli/cu2rv.js <Name>.ku [-o <Name>.s]');
  console.error('  預設輸出與輸入同名的 .s（只輸出組語；再以 cli/rvasm.js 組譯成 .hex）');
}

function main() {
  const a = process.argv.slice(2);
  if (a.length < 1 || a[0].startsWith('-')) {
    usage();
    process.exit(1);
  }
  let srcPath = a[0];
  if (!srcPath.endsWith('.ku')) srcPath += '.ku';
  let outPath = srcPath.replace(/\.ku$/, '.s');
  const oi = a.indexOf('-o');
  if (oi >= 0) {
    if (oi + 1 >= a.length) {
      console.error('錯誤：-o 缺少檔名參數');
      process.exit(1);
    }
    outPath = a[oi + 1];
  }
  let src;
  try {
    src = fs.readFileSync(srcPath, 'utf8');
  } catch (e) {
    console.error(`錯誤：讀取 ${srcPath} 失敗：${e.message}`);
    process.exit(1);
  }
  let asm;
  try {
    ({ asm } = compileKernel(src));
  } catch (e) {
    console.error(`編譯失敗：${e.message}`);
    process.exit(1);
  }
  fs.writeFileSync(outPath, asm);
  console.log(`編譯完成：${srcPath} → ${outPath}`);
}

main();
