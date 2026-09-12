/**************
 * hackserve 前端（v1.0，Jack 全鏈路編譯器）
 * 純 HTML/JS，無 build step。伺服器由 _eda/hackserve 提供。
 * 協定：jack-list / jack-source / jack-run（5 階段：jack→vm→asm→hack→sim）。
 **************/

let ws = null;
const waiters = new Map();
let seq = 0;

const el = {
  mode: document.getElementById('mode'),
  program: document.getElementById('program'),
  withOS: document.getElementById('withOS'),
  run: document.getElementById('run'),
  status: document.getElementById('status'),
  filetabs: document.getElementById('filetabs'),
  fname: document.getElementById('fname'),
  code: document.getElementById('code'),
  stagetabs: document.getElementById('stagetabs'),
  arttabs: document.getElementById('arttabs'),
  artifact: document.getElementById('artifact'),
  errlog: document.getElementById('errlog'),
};

const state = {
  programs: [],      // 內建程式清單
  files: [],         // [{name, content}]（內建載入 or 自訂）
  curFile: 0,        // 目前編輯的檔 index
  result: null,      // 最近一次 jack-result
  curStage: 0,       // 目前檢視的階段 index；SIM 用 -1
  curArt: 0,         // 目前檢視的產物 index
  busy: false,
};

const DEFAULT_CUSTOM = {
  name: 'Main.jack',
  content: 'class Main {\n  function void main() {\n    var int i;\n    let i = 1;\n    while (i < 4) {\n      let i = i + 1;\n    }\n    return;\n  }\n}\n',
};

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
  ws.onclose = () => { if (!state.busy) setStatus('連線中斷，重連中…', 'error'); };
}

function req(o) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    o.id = id;
    waiters.set(id, { resolve });
    if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('未連線')); return; }
    ws.send(JSON.stringify(o));
    setTimeout(() => { if (waiters.delete(id)) reject(new Error('回應逾時：' + o.type)); }, 120000);
  });
}

// ---------- 程式清單 ----------
async function onOpen() {
  try {
    const m = await req({ type: 'jack-list' });
    state.programs = m.programs || [];
    fillProgram();
    setStatus(`已連線（${state.programs.length} 支程式）`, 'ok');
  } catch (e) { setStatus(String(e.message || e), 'error'); }
}

function fillProgram() {
  el.program.innerHTML = '';
  for (const p of state.programs) {
    const o = document.createElement('option');
    o.value = p.name;
    o.textContent = `${p.name}${p.needsOS ? '（含 OS）' : p.noOS ? '（無 OS）' : ''}${p.isVirtual ? ' [e2e]' : ''}`;
    el.program.appendChild(o);
  }
  loadSource();
}

async function loadSource() {
  const name = el.program.value;
  if (!name) return;
  setStatus('讀取 .jack 原始碼…', '');
  try {
    const m = await req({ type: 'jack-source', program: name });
    if (m.type === 'error') { setStatus(m.message, 'error'); return; }
    state.files = m.files.map((f) => ({ name: f.name, content: f.content }));
    setReadonly(true);
    renderFileTabs();
    selectFile(state.files[0] ? state.files[0].name : '');
    clearResult();
    setStatus(`已載入 ${name}（${state.files.length} 檔）`, 'ok');
  } catch (e) { setStatus(String(e.message || e), 'error'); }
}

// ---------- 檔案 tabs（來源編輯器） ----------
function renderFileTabs() {
  el.filetabs.innerHTML = '';
  for (let i = 0; i < state.files.length; i++) {
    const b = mkTab(state.files[i].name, i === state.curFile);
    b.onclick = () => selectFile(state.files[i].name);
    el.filetabs.appendChild(b);
  }
  if (isCustom()) {
    const add = document.createElement('button');
    add.className = 'tab';
    add.textContent = '＋';
    add.title = '新增一個 .jack 檔';
    add.onclick = () => {
      state.files.push({ name: `File${state.files.length}.jack`, content: '' });
      renderFileTabs();
      selectFile(state.files[state.files.length - 1].name);
    };
    el.filetabs.appendChild(add);
  }
}

function mkTab(label, sel) {
  const b = document.createElement('button');
  b.className = 'tab' + (sel ? ' sel' : '');
  b.textContent = label;
  return b;
}

function selectFile(name) {
  const i = Math.max(0, state.files.findIndex((f) => f.name === name));
  state.curFile = i;
  commitCurrent();
  el.fname.value = state.files[i].name;
  el.code.value = state.files[i].content;
  updateTabSel(el.filetabs, i, 0);
  el.fname.readOnly = !isCustom();
  el.fname.style.opacity = isCustom() ? 1 : 0.5;
}

function commitCurrent() {
  if (state.files.length === 0) return;
  const f = state.files[state.curFile];
  f.name = (el.fname.value.trim() || f.name);
  f.content = el.code.value;
}

// 把目前編輯寫回 files（執行前呼叫）。
function syncAll() {
  if (state.files.length === 0) return;
  const f = state.files[state.curFile];
  f.name = (el.fname.value.trim() || f.name);
  f.content = el.code.value;
}

// ---------- 模式切換 ----------
function isCustom() { return el.mode.value === 'custom'; }

function applyMode() {
  syncAll();
  const custom = isCustom();
  el.program.disabled = custom;
  if (custom) {
    if (state.files.every((f) => !f.content) && state.files.length === 1 && state.files[0].name === 'Main.jack') {
      state.files = [{ name: DEFAULT_CUSTOM.name, content: DEFAULT_CUSTOM.content }];
    }
    setReadonly(false);
    renderFileTabs();
    selectFile(state.files[0].name);
    clearResult();
  } else {
    setReadonly(true);
    renderFileTabs();
    selectFile(state.files[0].name);
    if (state.programs.length) { loadSource(); }
  }
}

function setReadonly(ro) {
  el.code.readOnly = ro;
}

// ---------- 執行 ----------
async function run() {
  if (state.busy) return;
  if (!ws) return;
  syncAll();
  const custom = isCustom();
  const o = custom
    ? { type: 'jack-run', files: state.files, withOS: el.withOS.checked }
    : { type: 'jack-run', program: el.program.value };
  state.busy = true;
  updateButtons();
  clearResult();
  setStatus('編譯執行中（jack2vm→vm2asm→hackasm→hackemu）…', '');
  try {
    const m = await req(o);
    state.result = m;
    if (!m.ok) {
      setStatus('執行失敗', 'error');
      el.errlog.textContent = m.error || '未知錯誤';
    } else {
      setStatus('完成', 'ok');
      el.errlog.textContent = '';
    }
    renderStages();
  } catch (e) {
    setStatus(String(e.message || e), 'error');
    el.errlog.textContent = String(e.message || e);
  } finally {
    state.busy = false;
    updateButtons();
  }
}

// ---------- 階段/產物檢視 ----------
function renderStages() {
  const m = state.result;
  el.stagetabs.innerHTML = '';
  const names = m.stages.map((s) => s.name);
  if (m.sim) names.push('sim');
  names.forEach((n, i) => {
    const s = m.stages[i];
    const bad = s ? s.exit !== 0 : false;
    const b = mkTab(`${n}${bad ? ' ✗' : ''}`, i === state.curStage);
    if (bad) b.classList.add('bad');
    b.title = s ? `${s.cmd}\n\nexit=${s.exit}` : 'hackemu --headless（SIM 摘要＋軌跡）';
    b.onclick = () => selectStage(i);
    el.stagetabs.appendChild(b);
  });
  if (m.stages.length) selectStage(Math.min(state.curStage, names.length - 1));
}

function selectStage(i) {
  if (state.curStage >= 0 && state.curStage < el.stagetabs.children.length) {
    el.stagetabs.children[state.curStage].classList.remove('sel');
  }
  state.curStage = i;
  el.stagetabs.children[i].classList.add('sel');
  updateTabSel(el.stagetabs, i, 0);
  const name = el.stagetabs.children[i].textContent.replace(' ✗', '');
  if (name === 'sim') {
    const m = state.result;
    renderSim();
  } else {
    const s = state.result.stages[i];
    if (s !== undefined) {
      updateTabSel(el.stagetabs, i, 0);
      state.curArt = 0;
      renderArtTabs(s.name, s.artifacts || []);
      setArtifact((s.artifacts || []).length ? s.artifacts[0].content || '' : '（無產物）');
    }
  }
}

function renderSim() {
  const m = state.result;
  if (!m.sim) return;
  el.arttabs.innerHTML = '';
  const opts = [['summary', m.sim.summary || ''], ['trace', m.sim.trace || '']];
  opts.forEach(([label], j) => {
    const b = mkTab(label, j === state.curArt);
    b.onclick = () => {
      updateTabSel(el.arttabs, j, 0);
      state.curArt = j;
      setArtifact(opts[j][1] || '');
    };
    el.arttabs.appendChild(b);
  });
  setArtifact(opts[0][1] || '');
}

function renderArtTabs(stageName, arts) {
  el.arttabs.innerHTML = '';
  arts.forEach((a, j) => {
    const label = a.name || `file${j}`;
    const b = mkTab(label, j === state.curArt);
    b.onclick = () => {
      updateTabSel(el.arttabs, j, 0);
      state.curArt = j;
      setArtifact(a.content || '');
    };
    el.arttabs.appendChild(b);
  });
}

function setArtifact(text) {
  el.artifact.value = text || '';
}

function updateTabSel(container, idx, empty) {
  for (let i = 0; i < container.children.length; i++) {
    container.children[i].classList.toggle('sel', i === idx);
  }
}

// ---------- 清空 ----------
function clearResult() {
  state.result = null;
  state.curStage = 0;
  state.curArt = 0;
  el.stagetabs.innerHTML = '';
  el.arttabs.innerHTML = '';
  el.artifact.value = '';
  el.errlog.textContent = '';
}

// ---------- 助手 ----------
function setStatus(msg, cls) {
  el.status.textContent = msg;
  el.status.className = cls || '';
}
function updateButtons() {
  el.run.disabled = state.busy;
  el.run.textContent = state.busy ? '執行中…' : '編譯＋執行';
}

// ---------- 事件綁定 ----------
el.run.onclick = run;
el.mode.onchange = applyMode;
el.program.onchange = loadSource;
el.fname.onchange = () => {
  commitCurrent();
  renderFileTabs();
};

connect();