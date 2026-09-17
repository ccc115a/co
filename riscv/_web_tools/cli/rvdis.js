#!/usr/bin/env node
// rvdis CLI：`node cli/rvdis.js <Name>.hex` → 每列印 `addr: hex  asm` 到 stdout
import fs from 'node:fs';
import { disassemble } from '../lib/rvdis.js';

function main() {
  const a = process.argv.slice(2);
  if (a.length !== 1) {
    console.error('用法：node cli/rvdis.js <Name>.hex');
    process.exit(1);
  }
  const hexPath = a[0];
  let text;
  try {
    text = fs.readFileSync(hexPath, 'utf8');
  } catch (e) {
    console.error(`錯誤：讀取 ${hexPath} 失敗：${e.message}`);
    process.exit(1);
  }
  const origin = 0x0;
  const words = [];
  text.split('\n').forEach((raw, idx) => {
    const ln = raw.trim();
    if (!ln) return;
    if (!/^[0-9a-fA-F]{1,8}$/.test(ln)) {
      console.error(`錯誤：${hexPath} 第 ${idx + 1} 列 '${ln}' 不是合法 32-bit hex`);
      process.exit(1);
    }
    words.push(parseInt(ln, 16) >>> 0);
  });
  let asms;
  try {
    asms = disassemble(words, origin);
  } catch (e) {
    console.error(`反組譯失敗：${e.message}`);
    process.exit(1);
  }
  asms.forEach((asm, i) => {
    // lib 若已回傳 `addr: hex  asm` 完整列則直接印，否則補上前綴（皆滿足輸出格式）
    if (/^[0-9a-fA-F]{1,8}:\s/.test(asm)) {
      console.log(asm);
      return;
    }
    const addr = (origin + i * 4) >>> 0;
    const hex = (words[i] >>> 0).toString(16).padStart(8, '0');
    console.log(`${addr.toString(16).padStart(8, '0')}: ${hex}  ${asm}`);
  });
}

main();
