#!/usr/bin/env node
// embed.js：把 hackeda 的 lib（純 ES module；有 node imports 的檔會改掛 __global 變數）
// 併成單一 browser 檔，產出 dist/embed.js（classic <script>，零 module、零 server、file:// 直開）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// 每個 lib 檔：去掉 `export `，跳過 `import ...`，合併到同一全域作用域。
// elab.js / tst.js 的 `import fs from 'node:fs'` 由全域 fs/path 取代（見 bundle 開頭）。
function bundleLibs(libs, exportsBlock) {
  const needFsPath = libs.some((rel) => {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    return src.includes('node:fs') || src.includes('node:path');
  });
  let out = '// hackeda JS bundle（tools/embed.js 產生，勿手動編輯）\n';
  if (needFsPath) {
    out += '// fs/path 由頁面在載入 embed.js「前」設定（libraria shim 走 HACKJS_CORPUS 語料對照表）\n';
    out += 'const fs = globalThis.HACKJS_FS;\nconst path = globalThis.HACKJS_PATH;\n';
  }
  for (const rel of libs) {
    const abs = path.join(root, rel);
    let src = fs.readFileSync(abs, 'utf8');
    if (/node:fs|node:path/.test(src) && !needFsPath) {
      throw new Error(`${rel} 依賴 node fs/path，但 bundle 沒有對應 shim 約定`);
    }
    out += `\n/***** ${rel} *****/\n${stripEsm(src)}\n`;
  }
  out += `\n/***** riscv toolchain (rvasm+rvemu) *****/\n${bundleRvSection(rvLibs)}\n`;
  out += `\n/***** exports *****/\n${exportsBlock}\n`;
  return out;
}

const libs = [
  'lib/vm/hackemu.js',
  'lib/asm/hackasm.js',
  'lib/asm/vm2asm.js',
  'lib/riscv/vm2riscv.js',
  'lib/jack/jack2vm.js',
  'lib/hdl/ast.js',
  'lib/hdl/parser.js',
  'lib/hdl/elab.js',
  'lib/hdl/codegen.js',
  'lib/rt/fmt.js',
  'lib/rt/tst.js',
  'lib/rt/model.js',
];

// RISC-V 工具鏈（riscv/_web_tools 的 isa＋rvasm＋rvdis＋rvemu，四檔互無同名符號）。
// 不動對方原始碼：包成獨立 IIFE 再匯出（其 assemble 與 HackAsm.assemble 同名，直接拼接會覆蓋）。
const rvLibs = [
  '../../riscv/_web_tools/lib/isa.js',
  '../../riscv/_web_tools/lib/rvasm.js',
  '../../riscv/_web_tools/lib/rvdis.js',
  '../../riscv/_web_tools/lib/rvemu.js',
];

function stripEsm(src) {
  return src
    .split('\n')
    .filter((l) => !/^\s*import\b/.test(l))
    .map((l) => l.replace(/^\s*export\s+(const|let|function|class)\b/, '$1'))
    .join('\n');
}

function bundleRvSection(files) {
  let inner = '';
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    if (/node:fs|node:path/.test(src)) throw new Error(`${rel} 依賴 node fs/path，不可進瀏覽器 bundle`);
    inner += `\n/***** ${rel} *****/\n${stripEsm(src)}\n`;
  }
  return `const RvToolchain = (() => {\n${inner}\nreturn { assemble, disassemble, Emulator };\n})();`;
}

const exportsBlock = `(function (win) {
  win.HackVM = {
    Vm,
    SCREEN_BASE, SCREEN_WORDS, SCREEN_ROWS, SCREEN_COLS, KBD_ADDR, RAM_WORDS,
    KEY_NEWLINE, KEY_BACKSPACE, KEY_LEFT, KEY_UP, KEY_RIGHT, KEY_DOWN,
  };
  win.HackAsm = { D_MAP, C_MAP, J_MAP, PREDEFINED, parseAsmLine, code2binary, assemble };
  win.HackVm2Asm = { translate };
  win.HackVm2Rv = { translate: Vm2Rv.translate };
  win.HackRv = {
    assemble: RvToolchain.assemble,
    disassemble: RvToolchain.disassemble,
    Emulator: RvToolchain.Emulator,
  };
  win.HackJack2Vm = { compileJack };
  win.HackHdl = {
    parseHdl,
    loadLibrary, mergeLibs, mergeLibsList, elab, Builtin,
    generateJs, topClassExpr, pinSan,
    parseScript, run,
    TopModel,
  };
})(window);`;

const outPath = path.join(root, 'dist', 'embed.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bundleLibs(libs, exportsBlock));
console.log(`→ ${path.relative(root, outPath)}（${libs.length} 個 lib）`);