#!/usr/bin/env node
// vm2asm CLI：`node cli/vm2asm.js <out>.asm <in>.vm [in2.vm ...]`（多檔自動寫 bootstrap）
import fs from 'node:fs';
import path from 'node:path';
import { translate } from '../lib/asm/vm2asm.js';

function main() {
  const a = process.argv.slice(2);
  if (a.length < 2) {
    console.error('用法：node cli/vm2asm.js <out.asm> <in.vm> [in2.vm ...]');
    process.exit(1);
  }
  const outPath = a[0];
  const files = a.slice(1).map((p) => ({ path: p, src: fs.readFileSync(p, 'utf8') }));
  const asm = translate(files);
  fs.writeFileSync(outPath, asm);
  console.log(`轉換完成：${a.slice(1).join(' ')} → ${outPath}`);
}

main();