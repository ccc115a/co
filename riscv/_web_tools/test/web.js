// test/web.js：web/app.js 前端接線測試（DOM stub 跑在 node）。
// 執行：於 _web_tools/ 下 `node --test test/`（由 test/index.js 載入）。
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { compileKernel } from '../lib/cu2rv.js';

function mkEl() {
  return {
    value: '', textContent: '', innerHTML: '', className: '',
    children: [],
    appendChild(c) { this.children.push(c); return c; },
    focus() {},
    setSelectionRange() {},
  };
}

const ids = ['example', 'kuexample', 'src', 'kusrc', 'origin',
  'status', 'listing', 'regs', 'uart', 'statSteps', 'statExit', 'statMsg'];
const els = {};
for (const id of ids) els[id] = mkEl();
els.origin.value = '0x0';

const KU2 = [
  { name: 'vecadd', src: 'lanes 4;\nn 8;\nmem A[8] @ 0x100 = i + 1;\nmem B[8] @ 0x120;\nmem C[8] @ 0x140;\nkernel k {\n  for (i: int = tid; i < n; i += ntid) {\n    C[i] = A[i];\n  }\n  barrier();\n}\nexpect {\n  C[0] = 1;\n}\n' },
  { name: 'bad', src: 'lanes 4;\nn 8;\nmem A[8] @ 0x100;\nmem B[8] @ 0x120;\nkernel k {\n  C[i] = A[i];\n}\n' },
];

globalThis.document = {
  readyState: 'complete',
  getElementById: (id) => els[id] || mkEl(),
  createElement: () => mkEl(),
  addEventListener: () => {},
};
// 真實 DSL 編譯器＋假組譯器：只測 UI 接線，不測編譯正確性（見 cu2rv.js）
globalThis.RVJS = {
  assemble: () => ({ words: [], labels: {}, listing: [] }),
  compileKernel,
};
globalThis.RVJS_KUCORPUS = KU2;

let App;
before(async () => {
  const mod = await import('../web/app.js');
  void mod;
  App = globalThis.App;
});

describe('web/app.js：DSL 面板接線', () => {
  it('init 載入 DSL 下拉選單與預設內容', () => {
    assert.ok(App);
    assert.equal(els.kuexample.children.length, 2);
    assert.equal(els.kuexample.children[0].textContent, 'vecadd');
    assert.ok(els.kusrc.value.includes('lanes 4'));
  });
  it('切換 DSL 範例換內容', () => {
    els.kuexample.value = '1';
    App.onKuChange();
    assert.ok(els.kusrc.value.includes('C[i] = A[i]'));
  });
  it('編譯成功送組語到 #src', () => {
    els.kuexample.value = '0';
    App.onKuChange();
    App.doCompileKu();
    assert.ok(els.src.value.includes('tid'));
    assert.ok(els.status.textContent.includes('編譯成功'));
  });
  it('編譯失敗顯示行號（游標移到 kusrc）', () => {
    els.kuexample.value = '1';
    App.onKuChange();
    App.doCompileKu();
    assert.ok(els.status.textContent.includes('DSL 編譯失敗'));
    assert.ok(els.status.className.includes('error'));
  });
  it('缺 compileKernel 時友善提示', () => {
    const keep = globalThis.RVJS;
    globalThis.RVJS = { assemble: () => ({}) };
    App.doCompileKu();
    assert.ok(els.status.textContent.includes('compileKernel'));
    globalThis.RVJS = keep;
  });
});
