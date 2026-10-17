#!/usr/bin/env node
// hackasm CLI：`node cli/hackasm.js <Name>` → 讀 <Name>.asm、寫 <Name>.hack 與 <Name>.bin
import fs from 'node:fs';
import path from 'node:path';
import { assemble } from '../lib/asm/hackasm.js';

function main() {
  const a = process.argv.slice(2);
  if (a.length !== 1) {
    console.error('用法：node cli/hackasm.js <Name>（讀 <Name>.asm，寫 <Name>.hack / <Name>.bin）');
    process.exit(1);
  }
  const base = a[0];
  const inPath = base.endsWith('.asm') ? base : `${base}.asm`;
  const asmText = fs.readFileSync(inPath, 'utf8');
  const { hack, bin } = assemble(asmText);
  const hackPath = base.endsWith('.asm') ? base.replace(/\.asm$/, '.hack') : `${base}.hack`;
  const binPath = base.endsWith('.asm') ? base.replace(/\.asm$/, '.bin') : `${base}.bin`;
  fs.writeFileSync(hackPath, hack);
  fs.writeFileSync(binPath, bin);
  const n = bin.length / 2;
  console.log(`組譯完成：${inPath} → ${hackPath}（${n} 列）＋ ${binPath}`);
}

main();