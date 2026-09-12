#!/usr/bin/env node
// browser_smoke.js：模擬 hdl.html 瀏覽器環境的「內建案例」流程：
//   建立 window shim → 載入 corpus.js + hdl-rt.js + embed.js →
//   用 HackHdl 對每個章節目錄 loadLibrary、跑每個 .tst，統計通過。
// 這條路徑 == 瀏覽器端 hdl.html 的 startup（jsdom 之外的真實執行）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');

const read = (p) => fs.readFileSync(path.join(dist, p), 'utf8');

globalThis.window = globalThis;
(0, eval)(read('corpus.js'));
(0, eval)(read('hdl-rt.js'));
(0, eval)(`${read('embed.js')}\n//# sourceURL=embed-hdl.js`);

const H = globalThis.HackHdl;
const { loadLibrary, mergeLibsList, elab, generateJs, topClassExpr, parseScript, run, TopModel } = H;

const CHAPTERS = ['../01', '../02', '../03/a', '../03/b', '../05', '../04/mult', '../04/fill', 'gen/chain'];

let lib = {};
for (const d of CHAPTERS) {
  lib = H.mergeLibs(lib, loadLibrary(d));
}

function compileTop(e) {
  const src = generateJs(e);
  const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
  return fn();
}

let pass = 0, fail = 0;
for (const d of CHAPTERS) {
  const tsts = Object.keys(globalThis.HACKJS_CORPUS)
    .filter((k) => k.startsWith(d + '/') && k.endsWith('.tst'))
    .map((k) => k.replace(/\.tst$/, ''))
    .sort();
  for (const base of tsts) {
    const tstPath = `${base}.tst`;
    const src = globalThis.HACKJS_FS.readFileSync(tstPath, 'utf8');
    try {
      const script = parseScript(src);
      const top = script.load ? script.load.replace(/\.hdl$/, '') : (base.split('/').pop());
      const e = elab(lib, top);
      const TopClass = compileTop(e);
      const model = new TopModel(TopClass, e.chips[e.top]);
      const out = [];
      run(model, script, path.dirname(tstPath).replace(/\\/g, '/'), out, false);
      pass += 1;
    } catch (err) {
      fail += 1;
      console.log(`FAIL ${tstPath}: ${err.message.split('\n')[0]}`);
    }
  }
}
console.log(`browser-smoke：${pass} 通過，${fail} 失敗`);
process.exit(fail > 0 ? 1 : 0);