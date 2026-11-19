// 把 node_modules 裡 YoWASP 套件的 gen/（bundle.js + wasm + resources tar）
// 複製到 public/vendor/，讓瀏覽器可以直接用原生 ES module 載入
// （bundle.js 用 import.meta.url 相對路徑抓 wasm，放同一層即可運作）。
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const pkgs = [
  ['@yowasp/yosys', 'yosys'],
  ['@yowasp/nextpnr-ice40', 'nextpnr-ice40'],
];

for (const [pkg, name] of pkgs) {
  const src = join(root, 'node_modules', pkg, 'gen');
  const dst = join(root, 'public', 'vendor', 'yowasp', name);
  if (!existsSync(src)) {
    console.error(`找不到 ${src}，請先 npm install`);
    process.exit(1);
  }
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log(`已複製 ${pkg} -> public/vendor/yowasp/${name}`);
}
