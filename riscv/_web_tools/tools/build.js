#!/usr/bin/env node
// build.js：把 lib/（ES module，`import`/`export` 寫法）併成單一 browser 檔，
// 產出 dist/rvjs.js（classic <script>，零 module、零 server、file:// 直開），
// 並把 web/ 頁面複製到 dist/（改掛 ./rvjs.js），語料有則產生 dist/corpus.js。
// 做法仿 nand2tetris/_web_eda/tools/embed.js。
// lib/ 與 examples/ 由另一人平行撰寫：讀不到不報錯（防禦式相容）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const products = [];

// 每個 lib 檔：去掉 `export ` 前綴，跳過 `import ...` 行，合併到同一全域作用域。
function bundleLibs(libs) {
  let out = '// rvjs bundle（tools/build.js 產生，勿手動編輯）\n';
  const hit = [];
  for (const rel of libs) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue; // 另一人撰寫中：讀不到不報錯
    hit.push(rel);
    let src = fs.readFileSync(abs, 'utf8');
    src = src
      .split('\n')
      .filter((l) => !/^\s*import\b/.test(l))
      .map((l) => l.replace(/^\s*export\s+default\b/, '').replace(/^\s*export\s+(const|let|var|function|class)\b/, '$1'))
      .join('\n');
    out += `\n/***** ${rel} *****/\n${src}\n`;
  }
  if (hit.length === 0) {
    // lib/ 尚不存在：輸出樁，讓頁面顯示友善提示而非載入失敗
    out += `
// lib/ 尚未提供：樁實作，呼叫時拋出中文提示
function __rvMissing(what) { throw new Error('rvjs lib/ 撰寫中：' + what + ' 尚未提供，請稍後重新 node tools/build.js'); }
function assemble() { __rvMissing('assemble'); }
function disassemble() { __rvMissing('disassemble'); }
class Emulator {
  constructor() { __rvMissing('Emulator'); }
}
`;
  }
  // 防禦式匯出：lib 若用別名，typeof 守衛避免整包 ReferenceError；
  // app.js/enc.js 會偵測缺失並顯示提示。
  out += `
/***** exports *****/
globalThis.RVJS = {
  assemble: (typeof assemble !== 'undefined' ? assemble : undefined),
  disassemble: (typeof disassemble !== 'undefined' ? disassemble : undefined),
  Emulator: (typeof Emulator !== 'undefined' ? Emulator : undefined),
  compileKernel: (typeof compileKernel !== 'undefined' ? compileKernel : undefined),
};
`;
  return { out, hit };
}

const libs = ['lib/isa.js', 'lib/rvasm.js', 'lib/rvdis.js', 'lib/rvemu.js', 'lib/cu2rv.js'];

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

// 1. dist/rvjs.js
{
  const { out, hit } = bundleLibs(libs);
  const outPath = path.join(root, 'dist', 'rvjs.js');
  fs.writeFileSync(outPath, out);
  products.push(`dist/rvjs.js（${hit.length ? hit.join('、') : 'stub：lib/ 尚無檔案'}）`);
}

// 2. web/*.html → dist/（改掛 ./rvjs.js、./corpus.js），app.js/enc.js/style.css 一併複製
for (const f of ['app.js', 'enc.js', 'style.css']) {
  const src = path.join(root, 'web', f);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(root, 'dist', f));
  products.push(`dist/${f}`);
}
for (const f of ['index.html', 'enc.html']) {
  const src = path.join(root, 'web', f);
  if (!fs.existsSync(src)) continue;
  let html = fs.readFileSync(src, 'utf8');
  html = html.split('../dist/rvjs.js').join('./rvjs.js');
  html = html.split('../dist/corpus.js').join('./corpus.js');
  html = html.split('../dist/kucorpus.js').join('./kucorpus.js');
  fs.writeFileSync(path.join(root, 'dist', f), html);
  products.push(`dist/${f}`);
}

// 3. examples/*.s → dist/corpus.js（讀到才併入，讀不到不報錯）
{
  const exDir = path.join(root, 'examples');
  let entries = [];
  if (fs.existsSync(exDir)) {
    entries = fs.readdirSync(exDir).filter((f) => f.endsWith('.s')).sort()
      .map((f) => ({ name: path.basename(f, '.s'), src: fs.readFileSync(path.join(exDir, f), 'utf8') }));
  }
  if (entries.length > 0) {
    const outPath = path.join(root, 'dist', 'corpus.js');
    const body = entries.map((e) => `  { name: ${JSON.stringify(e.name)}, src: ${JSON.stringify(e.src)} }`).join(',\n');
    fs.writeFileSync(outPath,
      '// RVJS 語料（tools/build.js 由 examples/*.s 產生，勿手動編輯）\n' +
      '// web/app.js 優先用它覆蓋下拉選單。\n' +
      `globalThis.RVJS_CORPUS = [\n${body}\n];\n`);
    products.push(`dist/corpus.js（${entries.length} 個語料：${entries.map((e) => e.name).join('、')}）`);
  } else {
    products.push('dist/corpus.js（略：examples/*.s 不存在，頁面用內嵌預設範例）');
  }
}

// 4. kernels/*.ku → dist/kucorpus.js（讀到才併入，讀不到不報錯）
{
  const kuDir = path.join(root, 'kernels');
  let entries = [];
  if (fs.existsSync(kuDir)) {
    entries = fs.readdirSync(kuDir).filter((f) => f.endsWith('.ku')).sort()
      .map((f) => ({ name: path.basename(f, '.ku'), src: fs.readFileSync(path.join(kuDir, f), 'utf8') }));
  }
  if (entries.length > 0) {
    const outPath = path.join(root, 'dist', 'kucorpus.js');
    const body = entries.map((e) => `  { name: ${JSON.stringify(e.name)}, src: ${JSON.stringify(e.src)} }`).join(',\n');
    fs.writeFileSync(outPath,
      '// cu2rv DSL 語料（tools/build.js 由 kernels/*.ku 產生，勿手動編輯）\n' +
      '// web/app.js 優先用它覆蓋 DSL 下拉選單。\n' +
      `globalThis.RVJS_KUCORPUS = [\n${body}\n];\n`);
    products.push(`dist/kucorpus.js（${entries.length} 個語料：${entries.map((e) => e.name).join('、')}）`);
  } else {
    products.push('dist/kucorpus.js（略：kernels/*.ku 不存在，頁面用內嵌 DSL 範例）');
  }
}

console.log('rvjs build 產物：');
for (const p of products) console.log(`→ ${p}`);
