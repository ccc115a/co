// hdl.html 電路圖檢視器端到端測試（v4.0）：假 DOM＋真實 bundle＋真實 hdl.js，
//實際按下「檢視電路圖」、斷言 SVG 產出、鑽入 Or→Not、末層 Nand 顯示真值表。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');
const read = (p) => fs.readFileSync(path.join(dist, p), 'utf8');

function makeEl(id) {
  const cls = new Set();
  const el = {
    id, value: '', textContent: '', className: '', disabled: false,
    onclick: null, onchange: null, dataset: {},
    children: [], options: [],
    classList: {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c),
    },
    appendChild(c) {
      this.children.push(c);
      if (c && 'value' in c && 'textContent' in c) this.options.push(c);
      return c;
    },
    querySelectorAll: () => [],
    addEventListener() {},
    getBoundingClientRect: () => ({ top: 0, height: 10 }),
  };
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set: (v) => { html = String(v); el.children = []; el.options = []; },
  });
  return el;
}

const IDS = ['mode', 'chapter', 'case', 'run', 'kbd', 'status', 'hdl', 'tst', 'cmp',
  'banner', 'outtab', 'errlog', 'graph', 'graphOverlay', 'crumbs', 'graphSvgWrap',
  'graphPan', 'graphSide', 'graphClose', 'nav', 'zoomIn', 'zoomOut', 'zoomFit', 'zoomReset'];
let els;

function boot() {
  els = {};
  for (const id of IDS) els[id] = makeEl(id);
  els.mode.value = 'chapter';
  els.kbd.value = '0';
  els.graphOverlay.classList.add('hidden');
  const g = globalThis;
  g.window = g;
  g.document = {
    getElementById: (id) => els[id] || makeEl(id),
    createElement: () => makeEl('dyn'),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  g.history = { replaceState() {} };
  g.location = { hash: '', search: '', pathname: '/x' };
  g.addEventListener = () => {};
  (0, eval)(read('corpus.js'));
  (0, eval)(read('hdl-rt.js'));
  (0, eval)(`${read('embed.js')}\n//# sourceURL=embed-test.js`);
  (0, eval)(`${read('hdl.js')}\n//# sourceURL=hdl-test.js`);
}

function crumbNames() {
  return els.crumbs.children.filter((c) => c.textContent && c.textContent !== '▸').map((c) => c.textContent);
}

describe('hdl 電路圖檢視器', () => {
  before(() => { boot(); });

  it('開啟 Xor 電路圖：彈窗顯示、SVG 含三顆子元件', () => {
    els.chapter.value = '0'; // 01 基本邏輯閘
    els.chapter.onchange();
    const xor = els.case.options.find((o) => o.value === '../01/Xor.tst');
    assert.ok(xor, '語料應有 ../01/Xor.tst');
    els.case.value = '../01/Xor.tst';
    els.case.onchange();
    assert.match(els.hdl.value, /CHIP Xor/);
    els.graph.onclick();
    assert.equal(els.graphOverlay.classList.contains('hidden'), false);
    assert.match(els.graphPan.innerHTML, /<svg/);
    assert.match(els.graphPan.innerHTML, /CHIP Xor/);
    for (const t of ['Nand', 'Or', 'And']) {
      assert.ok(els.graphPan.innerHTML.includes(`data-type="${t}"`), `缺 ${t} 盒子`);
    }
    assert.deepEqual(crumbNames(), ['Xor']);
  });

  it('點入 Or 再點入 Not：麵包屑加深、SVG 切換', () => {
    els.graphSvgWrap.onclick({ target: { closest: () => ({ dataset: { type: 'Or' } }) } });
    assert.deepEqual(crumbNames(), ['Xor', 'Or']);
    assert.match(els.graphPan.innerHTML, /CHIP Or/);
    els.graphSvgWrap.onclick({ target: { closest: () => ({ dataset: { type: 'Not' } }) } });
    assert.deepEqual(crumbNames(), ['Xor', 'Or', 'Not']);
    assert.match(els.graphPan.innerHTML, /CHIP Not/);
  });

  it('點 Nand：不鑽入、右欄顯示真值表', () => {
    els.graphSvgWrap.onclick({ target: { closest: () => ({ dataset: { type: 'Nand' } }) } });
    assert.deepEqual(crumbNames(), ['Xor', 'Or', 'Not']); // 路徑不變
    assert.match(els.graphSide.innerHTML, /真值表/);
  });

  it('麵包屑可跳回上層、Esc 關閉', () => {
    const back = els.crumbs.children.find((c) => c.textContent === 'Xor');
    back.onclick();
    assert.deepEqual(crumbNames(), ['Xor']);
    assert.match(els.graphPan.innerHTML, /CHIP Xor/);
    els.graphClose.onclick();
    assert.equal(els.graphOverlay.classList.contains('hidden'), true);
  });
});
