#!/usr/bin/env node
// jack2vm CLI：`node cli/jack2vm.js <Name.jack|dir>` → 在原始檔同目錄寫 output/<Name>.vm
import fs from 'node:fs';
import path from 'node:path';
import { compileJack } from '../lib/jack/jack2vm.js';

function analyzeFile(filepath) {
  const src = fs.readFileSync(filepath, 'utf8');
  const lines = compileJack(src);
  const dir = path.dirname(filepath);
  const outDir = path.join(dir, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(filepath).replace(/\.jack$/, '');
  fs.writeFileSync(path.join(outDir, `${base}.vm`), lines.join('\n') + '\n');
  console.log(`Analyzing ${filepath}`);
}

function main() {
  const a = process.argv.slice(2);
  if (a.length !== 1) {
    console.error('用法：node cli/jack2vm.js <Name.jack|目錄>');
    process.exit(1);
  }
  const p = a[0];
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    fs.readdirSync(p).forEach((d) => {
      if (d.endsWith('.jack')) analyzeFile(path.join(p, d));
    });
  } else if (p.endsWith('.jack')) {
    analyzeFile(p);
  } else {
    throw new Error('Input must be a .jack file or a directory');
  }
  console.log('Compilation finished.');
}

main();