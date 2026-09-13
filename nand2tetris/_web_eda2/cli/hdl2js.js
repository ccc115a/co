// hdl2js：hackjs 版作法──把 HackHDL 晶片轉譯成 JavaScript（產生模擬 class），
// 再配合內建 .tst 執行器跑官方測資。
//
// 用法：
//   node cli/hdl2js.js --dir ../01 --dir ../02                     # 跑 01/02 全部 test
//   node cli/hdl2js.js --dir ../01 --dir ../02 --test ../02/ALU.tst
//
// 產出：--keep 時在 <out>/gen 寫下 <Top>_sim.js（自足 ESM）。

import fs from 'node:fs';
import path from 'node:path';
import { loadLibrary, mergeLibs, elab } from '../lib/hdl/elab.js';
import { topClassExpr, generateJs, san } from '../lib/hdl/codegen.js';
import { parseScript, run } from '../lib/rt/tst.js';
import { TopModel } from '../lib/rt/model.js';

function usage() {
  console.error('用法：node cli/hdl2js.js --dir DIR [--dir DIR ...] [--test FILE.tst] [--top NAME] [--out gen] [--keep] [--release]');
  console.error('  --dir     HDL 程式庫目錄（可多次指定，required）');
  console.error('  --test    只執行指定的 .tst（可多次）；省略則跑全部 .tst');
  console.error('  --top     top 晶片名稱（預設從 .tst 的 load 讀取）');
  console.error('  --out     產出目錄（預設 gen）');
  console.error('  --keep    保留產出的 gen/<Top>_sim.js');
  console.error('  --release 本版無作用（JS 不需建置）');
}

function parseArgs(argv) {
  const a = { dirs: [], tests: [], top: null, out: 'gen', keep: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') { a.dirs.push(argv[++i]); }
    else if (arg === '--test') { a.tests.push(argv[++i]); }
    else if (arg === '--top') { a.top = argv[++i]; }
    else if (arg === '--out') { a.out = argv[++i]; }
    else if (arg === '--keep') { a.keep = true; }
    else if (arg === '--release') { /* JS 不需建置 */ }
    else if (arg === '--help' || arg === '-h') { usage(); process.exit(0); }
    else { console.error(`未知參數：${arg}`); usage(); process.exit(2); }
  }
  if (a.dirs.length === 0) {
    usage();
    process.exit(2);
  }
  return a;
}

function collectTst(dirList) {
  const out = [];
  for (const d of dirList) {
    collectTstR(d, out);
  }
  out.sort();
  return out;
}

function collectTstR(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('.')) continue;
      collectTstR(p, out);
    } else if (ent.name.endsWith('.tst')) {
      // Memory.tst 需要人工按住鍵盤鍵（while out <> 75/89），無法自動化：跳過
      if (ent.name === 'Memory.tst') return;
      out.push(p);
    }
  }
}

/** compile：把產出的 JS class（含 setBits/內建）編譯成可用的 Top class */
function compileTop(e, { asModule = false } = {}) {
  const src = generateJs(e, { asModule });
  if (asModule) return { TopClass: null, src };
  const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
  return { TopClass: fn(), src };
}

// 產出程式內的 ROM32K.load 透過這個 hook 讀檔（瀏覽器版改掛語料 map）
globalThis.HACKJS_FS = {
  read(p) {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  },
};

/** 執行單一 test：回傳 true = PASS */
function runOne(lib, a, tst) {
  let src;
  try {
    src = fs.readFileSync(tst, 'utf8');
  } catch (e) {
    throw new Error(`讀取 ${tst} 失敗：${e.message}`);
  }
  const script = parseScript(src);
  if (!script.outputFile && script.outputList.length === 0) {
    throw new Error('腳本沒有 output-file / output-list，無從驗證');
  }

  const top = a.top ?? (script.load ? script.load.replace(/\.hdl$/, '') : null);
  if (!top) throw new Error('找不到 top（沒有 --top，腳本中也沒有 load）');

  const e = elab(lib, top);
  const { TopClass } = compileTop(e);
  const model = new TopModel(TopClass, e.chips[e.top]);

  const baseDir = path.dirname(tst);
  const out = [];
  run(model, script, baseDir, out, false);
  if (script.outputFile) {
    // run() 已把 out 寫入檔案並比對；false 只代表有錯（會 throw）
    // no-op；--keep 產出在下方
  } else {
    // 沒有 output-file：把 out 直接印到 stdout（例如自訂 script）
    for (const line of out) process.stdout.write(line);
  }

  if (a.keep) {
    const sanTop = san(e.chips[e.top].name);
    const outDir = path.join(a.out, `${sanTop}_sim`);
    fs.mkdirSync(outDir, { recursive: true });
    const src = compileTop(e, { asModule: true }).src;
    fs.writeFileSync(path.join(outDir, 'hw.js'), src);
  }
  return true;
}

function main() {
  const a = parseArgs(process.argv.slice(2));

  let lib = {};
  for (const d of a.dirs) {
    try {
      lib = mergeLibs(lib, loadLibrary(d));
    } catch (e) {
      console.error(`載入 ${d} 失敗：${e.message}`);
      process.exit(2);
    }
  }

  const tests = a.tests.length > 0 ? a.tests.slice() : collectTst(a.dirs);
  if (tests.length === 0) {
    console.error('找不到任何 .tst 檔案');
    process.exit(2);
  }

  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      if (runOne(lib, a, t)) pass += 1;
      else fail += 1;
    } catch (e) {
      console.error(`${t}: ${e.message}`);
      fail += 1;
    }
  }
  console.log(`==== 結果：${pass} 通過，${fail} 失敗 ====`);
  if (fail > 0) process.exit(1);
}

main();