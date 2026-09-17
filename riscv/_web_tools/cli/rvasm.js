#!/usr/bin/env node
// rvasm CLI：`node cli/rvasm.js <Name>.s [--origin 0x0]` → 讀組語、寫 <Name>.hex 與 <Name>.bin
import fs from 'node:fs';
import { assemble } from '../lib/rvasm.js';

function usage() {
  console.error('用法：node cli/rvasm.js <Name>.s [--origin 0x0]');
}

function parseOrigin(s) {
  const v = Number(s);
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) {
    console.error(`錯誤：--origin '${s}' 不是合法位址（需為 0～0xffffffff 整數）`);
    process.exit(1);
  }
  return v >>> 0;
}

function main() {
  const a = process.argv.slice(2);
  if (a.length < 1 || a[0].startsWith('-')) {
    usage();
    process.exit(1);
  }
  let srcPath = a[0];
  if (!srcPath.endsWith('.s')) srcPath += '.s';
  let origin = 0x0;
  const oi = a.indexOf('--origin');
  if (oi >= 0) {
    if (oi + 1 >= a.length) {
      console.error('錯誤：--origin 缺少位址參數');
      process.exit(1);
    }
    origin = parseOrigin(a[oi + 1]);
  }
  let asmText;
  try {
    asmText = fs.readFileSync(srcPath, 'utf8');
  } catch (e) {
    console.error(`錯誤：讀取 ${srcPath} 失敗：${e.message}`);
    process.exit(1);
  }
  let words;
  try {
    ({ words } = assemble(asmText, { origin }));
  } catch (e) {
    console.error(`組譯失敗：${e.message}`);
    process.exit(1);
  }
  const base = srcPath.replace(/\.s$/, '');
  const hexPath = `${base}.hex`;
  const binPath = `${base}.bin`;
  const hex = words.length > 0
    ? words.map((w) => (w >>> 0).toString(16).padStart(8, '0')).join('\n') + '\n'
    : '';
  const bin = words.length > 0
    ? words.map((w) => (w >>> 0).toString(2).padStart(32, '0')).join('\n') + '\n'
    : '';
  fs.writeFileSync(hexPath, hex);
  fs.writeFileSync(binPath, bin);
  console.log(`組譯完成：${srcPath} → ${hexPath}（${words.length} 列）＋ ${binPath}`);
}

main();
