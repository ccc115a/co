#!/usr/bin/env node
// gen_corpus.js：把內建語料（ch01~05＋gen/chain 的 .hdl/.tst/.cmp/.hack，不含 .bin）
// 打包成 dist/corpus.js：`window.HACKJS_CORPUS = { '../01/Nand.hdl': '...', ... }`。
// 瀏覽器版 hdl.html 的 fs shim 就用這個 map 當「唯讀檔案系統」。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const DIRS = ['../01', '../02', '../03/a', '../03/b', '../05', '../04/mult', '../04/fill', 'gen/chain'];
const EXTS = ['.hdl', '.tst', '.cmp', '.hack'];
const SKIP = new Set(['Memory.tst', 'Keyboard.tst', 'Mult.tst', 'Fill.tst']); // 互動式（需人工按鍵/螢幕），batch 不可跑

const corpus = {};
const add = (dir) => {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    const name = ent.name;
    if (!EXTS.some((e) => name.endsWith(e))) continue;
    if (SKIP.has(name)) continue;
    const key = path.join(dir, name);
    try {
      corpus[key] = fs.readFileSync(path.join(abs, name), 'utf8');
    } catch {
      /* 忽略無法讀取的檔 */
    }
  }
};
for (const d of DIRS) add(d);

// v1.0：Jack 語料（編譯用 .jack；立即顯示在 jack.html 的 tab）
const JACK_PROGRAMS = ['Seven', 'Average', 'ComplexArrays', 'ConvertToBin', 'Square', 'Pong']; // needsOS
const JACK_NOOS = ['Sum', 'Factorial', 'Fib', 'GCD', 'PrimeUnder100'];
const addJackDir = (rel) => {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith('.jack')) continue;
    corpus[path.join(rel, ent.name)] = fs.readFileSync(path.join(abs, ent.name), 'utf8');
  }
};
for (const p of JACK_PROGRAMS) addJackDir(`../11/jack/${p}`);
for (const p of JACK_NOOS) addJackDir(`../11/jackNoOs/${p}`);
addJackDir('gen/os_src');
addJackDir('gen/chain');

const json = JSON.stringify(corpus, null, 0);
const out = `// 內建語料（tools/gen_corpus.js 產生，勿手動編輯）：${Object.keys(corpus).length} 個檔案\nwindow.HACKJS_CORPUS = ${json};\n`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'corpus.js'), out);
console.log(`→ dist/corpus.js（${Object.keys(corpus).length} 檔）`);