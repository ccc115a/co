// dist 模擬器頁無頭測試：假 DOM＋真實 bundle（corpus＋hdl-rt＋embed＋emu-common），
// 驅動 app.js（Hack）與 rvemu.js（RISCV）驗證共用範例選單、開檔、執行。
// 用法：node --test test/test_emu_pages.js（會被 npm test 一併跑到）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');
const read = (p) => fs.readFileSync(path.join(dist, p), 'utf8');

function makeDiv() {
  const cls = new Set();
  return {
    classList: {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c),
    },
    getBoundingClientRect: () => ({ top: 0, height: 10 }),
  };
}

function makeEl(id, canvasCtx) {
  const el = {
    id, value: '', textContent: '', className: '', disabled: false,
    checked: false, title: '', dataset: {}, files: [], children: [],
    onclick: null, onchange: null, oninput: null,
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    click() { this.clicked = (this.clicked || 0) + 1; },
    getBoundingClientRect: () => ({ top: 0, height: 100 }),
    scrollTop: 0, clientHeight: 100, parentElement: null,
  };
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set: (v) => {
      html = String(v);
      el.children = [];
      const n = (html.match(/<div/g) || []).length;
      for (let i = 0; i < n; i++) el.children.push(makeDiv());
    },
  });
  el.querySelector = (sel) => {
    if (sel === '.cur') return el.children.find((c) => c.classList.contains('cur')) || null;
    return null;
  };
  if (id === 'screen') el.getContext = () => canvasCtx;
  return el;
}

// 載入一頁：全新假 DOM＋共用 bundle，執行 page script，回傳操作把手。
// ids：該頁 getElementById 會用到的 id 表；fileContent：FileReader 讀到的內容。
function loadPage(pageJs, ids, fileContent) {
  const canvasCtx = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  };
  const els = {};
  for (const id of ids) els[id] = makeEl(id, canvasCtx);
  els.listing.parentElement = {
    scrollTop: 0, clientHeight: 100, getBoundingClientRect: () => ({ top: 0, height: 100 }),
  };
  const listeners = {};
  let raf = null;
  const g = globalThis;
  g.window = g;
  g.document = {
    getElementById: (id) => els[id] || makeEl(id, canvasCtx),
    createElement: (tag) => (tag === 'canvas' ? { getContext: () => canvasCtx } : makeEl('dyn', canvasCtx)),
    querySelectorAll: () => [],
  };
  g.history = { replaceState() {} };
  g.location = { hash: '', search: '', pathname: '/x' };
  g.addEventListener = (ev, fn) => { (listeners[ev] ||= []).push(fn); };
  g.requestAnimationFrame = (fn) => { raf = fn; return 1; };
  g.FileReader = class {
    readAsText() { this.result = fileContent; if (this.onload) this.onload(); }
  };
  g.open = () => ({ closed: false, postMessage() {}, location: {} });
  (0, eval)(read('corpus.js'));
  (0, eval)(read('hdl-rt.js'));
  (0, eval)(`${read('embed.js')}\n//# sourceURL=embed-test.js`);
  (0, eval)(read('emu-common.js'));
  (0, eval)(`${read(pageJs)}\n//# sourceURL=${pageJs}`);
  let now = 1000;
  return {
    els, listeners,
    frame(n = 1) { for (let i = 0; i < n; i++) { now += 16; raf(now); } },
    fire(ev, data) { for (const fn of listeners[ev] || []) fn(data); },
  };
}

const APP_IDS = ['asm', 'example', 'open', 'file', 'load', 'run', 'step', 'reset',
  'speed', 'screen', 'status', 'regs', 'chips', 'listing', 'ramStart', 'ramLen',
  'ramBtn', 'ramBody', 'ramPrev', 'ramNext', 'fps'];
const RV_IDS = ['example', 'build', 'open', 'file', 'load', 'run', 'step', 'reset',
  'speed', 'maxsteps', 'src', 'listing', 'screen', 'status', 'regs', 'chips', 'uart',
  'memStart', 'memLen', 'memBtn', 'memBody', 'memPrev', 'memNext', 'fps'];

function curCount(els) {
  return els.listing.children.filter((c) => c.classList.contains('cur')).length;
}

describe('index.html/app.js：範例選單＋開檔與 RISCV 頁一致', () => {
  it('範例選單列出 12 支且與共用清單同名', () => {
    const { els } = loadPage('app.js', APP_IDS, '');
    const names = els.example.children.map((c) => c.value);
    assert.equal(names.length, 12);
    assert.deepEqual(names, window.EmuCommon.PROGRAMS.map((p) => p.name));
  });

  it('選 Sum 即編成 Hack 組語並載入，跑三幀 PC 推進且高亮唯一', () => {
    const { els, frame } = loadPage('app.js', APP_IDS, '');
    els.example.value = 'Sum';
    els.example.onchange();
    assert.match(els.asm.value, /D=A/);
    assert.match(els.status.textContent, /Sum/);
    els.run.onclick();
    frame(3);
    assert.match(els.regs.textContent, /PC=(\d+)/);
    assert.ok(Number(/PC=(\d+)/.exec(els.regs.textContent)[1]) > 0);
    assert.equal(curCount(els), 1);
  });

  it('開檔讀入 .asm 並載入', () => {
    const { els } = loadPage('app.js', APP_IDS, '@5\nD=A\n@0\nM=D\n');
    els.open.onclick();
    assert.equal(els.file.clicked, 1);
    els.file.files = [{}];
    els.file.onchange();
    assert.ok(els.asm.value.includes('@5'));
    assert.match(els.status.textContent, /組譯完成/);
  });

  it('跨視窗 hackjs-load 自動載入並執行', () => {
    const { els, fire } = loadPage('app.js', APP_IDS, '');
    fire('message', { data: { type: 'hackjs-load', asm: '@5\nD=A\n@0\nM=D\n' } });
    assert.equal(els.run.textContent, '暫停 ⏸');
  });
});

describe('rvemu.html/rvemu.js：範例選單＋開檔與 Hack 頁一致', () => {
  it('範例選單與 Hack 頁同名單', () => {
    const { els } = loadPage('rvemu.js', RV_IDS, '');
    const names = els.example.children.map((c) => c.value);
    assert.equal(names.length, 12);
    assert.deepEqual(names, window.EmuCommon.PROGRAMS.map((p) => p.name));
  });

  it('選 Sum 即編成 .s 並載入，跑兩幀 steps 推進', () => {
    const { els, frame } = loadPage('rvemu.js', RV_IDS, '');
    els.example.value = 'Sum';
    els.build.onclick();
    assert.match(els.src.value, /addi/);
    els.run.onclick();
    frame(2);
    const m = /steps=(\d+)/.exec(els.regs.textContent);
    assert.ok(m && Number(m[1]) > 0);
  });

  it('開檔讀入 .s 並載入', () => {
    const { els } = loadPage('rvemu.js', RV_IDS, 'addi x1, x0, 42\nsw x1, 0(s1)\n');
    els.open.onclick();
    assert.equal(els.file.clicked, 1);
    els.file.files = [{}];
    els.file.onchange();
    assert.ok(els.src.value.includes('addi x1'));
    assert.match(els.status.textContent, /組譯完成/);
  });

  it('跨視窗 rvjs-load 自動載入並執行', () => {
    const { els, fire } = loadPage('rvemu.js', RV_IDS, '');
    fire('message', { data: { type: 'rvjs-load', s: 'addi x0, x0, 0\n' } });
    assert.equal(els.run.textContent, '暫停 ⏸');
  });
});
