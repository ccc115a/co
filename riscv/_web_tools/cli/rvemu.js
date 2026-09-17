#!/usr/bin/env node
// rvemu CLI：`node cli/rvemu.js <Name>.s|--hex <Name>.hex [--max N]` → 組譯或讀 hex、執行並印出 UART / exit / steps / 暫存器
import fs from 'node:fs';
import { assemble } from '../lib/rvasm.js';
import { Emulator } from '../lib/rvemu.js';

const DEFAULT_MAX = 100000;

function usage() {
  console.error('用法：node cli/rvemu.js <Name>.s [--max N] 或 node cli/rvemu.js --hex <Name>.hex [--max N]');
}

function parseMax(s) {
  const v = Number(s);
  if (!Number.isInteger(v) || v <= 0) {
    console.error(`錯誤：--max '${s}' 需為正整數`);
    process.exit(1);
  }
  return v;
}

function readHexWords(hexPath) {
  let text;
  try {
    text = fs.readFileSync(hexPath, 'utf8');
  } catch (e) {
    console.error(`錯誤：讀取 ${hexPath} 失敗：${e.message}`);
    process.exit(1);
  }
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
  return words;
}

function toUartString(uart) {
  if (uart === undefined || uart === null) return '';
  if (typeof uart === 'string') return uart;
  if (Array.isArray(uart)) return String.fromCharCode(...uart);
  return String(uart);
}

function fmtReg(v) {
  const u = (v | 0) >>> 0;
  const s = v | 0;
  return `0x${u.toString(16).padStart(8, '0')} (${s})`;
}

function main() {
  const a = process.argv.slice(2);
  let srcPath = '';
  let hexPath = '';
  let max = DEFAULT_MAX;
  let i = 0;
  while (i < a.length) {
    if (a[i] === '--hex') {
      if (i + 1 >= a.length) {
        console.error('錯誤：--hex 缺少檔名參數');
        process.exit(1);
      }
      hexPath = a[i + 1];
      i += 2;
    } else if (a[i] === '--max') {
      if (i + 1 >= a.length) {
        console.error('錯誤：--max 缺少數值參數');
        process.exit(1);
      }
      max = parseMax(a[i + 1]);
      i += 2;
    } else if (a[i].startsWith('-')) {
      console.error(`錯誤：未知選項 '${a[i]}'`);
      usage();
      process.exit(1);
    } else {
      if (srcPath) {
        console.error('錯誤：只能指定一個輸入檔');
        usage();
        process.exit(1);
      }
      srcPath = a[i];
      i += 1;
    }
  }
  if ((srcPath && hexPath) || (!srcPath && !hexPath)) {
    usage();
    process.exit(1);
  }

  const origin = 0x0;
  let words;
  let label = '';
  if (hexPath) {
    words = readHexWords(hexPath);
    label = hexPath;
  } else {
    if (!srcPath.endsWith('.s')) srcPath += '.s';
    let asmText;
    try {
      asmText = fs.readFileSync(srcPath, 'utf8');
    } catch (e) {
      console.error(`錯誤：讀取 ${srcPath} 失敗：${e.message}`);
      process.exit(1);
    }
    try {
      ({ words } = assemble(asmText, { origin }));
    } catch (e) {
      console.error(`組譯失敗：${e.message}`);
      process.exit(1);
    }
    label = srcPath;
  }

  const emu = new Emulator();
  emu.loadWords(words, origin);
  let res;
  try {
    res = emu.run({ maxSteps: max });
  } catch (e) {
    console.error(`執行失敗：${e.message}`);
    process.exit(1);
  }

  console.log(`loaded ${label} (${words.length} instructions)`);
  console.log('UART:');
  console.log(toUartString(res.uart));
  console.log(`exit=${res.exitCode}`);
  console.log(`steps=${res.steps}`);
  console.log(`halted=${res.halted}`);

  const regs = emu.regs ?? emu.x ?? emu.registers ?? null;
  if (regs) {
    const names = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'a0'];
    const idx = [1, 2, 3, 4, 5, 6, 7, 10];
    console.log(names.map((n, k) => `${n}=${fmtReg(regs[idx[k]])}`).join(' '));
  } else {
    console.log('registers: (模擬器未暴露暫存器陣列，無法顯示)');
  }
}

main();
