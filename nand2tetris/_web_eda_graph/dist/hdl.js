/* hdl.html 頁面邏輯：內建章節案例（語料來自 window.HACKJS_CORPUS）＋自訂貼上。
   引擎＝embed.js 匯出的 HackHdl（HDL→JS 模擬＋.tst 執行），fs/path 走 hdl-rt.js shim。 */
(() => {
  'use strict';
  const el = {
    mode: document.getElementById('mode'),
    chapter: document.getElementById('chapter'),
    case: document.getElementById('case'),
    run: document.getElementById('run'),
    kbd: document.getElementById('kbd'),
    status: document.getElementById('status'),
    hdl: document.getElementById('hdl'),
    tst: document.getElementById('tst'),
    cmp: document.getElementById('cmp'),
    banner: document.getElementById('banner'),
    outtab: document.getElementById('outtab'),
    errlog: document.getElementById('errlog'),
  };

  const H = window.HackHdl;
  const { loadLibrary, mergeLibs, elab, generateJs, topClassExpr, parseScript, run, TopModel } = H;

  const CHAPTERS = [
    { label: '01 基本邏輯閘', dir: '../01' },
    { label: '02 加法器/ALU', dir: '../02' },
    { label: '03/a 時序', dir: '../03/a' },
    { label: '03/b 記憶體', dir: '../03/b' },
    { label: '04 專案（hw）', dir: '../04/mult', dir2: '../04/fill' },
    { label: '05 CPU/電腦', dir: '../05' },
    { label: '* 全鏈路（chain＋sum）', dir: 'gen/chain', dir2: 'gen/sum' },
    { label: '06 RV32I 處理器', dir: 'Riscv32i' },
  ];

  const caseCache = new Map();
  let fullLibCache = null;

  function fullLib() {
    if (fullLibCache) return fullLibCache;
    let lib = {};
    for (const c of CHAPTERS) {
      for (const d of [c.dir, c.dir2].filter(Boolean)) {
        lib = mergeLibs(lib, loadLibrary(d));
      }
    }
    fullLibCache = lib;
    return lib;
  }

  function tstListFor(ch) {
    const key = ch.dir;
    if (caseCache.has(key)) return caseCache.get(key);
    const set = new Set();
    for (const d of [ch.dir, ch.dir2].filter(Boolean)) {
      for (const k of Object.keys(window.HACKJS_CORPUS)) {
        if (k.startsWith(d + '/') && k.endsWith('.tst')) set.add(k);
      }
    }
    const list = [...set].sort();
    caseCache.set(key, list);
    return list;
  }

  function fillChapter() {
    el.chapter.innerHTML = '';
    for (let i = 0; i < CHAPTERS.length; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = CHAPTERS[i].label;
      el.chapter.appendChild(o);
    }
  }

  function fillCase() {
    const ch = CHAPTERS[Number(el.chapter.value)];
    el.case.innerHTML = '';
    for (const k of tstListFor(ch)) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = k.replace(/\.tst$/, '');
      el.case.appendChild(o);
    }
  }

  function chipNameOf(tst) {
    const m = /load\s+([\w.-]+\.hdl)/.exec(tst);
    return m ? m[1].replace(/\.hdl$/, '') : null;
  }

  function dirname(p) {
    return p.split('/').slice(0, -1).join('/');
  }

  function loadSource() {
    if (el.mode.value !== 'chapter') return;
    const ch = CHAPTERS[Number(el.chapter.value)];
    const tstPath = el.case.value;
    const tst = window.HACKJS_CORPUS[tstPath] ?? '';
    el.tst.value = tst;
    const top = chipNameOf(tst);
    const hdlKey = top
      ? Object.keys(window.HACKJS_CORPUS).find((k) => k.endsWith(`/${top}.hdl`))
      : null;
    el.hdl.value = hdlKey ? window.HACKJS_CORPUS[hdlKey] : '';
    const cmpKey = `${tstPath.replace(/\.tst$/, '')}.cmp`;
    el.cmp.value = cmpKey in window.HACKJS_CORPUS ? window.HACKJS_CORPUS[cmpKey] : '';
  }

  const DEFAULT_CUSTOM = {
    hdl: 'CHIP And9 {\n  IN a, b;\n  OUT out;\n  PARTS:\n    Nand(a=a, b=b, out=n);\n    Nand(a=n, b=n, out=out);\n}',
    tst: 'load And9.hdl,\noutput-list a%B1.1.1 b%B1.1.1 out%B1.1.1;\nset a 0, set b 0, eval, output;\nset a 1, set b 0, eval, output;\nset a 1, set b 1, eval, output;',
    cmp: '| a | b |out|\n| 0 | 0 | 0 |\n| 1 | 0 | 0 |\n| 1 | 1 | 1 |',
  };

  function applyMode() {
    const custom = el.mode.value === 'custom';
    el.chapter.disabled = custom;
    el.case.disabled = custom;
    if (custom) {
      el.hdl.value = DEFAULT_CUSTOM.hdl;
      el.tst.value = DEFAULT_CUSTOM.tst;
      el.cmp.value = DEFAULT_CUSTOM.cmp;
    } else {
      loadSource();
    }
  }

  function renderTable(out) {
    el.outtab.innerHTML = '';
    const rows = out.join('').split('\n').filter((l) => l.includes('|'));
    for (const line of rows) {
      const cells = line.split(/[|]/).slice(1, -1);
      const tr = document.createElement('tr');
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c.trim();
        tr.appendChild(td);
      }
      el.outtab.appendChild(tr);
    }
  }

  function setBanner(cls, text) {
    el.banner.className = cls;
    el.banner.textContent = text;
  }

  function runCase() {
    el.run.disabled = true;
    setBanner('', '');
    try {
      let lib;
      let script;
      let top;
      let baseDir = '.';
      const tstText = el.mode.value === 'chapter'
        ? window.HACKJS_CORPUS[el.case.value]
        : el.tst.value;
      if (el.mode.value === 'chapter') {
        lib = fullLib();
        // ccc:begin
        const parsed = H.parseHdl(el.hdl.value);
        const chip = Object.assign({}, parsed, { source: el.hdl.value });
        lib = mergeLibs(lib, { [chip.name]: chip });
        // ccc:end
        const tstPath = el.case.value;
        baseDir = dirname(tstPath);
        script = parseScript(tstText);
        top = script.load ? script.load.replace(/\.hdl$/, '') : chipNameOf(tstText);
      } else {
        lib = fullLib();
        const parsed = H.parseHdl(el.hdl.value);
        const chip = Object.assign({}, parsed, { source: el.hdl.value });
        lib = mergeLibs(lib, { [chip.name]: chip });
        script = parseScript(tstText);
        top = script.load ? script.load.replace(/\.hdl$/, '') : chip.name;
        const hasCmp = el.cmp.value.trim().length > 0;
        script.outputFile = './custom.out';
        if (hasCmp) {
          window.HACKJS_FS.writeFileSync('./custom.cmp', el.cmp.value);
          script.compareTo = './custom.cmp';
        }
      }
      if (!top) throw new Error('找不到 top（.tst 裡沒有 load，從 .hdl 也讀不出芯片名）');

      const e = elab(lib, top);
      const src = generateJs(e);
      const TopClass = new Function(`${src}\nreturn ${topClassExpr(e)};`)();
      const model = new TopModel(TopClass, e.chips[e.top]);

      const out = [];
      let error = null;
      try {
        run(model, script, baseDir, out, false, Number(el.kbd.value) | 0);
      } catch (err) {
        error = err;
      }
      renderTable(out);
      if (error) {
        setBanner('fail', error.message.startsWith('!!!') ? '✗ 比對失敗' : '✗ 執行失敗');
        el.errlog.textContent = error.message + (error.message.includes('\n') ? '' : '\n');
      } else {
        setBanner('pass', '✓ 通過');
        if (el.mode.value === 'custom' && !el.cmp.value.trim()) {
          el.errlog.textContent = '(未提供 .cmp，只顯示輸出，未比對)\n';
        } else {
          el.errlog.textContent = '';
        }
      }
    } catch (err) {
      setBanner('fail', '✗ 失敗');
      el.errlog.textContent = err.message;
    } finally {
      el.run.disabled = false;
    }
  }

  el.mode.onchange = applyMode;
  el.chapter.onchange = () => { fillCase(); loadSource(); mirrorHash(); };
  el.case.onchange = () => { loadSource(); mirrorHash(); };
  el.run.onclick = runCase;

  function initGraph() {
    // ---- v4.0 電路圖檢視器：目前 .hdl 的階層圖，可逐層點入直到 Nand／DFF ----
    const gEl = {
      btn: document.getElementById('graph'),
      overlay: document.getElementById('graphOverlay'),
      crumbs: document.getElementById('crumbs'),
      wrap: document.getElementById('graphSvgWrap'),
      pan: document.getElementById('graphPan'),
      side: document.getElementById('graphSide'),
      close: document.getElementById('graphClose'),
    };
    if (!gEl.btn || !gEl.overlay) return; // DOM 尚未就緒
    let gPath = []; // 鑽入路徑（晶片名堆疊）
    let gLib = null;
    let gScale = 1, gTx = 0, gTy = 0; // 平移縮放狀態（套在 SVG 上）
    let gFitDone = false;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pinLabel = (p) => `${p.name}${p.width > 1 ? `[${p.width}]` : ''}`;

  // 與 runCase 同規則取出目前設計的 { lib, top }
  function currentDesign() {
    const G = window.HackHdl.HdlGraph;
    if (!G) throw new Error('電路圖引擎未載入（請重新整理頁面載入新版 embed.js）');
    let lib = fullLib();
    let top = null;
    if (el.mode.value === 'chapter') {
      const parsed = H.parseHdl(el.hdl.value);
      const chip = Object.assign({}, parsed, { source: el.hdl.value });
      lib = mergeLibs(lib, { [chip.name]: chip });
      top = chipNameOf(el.tst.value) || chip.name;
    } else {
      const parsed = H.parseHdl(el.hdl.value);
      const chip = Object.assign({}, parsed, { source: el.hdl.value });
      lib = mergeLibs(lib, { [chip.name]: chip });
      const script = parseScript(el.tst.value);
      top = (script.load && script.load.replace(/\.hdl$/, '')) || chip.name;
    }
    if (!top) throw new Error('找不到 top（請先確認 .hdl 可解析）');
    // 先驗一層可畫，缺頂層時提早報錯
    G.levelOf(lib, top);
    return { lib, top };
  }

  function hdlSourceOf(type) {
    if (gPath.length && type === gPath[gPath.length - 1] && el.hdl.value) {
      // 正在看的這層若是編輯區那顆，直接顯示編輯區原始碼
      const m = /CHIP\s+([\w-]+)/.exec(el.hdl.value);
      if (m && m[1] === type) return el.hdl.value;
    }
    const key = Object.keys(window.HACKJS_CORPUS).find((k) => k.endsWith(`/${type}.hdl`));
    return key ? window.HACKJS_CORPUS[key] : null;
  }

  function boxStyle(b) {
    if (b.missing) return { fill: '#46241f', stroke: '#a03a2b', dash: '5 3', tag: '缺件' };
    if (b.primitive && b.type === 'Nand') return { fill: '#1d3b2a', stroke: '#2e7d4c', dash: '', tag: '原語 Nand' };
    if (b.primitive) return { fill: '#33244a', stroke: '#9a6fd4', dash: '', tag: '原語 DFF' };
    if (b.drillable) return { fill: '#24344a', stroke: '#6aa1d4', dash: '', tag: '可點入＋' };
    return { fill: '#2a2f3a', stroke: '#5a6b80', dash: '', tag: '內建葉節點' };
  }

  function edgeColor(e) {
    return e.kind === 'in' ? '#7ec3ff' : e.kind === 'out' ? '#9fe8a9'
      : e.kind === 'dangling' ? '#5a6b80' : '#6aa1d4';
  }

  function renderSvg(level, lay) {
    const G = window.HackHdl.HdlGraph;
    const BW = G.BOX_W;
    let s = `<svg id="graphSvg" width="${lay.width}" height="${lay.height}" xmlns="http://www.w3.org/2000/svg">`;
    s += '<defs><marker id="garr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="#6aa1d4"/></marker></defs>';
    // 邊
    for (const e of lay.edges) {
      const mx = (e.x1 + e.x2) / 2;
      const col = edgeColor(e);
      const w = e.bus ? 2.4 : 1.4;
      const dash = e.kind === 'dangling' ? ' stroke-dasharray="4 3"' : '';
      s += `<path d="M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2 - 3} ${e.y2}" fill="none" stroke="${col}" stroke-width="${w}"${dash} marker-end="url(#garr)"><title>${esc(e.fromLabel)} → ${esc(e.toLabel)}${e.bus ? ` [${e.n}]` : ''}</title></path>`;
    }
    // IN pins
    for (const p of lay.inPins) {
      s += `<g><rect x="${p.x}" y="${p.y - 10}" width="96" height="20" rx="4" fill="#274b63" stroke="#7ec3ff"/>`
        + `<text x="${p.x + 48}" y="${p.y + 4}" font-size="11" fill="#dce1e8" text-anchor="middle">${esc(pinLabel(p))}</text></g>`;
    }
    // OUT pins
    for (const p of lay.outPins) {
      s += `<g><rect x="${p.x}" y="${p.y - 10}" width="96" height="20" rx="4" fill="#3a4a2a" stroke="#9fe8a9"/>`
        + `<text x="${p.x + 48}" y="${p.y + 4}" font-size="11" fill="#dce1e8" text-anchor="middle">${esc(pinLabel(p))}</text></g>`;
    }
    // 盒子
    lay.boxes.forEach((b, i) => {
      const st = boxStyle(b);
      const part = level.parts[i];
      const cls = b.drillable ? 'gbox drill' : 'gbox';
      s += `<g class="${cls}" data-type="${esc(b.type)}" data-slot="${b.slot}">`
        + `<rect class="frame" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="7" fill="${st.fill}" stroke="${st.stroke}" stroke-width="1.6"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}>`
        + `<title>${esc(b.type)}（${esc(st.tag)}）</title></rect>`
        + `<text x="${b.x + 10}" y="${b.y + 17}" font-size="13" font-weight="bold" fill="#e6ecf4">${esc(b.label)}</text>`
        + `<text x="${b.x + b.w - 8}" y="${b.y + 16}" font-size="10" fill="#9fb2c8" text-anchor="end">${esc(st.tag)}</text>`;
      for (const pin of b.inputs) {
        s += `<text x="${b.x + 8}" y="${pin.y + 4}" font-size="11" fill="#bcd2ea">▸ ${esc(pinLabel(pin))}</text>`;
      }
      for (const pin of b.outputs) {
        s += `<text x="${b.x + b.w - 8}" y="${pin.y + 4}" font-size="11" fill="#c9d4e2" text-anchor="end">${esc(pinLabel(pin))} ▸</text>`;
      }
      // 常數接線標籤（不拉線，列在盒底）
      const consts = part.conns.filter((c) => c.dir === 'in' && c.src.kind === 'Const');
      if (consts.length) {
        s += `<text x="${b.x + 8}" y="${b.y + b.h - 6}" font-size="10" fill="#5a6b80">${esc(consts.map((c) => `${c.pin}=${c.srcText}`).join('  '))}</text>`;
      }
      s += '</g>';
    });
    // 標題列
    s += `<text x="16" y="22" font-size="14" font-weight="bold" fill="#ffd479">CHIP ${esc(level.name)}</text>`;
    s += `<text x="16" y="38" font-size="11" fill="#9fb2c8">IN ${esc(level.inPins.map(pinLabel).join(', ') || '—')}　→　OUT ${esc(level.outPins.map(pinLabel).join(', ') || '—')}</text>`;
    s += '</svg>';
    return { svg: s, boxW: BW };
  }

  function renderCrumbs() {
    gEl.crumbs.innerHTML = '';
    gPath.forEach((name, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '▸';
        gEl.crumbs.appendChild(sep);
      }
      const b = document.createElement('button');
      b.textContent = name;
      if (i === gPath.length - 1) b.className = 'cur';
      b.onclick = () => { gPath = gPath.slice(0, i + 1); renderLevel(); };
      gEl.crumbs.appendChild(b);
    });
  }

  function truthTable(truth) {
    let h = '<table><tbody>';
    truth.forEach((row, i) => {
      h += '<tr>' + row.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td class="num">${esc(c)}</td>`)).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  function renderLevelSide(level, lay) {
    const G = window.HackHdl.HdlGraph;
    const info = G.describe(level.name, gLib);
    let h = `<h3>CHIP ${esc(level.name)}</h3>`;
    h += `<div style="color:#9fb2c8">${esc(info.body)}</div>`;
    if (level.missing.length) {
      h += `<div style="color:#ff9b8a;margin-top:4px">缺件：${esc(level.missing.join(', '))}（語料或貼上原始碼中沒有定義，僅顯示本層接線）</div>`;
    }
    h += '<h3>子元件（點圖中的盒子或下表）</h3><table><tbody><tr><th>元件</th><th>性質</th></tr>';
    level.parts.forEach((p) => {
      const st = boxStyle(lay.boxes[p.slot]);
      h += `<tr><td><a href="#" data-goto="${esc(p.type)}" style="color:#7ec3ff">${esc(p.label)}</a></td><td>${esc(st.tag)}</td></tr>`;
    });
    h += '</tbody></table>';
    h += `<h3>內部線（${level.wires.length}）</h3><div style="color:#9fb2c8">${esc(level.wires.map((w) => w.name).join(', ') || '—')}</div>`;
    const src = hdlSourceOf(level.name);
    h += `<h3>.hdl 原始碼</h3>${src ? `<pre>${esc(src)}</pre>` : '<div style="color:#5a6b80">（語料無此檔，僅顯示結構）</div>'}`;
    gEl.side.innerHTML = h;
    gEl.side.querySelectorAll('[data-goto]').forEach((a) => {
      a.onclick = (ev) => { ev.preventDefault(); selectPart(a.dataset.goto); };
    });
  }

  function selectPart(type) {
    const G = window.HackHdl.HdlGraph;
    const cur = gPath[gPath.length - 1];
    const level = G.levelOf(gLib, cur);
    const inst = level.parts.find((p) => p.type === type);
    const info = G.describe(type, gLib);
    let h = `<h3>${esc(info.title)}</h3><div style="color:#9fb2c8">${esc(info.body)}</div>`;
    if (info.truth) h += `<h3>真值表</h3>${truthTable(info.truth)}`;
    if (info.inPins) {
      h += `<h3>腳位</h3><div>IN：${esc(info.inPins.map(pinLabel).join(', ') || '—')}</div>`
        + `<div>OUT：${esc(info.outPins.map(pinLabel).join(', ') || '—')}</div>`;
    }
    if (inst) {
      h += '<h3>本層接線</h3><table><tbody><tr><th>pin</th><th>接往</th></tr>';
      for (const c of inst.conns) {
        h += `<tr><td>${esc(c.pinText)}</td><td class="num">${esc(c.dir === 'out' ? `→ ${c.srcText}` : c.srcText)}</td></tr>`;
      }
      h += '</tbody></table>';
    }
    if (inst && inst.drillable) {
      h += `<div style="margin-top:8px"><button id="gDrill">點入 ${esc(type)} ▸</button></div>`;
    } else if (info.kind === 'primitive') {
      h += '<div style="margin-top:8px;color:#6fe39a">已是最底層（原語），無需再鑽入。</div>';
    }
    const src = hdlSourceOf(type);
    if (src && info.kind === 'user') h += `<h3>.hdl 原始碼</h3><pre>${esc(src)}</pre>`;
    gEl.side.innerHTML = h;
    const btn = document.getElementById('gDrill');
    if (btn) btn.onclick = () => { gPath.push(type); renderLevel(); };
  }

  function applyTransform() {
    const svg = document.getElementById('graphSvg');
    if (svg && svg.style) {
      svg.style.transform = `translate(${gTx}px, ${gTy}px) scale(${gScale})`;
      svg.style.transformOrigin = '0 0';
    }
  }

  function graphSize() {
    const svg = document.getElementById('graphSvg');
    if (!svg || typeof svg.getAttribute !== 'function') return null;
    const w = parseFloat(svg.getAttribute('width')) || 1;
    const h = parseFloat(svg.getAttribute('height')) || 1;
    return { w, h };
  }

  function fitGraph() {
    const sz = graphSize();
    if (!sz || !gEl.pan) return;
    const vw = gEl.pan.clientWidth || 600;
    const vh = gEl.pan.clientHeight || 400;
    const pad = 20;
    gScale = Math.max(0.05, Math.min((vw - pad * 2) / sz.w, (vh - pad * 2) / sz.h, 1));
    gTx = Math.max(pad, (vw - sz.w * gScale) / 2);
    gTy = pad;
    applyTransform();
  }

  function zoomAt(factor, cx, cy) {
    const old = gScale;
    gScale = Math.max(0.05, Math.min(4, gScale * factor));
    const k = gScale / old;
    gTx = cx - k * (cx - gTx);
    gTy = cy - k * (cy - gTy);
    applyTransform();
  }

  function renderLevel() {
    const G = window.HackHdl.HdlGraph;
    const cur = gPath[gPath.length - 1];
    try {
      const level = G.levelOf(gLib, cur);
      const lay = G.layoutOf(level);
      renderCrumbs();
      gEl.pan.innerHTML = renderSvg(level, lay).svg;
      renderLevelSide(level, lay);
      // 每次換層重新適配視窗
      gFitDone = false;
      const raf = (typeof window !== 'undefined' && window.requestAnimationFrame) || ((fn) => fn());
      raf(() => {
        if (!gFitDone) { gFitDone = true; fitGraph(); }
      });
    } catch (err) {
      gEl.side.innerHTML = `<h3>${esc(cur)}</h3><div style="color:#ff9b8a">${esc(err.message)}</div>`;
    }
  }

  function openGraph() {
    try {
      const { lib, top } = currentDesign();
      gLib = lib;
      gPath = [top];
      gEl.overlay.classList.remove('hidden');
      renderLevel();
    } catch (err) {
      el.errlog.textContent = `電路圖無法開啟：${err.message}\n`;
      setBanner('fail', '✗ 電路圖失敗');
    }
  }

  gEl.btn.onclick = openGraph;
  gEl.close.onclick = () => gEl.overlay.classList.add('hidden');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') gEl.overlay.classList.add('hidden');
  });

  // 平移：拖曳；縮放：滾輪／按鈕。拖曳期間抑制 click（避免誤鑽入）
  let gDragging = false, gMoved = false, gLX = 0, gLY = 0;
  if (gEl.pan) {
    gEl.pan.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      gDragging = true; gMoved = false; gLX = e.clientX; gLY = e.clientY;
      gEl.pan.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!gDragging) return;
      const dx = e.clientX - gLX, dy = e.clientY - gLY;
      if (Math.abs(dx) + Math.abs(dy) > 3) gMoved = true;
      gTx += dx; gTy += dy;
      gLX = e.clientX; gLY = e.clientY;
      applyTransform();
    });
    window.addEventListener('mouseup', () => {
      if (!gDragging) return;
      gDragging = false;
      gEl.pan.classList.remove('dragging');
    });
    gEl.pan.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = gEl.pan.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, cx, cy);
    }, { passive: false });
    const zBtn = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    zBtn('zoomIn', () => {
      const w = gEl.pan.clientWidth, h = gEl.pan.clientHeight;
      zoomAt(1.2, w / 2, h / 2);
    });
    zBtn('zoomOut', () => {
      const w = gEl.pan.clientWidth, h = gEl.pan.clientHeight;
      zoomAt(1 / 1.2, w / 2, h / 2);
    });
    zBtn('zoomFit', () => fitGraph());
    zBtn('zoomReset', () => { gScale = 1; gTx = 0; gTy = 0; applyTransform(); });
  }

  gEl.wrap.onclick = (e) => {
    if (gMoved) { gMoved = false; return; }
    const g = e.target.closest ? e.target.closest('g.gbox') : null;
    if (!g || !g.dataset.type) return;
    const cur = gPath[gPath.length - 1];
    let inst = null;
    try {
      const level = window.HackHdl.HdlGraph.levelOf(gLib, cur);
      inst = level.parts.find((p) => p.type === g.dataset.type);
    } catch (_) { /* 忽略 */ }
    if (inst && inst.drillable) {
      gPath.push(g.dataset.type);
      renderLevel();
    } else {
      selectPart(g.dataset.type);
    }
  };
  } // initGraph

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGraph);
  } else {
    initGraph();
  }
  fillChapter();
  fillCase();
  el.status.textContent = `語料 ${Object.keys(window.HACKJS_CORPUS).length} 檔`;

  // ---- v1.2 書籤/深連結：#case=../05/Memory（&run=1）或 #../05/Memory（!run）----
  function mirrorHash() {
    if (el.mode.value !== 'chapter') {
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    const bare = el.case.value.replace(/\.tst$/, '');
    history.replaceState(null, '', location.pathname + location.search + '#case=' + bare);
  }

  function hashWant() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return null;
    let h;
    try { h = decodeURIComponent(raw); } catch (_) { h = raw; }
    if (/^(case|run)=/.test(h)) {
      const hp = new URLSearchParams(h);
      return { case: hp.get('case'), run: hp.get('run') === '1' };
    }
    const m = /^(.*)!run$/.exec(h);
    return m ? { case: m[1], run: true } : { case: h, run: false };
  }

  function applyWant() {
    const q = new URLSearchParams(location.search);
    const wantCustom = q.get('mode') === 'custom' && q.get('hdl') != null;
    const wh = hashWant();
    const wantProg = (wh && wh.case) ?? q.get('case');
    const autoRun = (wh ? wh.run : false) || q.get('run') === '1';
    if (wantCustom) {
      if (el.mode.value !== 'custom') { el.mode.value = 'custom'; applyMode(); }
      el.hdl.value = q.get('hdl');
      el.tst.value = q.get('tst') ?? DEFAULT_CUSTOM.tst;
      el.cmp.value = q.get('cmp') != null ? q.get('cmp') : DEFAULT_CUSTOM.cmp;
      if (autoRun) setTimeout(runCase, 50);
      return;
    }
    if (!wantProg) { loadSource(); return; }
    const key = wantProg.endsWith('.tst') ? wantProg : wantProg + '.tst';
    const idx = CHAPTERS.findIndex((c) => (c.dir && key.startsWith(c.dir + '/')) ||
                                           (c.dir2 && key.startsWith(c.dir2 + '/')));
    if (idx < 0) { loadSource(); return; }
    el.chapter.value = String(idx);
    fillCase();
    const ok = [...el.case.options].some((o) => o.value === key);
    if (ok) el.case.value = key;
    loadSource();
    if (ok && autoRun) setTimeout(runCase, 50);
  }

  applyWant();
  window.addEventListener('hashchange', applyWant);
})();