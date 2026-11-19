// 靜態伺服器測試：啟動 server.js，檢查頁面與引擎檔案的 MIME
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exists = async (p) => { try { await import('node:fs/promises').then(fs => fs.access(p)); return true; } catch { return false; } };

test('server 回應 index.html 與正確 MIME', { skip: !(await exists(join(root, 'public/vendor/yowasp/yosys/bundle.js'))) && 'vendor 未就緒（先跑 npm run vendorize）' }, async (t) => {
  const port = 18088;
  const srv = spawn(process.execPath, [join(root, 'server.js'), String(port)], { stdio: 'ignore' });
  t.after(() => srv.kill());
  // 等伺服器起來
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    await new Promise(r => setTimeout(r, 100));
    up = await fetch(`http://localhost:${port}/`).then(r => r.ok).catch(() => false);
  }
  assert.ok(up, '伺服器應啟動');

  const home = await fetch(`http://localhost:${port}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(await home.text(), /WebEDA/);

  const js = await fetch(`http://localhost:${port}/js/sim.js`);
  assert.match(js.headers.get('content-type'), /text\/javascript/);

  const wasm = await fetch(`http://localhost:${port}/vendor/yowasp/yosys/yosys.core.wasm`, { method: 'HEAD' });
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');

  const nf = await fetch(`http://localhost:${port}/nope.js`);
  assert.equal(nf.status, 404);
});
