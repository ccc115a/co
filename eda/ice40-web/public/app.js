import { parseVCD, busToHex, valueAt, summarizeReport, layoutBounds, errorLocation } from './lib.js';
const $ = id => document.getElementById(id);
const PACKAGES = { up5k: ['sg48', 'uwg30'], hx8k: ['ct256', 'bg121', 'cb132', 'cm225', 'cm121', 'cm81'], hx1k: ['tq144', 'vq100', 'cb132', 'cb121', 'cb81', 'cm121', 'cm81', 'cm49', 'cm36', 'qn84'], lp8k: ['ct256', 'bg121', 'cb132', 'cm225', 'cm121', 'cm81'], lp1k: ['tq144', 'vq100', 'cb132', 'cb121', 'cb81', 'cm121', 'cm81', 'cm49', 'cm36', 'qn84'] };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ------------------------------------------------------------------ project files + editor
const CORE = ['design.v', 'tb.v', 'design.pcf'];
const EXTRA_OK = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,39}\.(v|sv|vh|hex|mem|txt)$/;
let files = Object.fromEntries(CORE.map(f => [f, '']));
let cur = 'design.v', layout = null, wave = null, rep = null, netSel = null;
const ed = $('ed');
function renderFileTabs() {
  const box = $('filetabs'); box.innerHTML = '';
  for (const f of Object.keys(files)) {
    const b = document.createElement('button'); b.role = 'tab'; b.textContent = f; b.setAttribute('aria-selected', f === cur);
    b.onclick = () => selectFile(f);
    if (!CORE.includes(f)) {
      const x = document.createElement('i'); x.textContent = '\u00d7'; x.title = 'Delete file'; x.style.cursor = 'pointer';
      x.onclick = e => { e.stopPropagation(); if (!confirm(`Delete ${f}?`)) return; delete files[f]; if (cur === f) { cur = 'design.v'; ed.value = files[cur]; } renderFileTabs(); };
      b.append(x);
    }
    box.append(b);
  }
  const add = document.createElement('button'); add.role = 'tab'; add.textContent = '+'; add.title = 'Add a file (.v .sv .vh .hex .mem .txt)';
  add.onclick = () => {
    const n = prompt('File name (for example rom.hex or alu.v):'); if (!n) return;
    if (!EXTRA_OK.test(n) || CORE.includes(n)) { alert('Use letters, digits . _ - and an extension of .v .sv .vh .hex .mem or .txt'); return; }
    if (!(n in files) && Object.keys(files).length - CORE.length >= 8) { alert('At most 8 extra files'); return; }
    if (!(n in files)) files[n] = ''; selectFile(n);
  };
  box.append(add);
}
function selectFile(f) { files[cur] = ed.value; cur = f; ed.value = files[f]; renderFileTabs(); }
ed.addEventListener('input', () => files[cur] = ed.value);
ed.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });
function jumpTo(file, line) {
  if (!(file in files)) return; selectFile(file);
  const lines = ed.value.split('\n'); const start = lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
  ed.focus(); ed.setSelectionRange(start, start + (lines[line - 1] || '').length);
  ed.scrollTop = Math.max(0, (line - 4) * 19.5);
}
function fillPackages() { $('package').innerHTML = PACKAGES[$('device').value].map(p => `<option>${p}</option>`).join(''); }
$('device').innerHTML = Object.keys(PACKAGES).map(d => `<option>${d}</option>`).join('');
$('device').onchange = fillPackages;

// Examples live on the server in examples/<id>/ with an index.json describing settings and files.
let EX = [];
async function loadExample(id) {
  const ex = EX.find(e => e.id === id); if (!ex) return;
  const got = {};
  for (const f of ex.files) { const r = await fetch(`examples/${ex.id}/${f}`); if (!r.ok) throw new Error(`cannot load ${ex.id}/${f}`); got[f] = await r.text(); }
  files = Object.fromEntries([...CORE.map(f => [f, got[f] ?? '']), ...Object.entries(got).filter(([f]) => !CORE.includes(f))]);
  cur = 'design.v'; ed.value = files[cur];
  $('device').value = ex.device; fillPackages(); $('package').value = ex.package; $('freq').value = ex.freq; $('top').value = ex.top;
  $('stSynth').checked = ex.steps.includes('pnr') || ex.steps.includes('synth'); $('stSim').checked = ex.steps.includes('sim');
  renderFileTabs();
}
async function initExamples() {
  try {
    EX = await (await fetch('examples/index.json')).json();
    $('example').replaceChildren(...EX.map(e => Object.assign(document.createElement('option'), { value: e.id, textContent: e.name })));
    await loadExample(EX[0].id);
  } catch (e) { logLine('ERROR: could not load examples: ' + e.message); }
}
$('example').onchange = () => loadExample($('example').value).catch(e => logLine('ERROR: ' + e.message));

// ------------------------------------------------------------------ result tabs
const TABS = [['log', 'Log'], ['report', 'Report'], ['layout', 'Layout'], ['wave', 'Waveform']];
let tab = 'log';
function showTab(t) {
  tab = t;
  for (const [k] of TABS) $('p-' + k).classList.toggle('on', k === t);
  renderResTabs(); requestAnimationFrame(() => { layView.resize(); waveView.resize(); });
}
let errCount = 0;
function renderResTabs() {
  $('restabs').innerHTML = '';
  for (const [k, label] of TABS) {
    const b = document.createElement('button'); b.role = 'tab'; b.textContent = label; b.setAttribute('aria-selected', k === tab);
    if (k === 'log' && errCount) { const i = document.createElement('i'); i.textContent = errCount; i.title = 'errors'; b.append(i); }
    b.onclick = () => showTab(k); $('restabs').append(b);
  }
}

// ------------------------------------------------------------------ log
const logEl = $('log');
function logLine(text, cls = '') {
  const d = document.createElement('div'); d.textContent = text;
  if (!cls) cls = /error/i.test(text) ? 'er' : /warning/i.test(text) ? 'wa' : '';
  if (cls === 'er' && !text.startsWith('ERROR: ')) { /* keep count of real errors only */ }
  if (cls === 'er') { errCount++; const loc = errorLocation(text); if (loc) { d.classList.add('go'); d.title = 'Jump to source'; d.onclick = () => jumpTo(loc.file, loc.line); } }
  d.className += ' ' + cls; d.dataset.k = cls || 'n'; if ($('errsOnly').checked && !cls) d.hidden = true;
  logEl.append(d); if (logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 80) logEl.scrollTop = logEl.scrollHeight;
}
$('errsOnly').onchange = () => { for (const d of logEl.children) d.hidden = $('errsOnly').checked && d.dataset.k === 'n'; };

// ------------------------------------------------------------------ canvas view with pan/zoom
class View {
  constructor(canvas, draw) {
    this.c = canvas; this.draw = draw; this.k = 1; this.tx = 0; this.ty = 0; this.ctx = canvas.getContext('2d'); this.dpr = 1;
    new ResizeObserver(() => this.resize()).observe(canvas);
    let drag = null;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', () => drag = null);
    canvas.addEventListener('pointermove', e => {
      if (drag) { this.tx += e.clientX - drag.x; this.ty += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; this.redraw(); }
      this.onhover?.(e);
    });
    canvas.addEventListener('pointerleave', () => this.onhover?.(null));
    this.ready = true;
  }
  resize() { const r = this.c.getBoundingClientRect(); this.dpr = devicePixelRatio || 1; const w = Math.round(r.width * this.dpr), h = Math.round(r.height * this.dpr); if (!w || !h) return; if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; } this.redraw(); }
  get w() { return this.c.width / this.dpr; } get h() { return this.c.height / this.dpr; }
  redraw() { if (!this.c.width) return; this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.ctx.clearRect(0, 0, this.w, this.h); this.draw(this.ctx, this); }
  local(e) { const r = this.c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
}

// ------------------------------------------------------------------ layout viewer
let cellIdx = new Map(), bounds = { maxX: 0, maxY: 0 };
const sx = (v, x) => x * v.k + v.tx, sy = (v, y) => (bounds.maxY - y) * v.k + v.ty;
const typeColor = t => t === 'ICESTORM_LC' ? css('--trace') : t === 'SB_IO' ? css('--ok') : css('--warn');
const layView = new View($('cv-layout'), (g, v) => {
  if (!layout) { g.fillStyle = css('--muted'); g.fillText('Run the flow to see placement and routing.', 16, 24); return; }
  const k = v.k, ink = css('--ink'), line = css('--line');
  if (k > 7) { g.strokeStyle = line; g.lineWidth = 1; g.beginPath(); for (let x = 0; x <= bounds.maxX + 1; x++) { g.moveTo(sx(v, x), sy(v, -1)); g.lineTo(sx(v, x), sy(v, bounds.maxY)); } for (let y = 0; y <= bounds.maxY + 1; y++) { g.moveTo(sx(v, 0), sy(v, y - 1)); g.lineTo(sx(v, bounds.maxX + 1), sy(v, y - 1)); } g.stroke(); }
  const q = $('netq').value.trim().toLowerCase();
  const drawNet = (n, style, w) => { g.strokeStyle = style; g.lineWidth = w; g.beginPath(); for (const e of n.edges) { g.moveTo(sx(v, e[0] + .5), sy(v, e[1] - .5)); g.lineTo(sx(v, e[2] + .5), sy(v, e[3] - .5)); } g.stroke(); };
  if ($('showNets').checked) {
    g.globalAlpha = netSel ? .12 : .35; for (const n of layout.nets) if (!rep?.criticalNets.has(n.name)) drawNet(n, css('--trace'), 1); g.globalAlpha = 1;
    for (const n of layout.nets) if (rep?.criticalNets.has(n.name)) drawNet(n, css('--hot'), 2);
    if (netSel) drawNet(netSel, ink, 3);
  }
  const s = Math.max(1.5, k * .13);
  for (const c of layout.cells) {
    g.fillStyle = typeColor(c.type);
    const m = /^lc(\d)$/.exec(c.bel), io = /^io(\d)$/.exec(c.bel);
    if (m) { const n = +m[1]; g.fillRect(sx(v, c.x + .12 + (n % 2) * .42), sy(v, c.y - .1 - (n >> 1) * .22) - 0, s * 2.4, s * 1.5); }
    else if (io) g.fillRect(sx(v, c.x + .15 + +io[1] * .4), sy(v, c.y - .3), s * 2.4, s * 2.4);
    else g.fillRect(sx(v, c.x + .2), sy(v, c.y - .2), k * .6, k * .6);
  }
});
layView.fit = () => { if (!layout) return; const p = 1.5; layView.k = Math.max(2, Math.min(layView.w / (bounds.maxX + p), layView.h / (bounds.maxY + p))); layView.tx = (layView.w - (bounds.maxX + 1) * layView.k) / 2; layView.ty = (layView.h - (bounds.maxY + 1) * layView.k) / 2; layView.redraw(); };
$('cv-layout').addEventListener('wheel', e => { e.preventDefault(); const [mx, my] = layView.local(e), f = e.deltaY < 0 ? 1.18 : 1 / 1.18; layView.tx = mx - (mx - layView.tx) * f; layView.ty = my - (my - layView.ty) * f; layView.k *= f; layView.redraw(); }, { passive: false });
layView.onhover = e => {
  const tip = $('tip'); if (!e || !layout) { tip.style.display = 'none'; return; }
  const [mx, my] = layView.local(e), tx = Math.floor((mx - layView.tx) / layView.k), ty = bounds.maxY - Math.floor((my - layView.ty) / layView.k);
  const cs = cellIdx.get(tx + ',' + ty);
  if (!cs) { tip.style.display = 'none'; return; }
  tip.textContent = `tile X${tx} Y${ty}\n` + cs.slice(0, 12).map(c => `${c.bel}  ${c.name}`).join('\n') + (cs.length > 12 ? `\n… +${cs.length - 12}` : '');
  tip.style.display = 'block'; tip.style.left = Math.min(mx + 14, layView.w - 200) + 'px'; tip.style.top = (my + 14) + 'px';
};
function renderNetList() {
  const q = $('netq').value.trim().toLowerCase(), box = $('nets'); box.innerHTML = '';
  if (!layout) return;
  const list = layout.nets.filter(n => n.edges.length && n.name.toLowerCase().includes(q)).sort((a, b) => b.edges.length - a.edges.length).slice(0, 400);
  for (const n of list) {
    const d = document.createElement('div'); d.textContent = n.name; d.title = `${n.name} (${n.edges.length} segments)`; d.role = 'option';
    if (rep?.criticalNets.has(n.name)) d.className = 'crit'; if (netSel === n) d.classList.add('sel');
    d.onclick = () => { netSel = netSel === n ? null : n; renderNetList(); layView.redraw(); }; box.append(d);
  }
}
$('netq').oninput = () => { renderNetList(); layView.redraw(); }; $('showNets').onchange = () => layView.redraw(); $('fit1').onclick = () => layView.fit();
function setLayout(l) {
  layout = l; netSel = null; cellIdx = new Map(); for (const c of l.cells) { const k = c.x + ',' + c.y; (cellIdx.get(k) || cellIdx.set(k, []).get(k)).push(c); }
  bounds = layoutBounds(l); const lc = l.cells.filter(c => c.type === 'ICESTORM_LC').length;
  $('layinfo').textContent = `${l.cells.length} cells (${lc} LC), ${l.nets.filter(n => n.edges.length).length} routed nets; wheel to zoom, drag to pan; pink = critical path`;
  renderNetList(); requestAnimationFrame(() => { layView.resize(); layView.fit(); });
}

// ------------------------------------------------------------------ waveform viewer
const NAMEW = 190, ROWH = 26, RULER = 24;
let wv = { t0: 0, pxPer: 1, scroll: 0, cursor: null, sigs: [] };
const waveView = new View($('cv-wave'), (g, v) => {
  if (!wave) { g.fillStyle = css('--muted'); g.fillText('No waveform. Provide a testbench that writes wave.vcd.', 16, 24); return; }
  const ink = css('--ink'), mut = css('--muted'), line = css('--line'), trace = css('--trace'), bad = css('--bad'), W = v.w, H = v.h;
  g.font = '12px ' + css('--mono'); g.textBaseline = 'middle';
  const X = t => NAMEW + (t - wv.t0) * wv.pxPer, T = x => wv.t0 + (x - NAMEW) / wv.pxPer;
  const raw = [1, 2, 5]; let step = 1; outer: for (let p = 1; p < 1e15; p *= 10) for (const r of raw) if (r * p * wv.pxPer >= 80) { step = r * p; break outer; }
  g.save(); g.beginPath(); g.rect(NAMEW, 0, W - NAMEW, H); g.clip();
  g.strokeStyle = line; g.fillStyle = mut; g.textAlign = 'left';
  for (let t = Math.ceil(T(NAMEW) / step) * step; X(t) < W; t += step) { g.beginPath(); g.moveTo(X(t), RULER - 4); g.lineTo(X(t), H); g.stroke(); g.fillText(t + wave.timescale.replace(/^1/, ''), X(t) + 3, 11); }
  g.restore();
  g.save(); g.beginPath(); g.rect(0, RULER, W, H - RULER); g.clip();
  wv.sigs.forEach((s, i) => {
    const y = RULER + i * ROWH - wv.scroll + 3, h = ROWH - 8; if (y + h < RULER || y > H) return;
    g.fillStyle = ink; g.textAlign = 'left'; g.save(); g.beginPath(); g.rect(0, y - 3, NAMEW - 70, ROWH); g.clip(); g.fillText(s.name, 8, y + h / 2); g.restore();
    if (wv.cursor != null) { g.fillStyle = mut; g.textAlign = 'right'; const val = valueAt(s, wv.cursor); g.fillText(s.width > 1 ? busToHex(val) : val, NAMEW - 8, y + h / 2); }
    g.save(); g.beginPath(); g.rect(NAMEW, y - 3, W - NAMEW, ROWH); g.clip();
    const c = s.changes, end = wave.end;
    let lo = 0; { let a = 0, b = c.length - 1, r = 0; while (a <= b) { const m = (a + b) >> 1; if (c[m][0] <= T(NAMEW)) { r = m; a = m + 1; } else b = m - 1; } lo = r; }
    g.lineWidth = 1.5; let prevY = null;
    for (let j = lo; j < c.length && X(c[j][0]) < W; j++) {
      const x0 = Math.max(NAMEW, X(c[j][0])), x1 = Math.min(W, X(j + 1 < c.length ? c[j + 1][0] : end)), val = c[j][1];
      if (s.width === 1) {
        const lv = val === '1' ? y : val === '0' ? y + h : y + h / 2, bit = val === 'x' ? bad : val === 'z' ? mut : trace;
        g.strokeStyle = bit; g.beginPath(); if (prevY != null && X(c[j][0]) >= NAMEW) { g.moveTo(x0, prevY); g.lineTo(x0, lv); } else g.moveTo(x0, lv); g.lineTo(x1, lv); g.stroke(); prevY = lv;
      } else {
        g.strokeStyle = /[xz]/.test(val) ? bad : trace; g.beginPath(); g.moveTo(x0 + 2, y); g.lineTo(x1 - 2, y); g.lineTo(x1, y + h / 2); g.lineTo(x1 - 2, y + h); g.lineTo(x0 + 2, y + h); g.lineTo(x0, y + h / 2); g.closePath(); g.stroke();
        if (x1 - x0 > 30) { g.fillStyle = ink; g.textAlign = 'center'; g.fillText(busToHex(val), (x0 + x1) / 2, y + h / 2); }
      }
    }
    g.restore();
  });
  g.restore();
  if (wv.cursor != null && X(wv.cursor) >= NAMEW) { g.strokeStyle = css('--hot'); g.lineWidth = 1; g.beginPath(); g.moveTo(X(wv.cursor), 0); g.lineTo(X(wv.cursor), H); g.stroke(); g.fillStyle = css('--hot'); g.textAlign = 'left'; g.fillText(Math.round(wv.cursor) + '', X(wv.cursor) + 4, H - 8); }
  g.strokeStyle = line; g.beginPath(); g.moveTo(NAMEW, 0); g.lineTo(NAMEW, H); g.moveTo(0, RULER); g.lineTo(W, RULER); g.stroke();
});
waveView.fit = () => { if (!wave) return; wv.t0 = 0; wv.pxPer = Math.max(1e-9, (waveView.w - NAMEW - 16) / Math.max(1, wave.end)); wv.scroll = 0; waveView.redraw(); };
function filterSigs() { const q = $('sigq').value.trim().toLowerCase(); wv.sigs = wave ? wave.signals.filter(s => s.name.toLowerCase().includes(q)).slice(0, 300) : []; waveView.redraw(); }
$('sigq').oninput = filterSigs; $('fit2').onclick = () => waveView.fit();
$('cv-wave').addEventListener('wheel', e => {
  e.preventDefault(); if (!wave) return;
  if (e.ctrlKey || e.metaKey) { const [mx] = waveView.local(e), f = e.deltaY < 0 ? 1.25 : .8, tAt = wv.t0 + (mx - NAMEW) / wv.pxPer; wv.pxPer *= f; wv.t0 = tAt - (mx - NAMEW) / wv.pxPer; }
  else wv.scroll = Math.max(0, Math.min(Math.max(0, wv.sigs.length * ROWH - waveView.h + RULER), wv.scroll + e.deltaY));
  waveView.redraw();
}, { passive: false });
{ let dr = null; const c = $('cv-wave');
  c.addEventListener('pointerdown', e => { dr = e.clientX; });
  window.addEventListener('pointerup', () => dr = null);
  waveView.onhover = e => { if (!e || !wave) return; const [mx] = waveView.local(e); if (dr != null && e.buttons) { wv.t0 -= (e.clientX - dr) / wv.pxPer; dr = e.clientX; } wv.cursor = mx > NAMEW ? Math.max(0, wv.t0 + (mx - NAMEW) / wv.pxPer) : null; waveView.redraw(); };
  // the generic View drag moves tx/ty which the wave view ignores; time panning is handled above
}
function setWave(text) {
  wave = parseVCD(text); wv = { t0: 0, pxPer: 1, scroll: 0, cursor: null, sigs: [] };
  $('waveinfo').textContent = `${wave.signals.length} signals, ${wave.end} ${wave.timescale.replace(/^1/, '')}; wheel: scroll, Ctrl+wheel: zoom, drag: pan`;
  filterSigs(); requestAnimationFrame(() => { waveView.resize(); waveView.fit(); });
}

// ------------------------------------------------------------------ report
function renderReport(r) {
  const el = $('report'); el.innerHTML = '';
  const h = (t) => { const e = document.createElement('h3'); e.textContent = t; el.append(e); };
  const tbl = (head, rows) => { const t = document.createElement('table'); t.innerHTML = `<tr>${head.map(x => `<th>${x}</th>`).join('')}</tr>`; for (const row of rows) { const tr = document.createElement('tr'); for (const c of row) { const td = document.createElement('td'); if (c instanceof Node) td.append(c); else td.textContent = c; tr.append(td); } t.append(tr); } el.append(t); };
  h('Timing');
  if (!r.fmax.length) el.append(Object.assign(document.createElement('div'), { className: 'empty', textContent: 'No clocked paths found.' }));
  else tbl(['Clock', 'Achieved', 'Target', ''], r.fmax.map(f => [f.clock, f.achieved.toFixed(2) + ' MHz', f.constraint + ' MHz', Object.assign(document.createElement('span'), { className: f.pass ? 'pass' : 'fail', textContent: f.pass ? 'PASS' : 'FAIL' })]));
  h('Utilisation');
  tbl(['Resource', 'Used', 'Available', ''], r.util.map(u => { const m = document.createElement('div'); m.className = 'meter'; m.innerHTML = `<b style="width:${Math.min(100, 100 * u.used / u.available)}%"></b>`; return [u.name, u.used, u.available, m]; }));
  if (r.path.length) { h('Critical path'); tbl(['Type', 'Delay', 'From', 'To'], r.path.map(p => [p.type, (p.delay ?? 0).toFixed(2) + ' ns', p.from, p.to])); }
}

// ------------------------------------------------------------------ run
let running = false;
async function run() {
  if (running) return; files[cur] = ed.value;
  const steps = [...($('stSynth').checked ? ['synth', 'pnr'] : []), ...($('stSim').checked ? ['sim'] : [])];
  if (!steps.length) { $('status').className = 'bad'; $('status').textContent = 'enable synthesis or simulation'; return; }
  running = true;
  layout = null; rep = null; wave = null; netSel = null;   // never show results of an earlier run next to this one
  $('report').innerHTML = '<div class="empty">Run the flow to see timing and utilisation.</div>'; $('layinfo').textContent = 'No layout yet'; renderNetList(); filterSigs(); layView.redraw();
  const btn = $('run'), st = $('status'); btn.disabled = true; st.className = ''; st.textContent = 'starting…';
  logEl.textContent = ''; errCount = 0; renderResTabs(); showTab('log'); $('dl').hidden = true;
  const t0 = performance.now(), tick = setInterval(() => st.textContent = `${stage || 'running'} · ${((performance.now() - t0) / 1000).toFixed(1)}s`, 200); let stage = '';
  const extras = Object.fromEntries(Object.entries(files).filter(([f]) => !CORE.includes(f)));
  const body = { design: files['design.v'], tb: files['tb.v'], pcf: files['design.pcf'], files: extras, steps, top: $('top').value, device: $('device').value, package: $('package').value, freq: +$('freq').value };
  let result = null, error = null;
  try {
    const r = await fetch('/api/flow', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`server returned ${r.status}`);
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const ev = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
        if (ev.type === 'log') logLine(ev.text);
        else if (ev.type === 'stage') { stage = ev.stage; logLine(`== ${ev.stage} ==`, 'st'); }
        else if (ev.type === 'queued') logLine('Server busy, waiting in queue…', 'st');
        else if (ev.type === 'result') { result = ev; if (ev.error) error = ev.error; }
      }
    }
  } catch (e) { error = e.message; }
  clearInterval(tick); running = false; btn.disabled = false;
  if (error) { logLine('ERROR: ' + error); }
  const total = ((performance.now() - t0) / 1000).toFixed(1);
  if (!result || !result.ok) { st.className = 'bad'; st.textContent = `failed${result?.failed ? ' at ' + result.failed : ''} · ${total}s`; renderResTabs(); return; }
  const R = result.result; st.className = 'ok'; st.textContent = `done · ${total}s`;
  if (R.report) { rep = summarizeReport(R.report); renderReport(rep); }
  if (R.layout) setLayout(R.layout);
  if (R.vcd) setWave(R.vcd); else { wave = null; filterSigs(); }
  if (R.bin) { const a = $('dl'); if (a.href) URL.revokeObjectURL(a.href); a.href = URL.createObjectURL(new Blob([Uint8Array.from(atob(R.bin), c => c.charCodeAt(0))])); a.download = `${R.top}.bin`; a.hidden = false; }
  renderResTabs(); showTab(R.layout ? 'layout' : R.vcd ? 'wave' : 'log');
}
$('run').onclick = run;

renderFileTabs(); renderResTabs(); showTab('log');
initExamples();
window.__app = { run, get files() { return files; } }; // handy for debugging and tests
