/**************
 * hackserve 前端（v0.9，HDL 批次模擬）
 * 純 HTML/JS，無 build step。伺服器由 _eda/hackserve 提供。
 **************/

let ws = null;
const waiters = new Map();
let seq = 0;

const el = {
  mode: document.getElementById('mode'),
  chapter: document.getElementById('chapter'),
  case: document.getElementById('case'),
  run: document.getElementById('run'),
  status: document.getElementById('status'),
  hdl: document.getElementById('hdl'),
  tst: document.getElementById('tst'),
  cmp: document.getElementById('cmp'),
  banner: document.getElementById('banner'),
  outtab: document.getElementById('outtab'),
  errlog: document.getElementById('errlog'),
};

const state = { corpus: null, chapterCases: [], busy: false };

// ---------- WebSocket ----------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(proto + location.host + '/ws');
  ws.onopen = () => { setStatus('已連線', ''); onOpen(); };
  ws.onclose = () => setStatus('連線中斷，重連中…', 'error');
  ws.onerror = () => setStatus('WS 錯誤', 'error');
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    const w = waiters.get(m.id);
    if (w) { waiters.delete(m.id); w.resolve(m); }
    else if (m.type === 'error') setStatus(m.message || '伺服器錯誤', 'error');
  };
}

function req(o) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    o.id = id;
    waiters.set(id, { resolve });
    if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('未連線')); return; }
    ws.send(JSON.stringify(o));
    setTimeout(() => { if (waiters.delete(id)) reject(new Error('回應逾時：' + o.type)); }, 20000);
  });
}

// ---------- 語料清單 ----------
const DEFAULT_CUSTOM = {
  hdl: 'CHIP And9 {\n  IN a, b;\n  OUT out;\n  PARTS:\n    Nand(a=a, b=b, out=n);\n    Nand(a=n, b=n, out=out);\n}',
  tst: 'load And9.hdl,\noutput-list a%B1.1.1 b%B1.1.1 out%B1.1.1;\nset a 0, set b 0, eval, output;\nset a 1, set b 0, eval, output;\nset a 1, set b 1, eval, output;',
  cmp: '| a | b |out|\n| 0 | 0 | 0 |\n| 1 | 0 | 0 |\n| 1 | 1 | 1 |',
};

async function onOpen() {
  try {
    const m = await req({ type: 'hdl-list' });
    state.corpus = m.chapters || [];
    fillChapterSelect();
    setStatus(`已連線（${state.corpus.length} 章節）`, 'ok');
  } catch (e) { setStatus(String(e.message || e), 'error'); }
}

function fillChapterSelect() {
  el.chapter.innerHTML = '';
  for (const ch of state.corpus) {
    const o = document.createElement('option');
    o.value = ch.name;
    o.textContent = ch.name;
    el.chapter.appendChild(o);
  }
  fillCaseSelect();
}

function fillCaseSelect() {
  const ch = state.corpus.find((c) => c.name === el.chapter.value) || { cases: [] };
  state.chapterCases = ch.cases || [];
  el.case.innerHTML = '';
  for (const cs of state.chapterCases) {
    const o = document.createElement('option');
    o.value = cs.case;
    o.textContent = `${cs.case}${cs.top !== cs.case ? `（top ${cs.top}）` : ''}${cs.hasCompare ? '' : ' ★無cmp'}`;
    el.case.appendChild(o);
  }
  loadSource();
}

async function loadSource() {
  const ch = el.chapter.value;
  const cs = el.case.value;
  if (!ch || !cs) return;
  setStatus('讀取晶片來源…', '');
  try {
    const m = await req({ type: 'hdl-source', chapter: ch, case: cs });
    if (m.type === 'error') { setStatus(m.message, 'error'); return; }
    setReadonly(true);
    el.hdl.value = m.hdl;
    el.tst.value = m.tst;
    el.cmp.value = m.cmp;
    setStatus(`已載入 ${ch}/${cs}（top ${m.top}）`, 'ok');
    clearResult();
  } catch (e) { setStatus(String(e.message || e), 'error'); }
}

// ---------- 模式切換 ----------
function applyMode() {
  const custom = el.mode.value === 'custom';
  el.chapter.disabled = custom;
  el.case.disabled = custom;
  setReadonly(custom ? false : true);
  if (custom) {
    if (!el.hdl.value) {
      el.hdl.value = DEFAULT_CUSTOM.hdl;
      el.tst.value = DEFAULT_CUSTOM.tst;
      el.cmp.value = DEFAULT_CUSTOM.cmp;
    }
    clearResult();
  } else if (state.corpus) {
    fillCaseSelect();
  }
}

function setReadonly(ro) {
  for (const k of ['hdl', 'tst', 'cmp']) el[k].readOnly = ro;
}

// ---------- 執行 ----------
async function run() {
  if (state.busy) return;
  if (!ws) return;
  const custom = el.mode.value === 'custom';
  const o = custom
    ? { type: 'hdl-run', hdl: el.hdl.value, tst: el.tst.value,
        cmp: el.cmp.value.trim() ? el.cmp.value : undefined }
    : { type: 'hdl-run', chapter: el.chapter.value, case: el.case.value };
  state.busy = true;
  updateButtons();
  clearResult();
  setStatus('編譯並執行中（codegen＋cargo，數秒）…', '');
  try {
    const m = await req(o);
    if (!m.ok) {
      setStatus('執行失敗', 'error');
      el.errlog.textContent = m.error || '未知錯誤';
      return;
    }
    setStatus(m.pass ? 'PASS ✓ 與 .cmp 比對一致' : 'FAIL ✗ 與 .cmp 不符', m.pass ? 'ok' : 'error');
    showBanner(m.pass);
    renderOut(m.out || '');
    el.errlog.textContent = m.error || (m.pass ? '' : '見上表與 .cmp 不符處');
  } catch (e) {
    setStatus(String(e.message || e), 'error');
    el.errlog.textContent = String(e.message || e);
  } finally {
    state.busy = false;
    updateButtons();
  }
}

function showBanner(pass) {
  el.banner.classList.remove('hidden');
  el.banner.className = pass ? 'pass' : 'fail';
  el.banner.textContent = pass ? '✔ PASS 與 .cmp 逐位元一致' : '✘ FAIL 與 .cmp 不符';
}

function renderOut(text) {
  const t = el.outtab;
  t.innerHTML = '';
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  lines.forEach((line, i) => {
    const tr = document.createElement('tr');
    const cells = line.split('|').slice(1, -1);
    for (const c of cells) {
      const cell = document.createElement(i === 0 ? 'th' : 'td');
      cell.textContent = c;
      tr.appendChild(cell);
    }
    t.appendChild(tr);
  });
}

function clearResult() {
  el.banner.classList.add('hidden');
  el.outtab.innerHTML = '';
  el.errlog.textContent = '';
}

// ---------- 助手 ----------
function setStatus(msg, cls) {
  el.status.textContent = msg;
  el.status.className = cls || '';
}
function updateButtons() {
  el.run.disabled = state.busy;
  el.run.textContent = state.busy ? '執行中…' : '執行';
}

// ---------- 事件綁定 ----------
el.run.onclick = run;
el.mode.onchange = applyMode;
el.chapter.onchange = fillCaseSelect;
el.case.onchange = loadSource;

connect();