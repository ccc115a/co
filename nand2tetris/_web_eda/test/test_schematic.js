// HdlGraph 單元測試（v4.0 電路圖）：階層資料＋佈局＋鑽入終點判定
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseHdl } from '../lib/hdl/parser.js';
import { loadLibrary, mergeLibs } from '../lib/hdl/elab.js';
import { HdlGraph } from '../lib/hdl/schematic.js';

const AND_SRC = 'CHIP And { IN a, b; OUT out; PARTS: Nand(a=a, b=b, out=n); Not(in=n, out=out); }';
const NOT_SRC = 'CHIP Not { IN in; OUT out; PARTS: Nand(a=in, b=in, out=out); }';
// 含時序回授：深度計算不可發散（與 elab 斷邊同理）
const BIT_SRC = 'CHIP Bit { IN in, load; OUT out; PARTS: Mux(a=loop, b=in, sel=load, out=m); DFF(in=m, out=loop, out=out); }';
const MUX_SRC = 'CHIP Mux { IN a, b, sel; OUT out; PARTS: Not(in=sel, out=nsel); And(a=a, b=nsel, out=a1); And(a=b, b=sel, out=b1); Or(a=a1, b=b1, out=out); }';

function lib() {
  return {
    And: parseHdl(AND_SRC),
    Not: parseHdl(NOT_SRC),
    Bit: parseHdl(BIT_SRC),
    Mux: parseHdl(MUX_SRC),
  };
}

describe('schematic level', () => {
  it('And 單層：2 parts，Nand 為原語、Not 可鑽入', () => {
    const lv = HdlGraph.levelOf(lib(), 'And');
    assert.equal(lv.name, 'And');
    assert.equal(lv.parts.length, 2);
    const [nand, not] = lv.parts;
    assert.equal(nand.type, 'Nand');
    assert.equal(nand.kind, 'builtin');
    assert.equal(nand.primitive, true);
    assert.equal(nand.drillable, false);
    assert.equal(not.type, 'Not');
    assert.equal(not.kind, 'user');
    assert.equal(not.drillable, true);
    assert.equal(not.primitive, false);
  });

  it('Not 單層：只有 Nand，wire 只有 in/out', () => {
    const lv = HdlGraph.levelOf(lib(), 'Not');
    assert.equal(lv.parts.length, 1);
    assert.equal(lv.parts[0].primitive, true);
    assert.deepEqual(lv.wires.map((w) => w.name).sort(), ['in', 'out']);
  });

  it('缺件標 missing 而非報錯', () => {
    const lv = HdlGraph.levelOf(lib(), 'Mux'); // And/Or 不在 lib 內
    const kinds = new Set(lv.parts.map((p) => p.kind));
    assert.ok(kinds.has('missing'));
    assert.ok(lv.missing.length > 0);
    assert.equal(lv.parts.find((p) => p.type === 'Not').drillable, true);
  });

  it('找不到的頂層直接報錯', () => {
    assert.throws(() => HdlGraph.levelOf(lib(), 'NoSuch'), /找不到晶片/);
  });

  it('conns 保留 pin=src（輸入輸出方向正確）', () => {
    const lv = HdlGraph.levelOf(lib(), 'And');
    const nand = lv.parts[0];
    const dirs = Object.fromEntries(nand.conns.map((c) => [c.pin, c.dir]));
    assert.equal(dirs.a, 'in');
    assert.equal(dirs.b, 'in');
    assert.equal(dirs.out, 'out');
    assert.equal(nand.conns.find((c) => c.pin === 'out').srcText, 'n');
  });
});

describe('schematic describe', () => {
  it('Nand 有真值表、DFF 有行為說明', () => {
    const n = HdlGraph.describe('Nand', lib());
    assert.equal(n.kind, 'primitive');
    assert.ok(n.truth.length === 5);
    const d = HdlGraph.describe('DFF', lib());
    assert.equal(d.kind, 'primitive');
    assert.match(d.body, /時脈/);
  });

  it('使用者晶片可點入、缺件有說明', () => {
    assert.equal(HdlGraph.describe('Not', lib()).kind, 'user');
    assert.equal(HdlGraph.describe('Ghost', lib()).kind, 'missing');
  });

  it('isPrimitive 只對 Nand/DFF 為真', () => {
    assert.equal(HdlGraph.isPrimitive('Nand'), true);
    assert.equal(HdlGraph.isPrimitive('DFF'), true);
    assert.equal(HdlGraph.isPrimitive('Not'), false);
    assert.equal(HdlGraph.isPrimitive('ARegister'), false);
  });
});

describe('schematic layout', () => {
  it('And 版面：2 盒、邊數>0、尺寸為正、確定性', () => {
    const lv = HdlGraph.levelOf(lib(), 'And');
    const a = HdlGraph.layoutOf(lv);
    const b = HdlGraph.layoutOf(lv);
    assert.equal(a.boxes.length, 2);
    assert.ok(a.edges.length > 0);
    assert.ok(a.width > 0 && a.height > 0);
    assert.deepEqual(a, b);
    // Nand 在左欄、Not 在右欄（依賴 n）
    assert.ok(a.boxes[0].x < a.boxes[1].x);
  });

  it('Bit 回授不發散：寬度有上限、DFF 落在第 0 欄', () => {
    const lv = HdlGraph.levelOf({ Bit: parseHdl(BIT_SRC), Mux: parseHdl(MUX_SRC) }, 'Bit');
    const lay = HdlGraph.layoutOf(lv);
    assert.ok(lay.width < 3000, `寬度發散：${lay.width}`);
    const dff = lay.boxes.find((bx) => bx.type === 'DFF');
    const mux = lay.boxes.find((bx) => bx.type === 'Mux');
    assert.ok(dff.x <= mux.x);
  });

  it('盒子錨點都在盒內、邊端點落在盒邊界上', () => {
    const lv = HdlGraph.levelOf(lib(), 'And');
    const lay = HdlGraph.layoutOf(lv);
    for (const bx of lay.boxes) {
      for (const p of bx.inputs) {
        assert.equal(p.y > bx.y && p.y < bx.y + bx.h, true);
      }
    }
    for (const e of lay.edges) {
      if (e.kind === 'wire' || e.kind === 'out') {
        const src = lay.boxes.find((bx) => bx.x + bx.w === e.x1);
        assert.ok(src, `邊起點不在盒右緣：${e.wire}`);
      }
    }
  });
});

describe('schematic 課程實例鑽鏈', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const courses = path.resolve(here, '..', 'third_party', 'courses');
  function courseLib() {
    let lib = {};
    for (const d of ['01', '02', ['03', 'a'].join('/'), ['03', 'b'].join('/'), '05']) {
      lib = mergeLibs(lib, loadLibrary(path.join(courses, ...d.split('/'))));
    }
    return lib;
  }

  it('FullAdder 全分支鑽入必終止於原語／內建葉節點', () => {
    const lib = courseLib();
    const seen = new Set();
    const dfs = (name, depth) => {
      assert.ok(depth <= 12, `鑽入過深：${name}`);
      if (seen.has(name)) return;
      seen.add(name);
      const lv = HdlGraph.levelOf(lib, name);
      HdlGraph.layoutOf(lv); // 每層都可佈局
      const drillables = lv.parts.filter((p) => p.drillable);
      if (!drillables.length) {
        assert.ok(lv.parts.every((p) => p.primitive || p.kind === 'builtin'),
          `${name} 無可鑽入元件卻含非葉節點`);
        return;
      }
      for (const d of drillables) dfs(d.type, depth + 1);
    };
    dfs('FullAdder', 0);
    assert.ok(seen.has('Xor') && seen.has('And') && seen.has('Or') && seen.has('Not'),
      `分支不全：${[...seen].join(',')}`);
    // Not 這層只剩 Nand：已到最底層原語
    assert.ok(HdlGraph.levelOf(lib, 'Not').parts.every((p) => p.primitive));
  });

  it('課程 33 顆晶片每層都可建圖＋佈局', () => {
    const lib = courseLib();
    for (const name of Object.keys(lib)) {
      const lv = HdlGraph.levelOf(lib, name);
      const lay = HdlGraph.layoutOf(lv);
      assert.ok(lay.width > 0 && lay.height > 0, `${name} 版面尺寸異常`);
      assert.ok(lay.width < 20000 && lay.height < 20000, `${name} 版面發散 ${lay.width}x${lay.height}`);
    }
  });
});

describe('schematic dist 整合', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(here, '..', 'dist');
  const read = (p) => fs.readFileSync(path.join(dist, p), 'utf8');

  it('hdl.html 有檢視電路圖按鈕＋彈窗＋新版引用', () => {
    const h = read('hdl.html');
    assert.match(h, /id="graph"/);
    assert.match(h, /id="graphOverlay"/);
    assert.match(h, /id="crumbs"/);
    assert.match(h, /id="graphSvgWrap"/);
    assert.match(h, /id="graphSide"/);
    assert.match(h, /embed\.js\?v=17/);
    assert.match(h, /hdl\.js\?v=15/);
  });

  it('hdl.html 有平移縮放控制（pan 容器＋縮放鈕）', () => {
    const h = read('hdl.html');
    const js = read('hdl.js');
    assert.match(h, /id="graphPan"/);
    for (const id of ['zoomIn', 'zoomOut', 'zoomFit', 'zoomReset']) {
      assert.ok(h.includes(`id="${id}"`), `hdl.html 缺 ${id}`);
      assert.ok(js.includes(`'${id}'`), `hdl.js 未接 ${id}`);
    }
    assert.match(js, /addEventListener\('wheel'/);
    assert.match(js, /fitGraph/);
  });

  it('hdl.js 用的彈窗 id 皆存在於 hdl.html', () => {
    const js = read('hdl.js');
    const html = read('hdl.html');
    for (const id of ['graph', 'graphOverlay', 'crumbs', 'graphSvgWrap', 'graphPan', 'graphSide', 'graphClose']) {
      assert.ok(js.includes(`getElementById('${id}')`), `hdl.js 未取 ${id}`);
      assert.ok(html.includes(`id="${id}"`), `hdl.html 缺 ${id}`);
    }
    assert.ok(js.includes('HdlGraph'), 'hdl.js 未使用 HdlGraph');
  });

  it('embed.js 匯出 HdlGraph（含 schematic 章節）', () => {
    const e = read('embed.js');
    assert.match(e, /lib\/hdl\/schematic\.js/);
    assert.match(e, /HdlGraph/);
  });

  it('其餘三頁的 embed 引用同步＋1', () => {
    for (const p of ['index.html', 'jack.html', 'rvemu.html']) {
      assert.match(read(p), /embed\.js\?v=17/, p);
    }
  });
});
