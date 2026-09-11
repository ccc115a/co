/**************
 * hackserve 前端（v0.8，路線 B）
 * 純 HTML/JS/Canvas，無 build step。伺服器由 _eda/hackserve 提供。
 **************/

// ---------- 全域狀態 ----------
let ws = null;
const waiters = new Map();
let seq = 0;

const state = {
  running: false,
  stepsPerFrame: 100000,
  lines: [],          // asm 原始行文字
  lineMap: null,      // server 回傳：第 i 個 asm 行 → ROM word（或 null）
  wordLine: [],       // 反向：ROM word → 第一個 asm 行 index
  curLine: -1,
  screen: new Uint8Array(256 * 64), // row-major，每列 64 bytes（word 大端序）
  pc: 0,
};

// ---------- DOM ----------
const el = {
  ta: document.getElementById('asm'),
  openBtn: document.getElementById('open'),
  file: document.getElementById('file'),
  loadBtn: document.getElementById('load'),
  runBtn: document.getElementById('run'),
  stepBtn: document.getElementById('step'),
  resetBtn: document.getElementById('reset'),
  speed: document.getElementById('speed'),
  speedVal: document.getElementById('speedVal'),
  canvas: document.getElementById('screen'),
  status: document.getElementById('status'),
  regs: document.getElementById('regs'),
  chips: document.getElementById('chips'),
  listing: document.getElementById('listing'),
  ramStart: document.getElementById('ramStart'),
  ramLen: document.getElementById('ramLen'),
  ramBtn: document.getElementById('ramBtn'),
  ramBody: document.getElementById('ramBody'),
};

// ---------- WebSocket ----------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(proto + location.host + '/ws');
  ws.onopen = () => { setStatus('已連線', ''); loadDefault(); };
  ws.onclose = () => setStatus('連線中斷，重連中…', 'error');
  ws.onerror = () => setStatus('WS 錯誤', 'error');
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    const w = waiters.get(m.id);
    if (w) { waiters.delete(m.id); m.type === 'error' ? w.reject(m) : w.resolve(m); }
    else if (m.type === 'error') setStatus(m.message || '伺服器錯誤', 'error');
  };
}

function req(o) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    o.id = id;
    waiters.set(id, { resolve, reject });
    if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('未連線')); return; }
    ws.send(JSON.stringify(o));
    setTimeout(() => { if (waiters.delete(id)) reject(new Error('回應逾時')); }, 10000);
  });
}

// ---------- 組譯／載入 ----------
async function loadFromText() {
  const text = el.ta.value;
  if (!text.trim()) return;
  setStatus('組譯中…', '');
  try {
    const m = await req({ type: 'load', asm: text });
    if (m.ok) {
      el.ta.setCustomValidity('');
      state.lines = text.split('\n');
      state.lineMap = m.map || [];
      state.wordLine = [];
      state.lineMap.forEach((w, i) => { if (w !== null) state.wordLine[w] = i; });
      rebuildListing(0);
      stop();
      setStatus(`載入成功：${m.rom} 條指令 / ${m.lines} 行`, 'ok');
      await req({ type: 'simulate', steps: 1 });
      refreshAll();
    } else {
      setStatus(`組譯錯誤：${m.error || m.message}`, 'error');
    }
  } catch (e2) { setStatus(String(e2.message || e2), 'error'); }
}

function loadDefault() {
  const demo = ['// 範例：把螢幕最上方 32 列塗黑（1024 words = 32 列 × 32 words）',
    '@1024',
    'D=A',
    '@17',
    'M=D',      // R17 = 計數器
    '@SCREEN',
    'D=A',
    '@16',
    'M=D',      // R16 = 目前位址（指標，自 16384 起）
    '(LOOP)',
    '@16',
    'A=M',
    'M=-1',     // 該 word 塗黑
    '@16',
    'M=M+1',    // 指標 +1
    '@17',
    'MD=M-1',   // 計數器 -1 同時給 D
    '@LOOP',
    'D;JGT',    // >0 繼續
    '@0',
    '0;JMP',    // 完成後停住
  ];
  el.ta.value = demo.join('\n');
  loadFromText();
}

// ---------- 執行控制 ----------
function start() {
  if (state.running) return;
  if (!ws) return;
  state.running = true;
  updateButtons();
  tick();
}

function stop() { state.running = false; updateButtons(); }

async function tick() {
  let last = performance.now();
  const frameMs = 1000 / 30;
  while (state.running) {
    const now = performance.now();
    if (now - last < frameMs) await sleep(frameMs - (now - last));
    last = performance.now();
    try {
      const snap = await req({ type: 'simulate', steps: state.stepsPerFrame });
      if (!state.running) break; // 這幀途中被 stop
      applySnap(snap);
      if (snap.halted) { setStatus(`已中止（PC 超出 ROM，共 ${snap.cycles} 週期）`, 'warn'); stop(); break; }
    } catch (e) { setStatus(String(e.message || e), 'error'); stop(); break; }
  }
}

async function stepOnce() {
  stop();
  if (!ws) return;
  try { const snap = await req({ type: 'step' }); applySnap(snap); }
  catch (e) { setStatus(String(e.message || e), 'error'); }
}

async function doReset() {
  stop();
  if (!ws) return;
  try { const snap = await req({ type: 'reset' }); applySnap(snap); setStatus('已重置', 'ok'); }
  catch (e) { setStatus(String(e.message || e), 'error'); }
}

// ---------- 快照套用 ----------
function applySnap(snap) {
  state.pc = snap.pc;
  if (snap.reset) { state.screen = new Uint8Array(256 * 64); }
  for (const r of snap.rows || []) {
    const bytes = b64toBytes(r.b);
    state.screen.set(bytes, r.r * 64);
  }
  updateRegs(snap);
  draw();
  highlightPc(snap.pc);
}

let frame = 0;
function updateRegs(snap) {
  if (++frame % 4 === 0) { // 節流 DOM 更新
    el.regs.textContent = `PC=${snap.pc}  A=${snap.a}  D=${snap.d}  SP=${snap.sp}  ` +
      `週期=${snap.cycles}  ROM=${snap.lines}${snap.halted ? '  中止' : ''}`;
    const regs = snap.regs || [];
    const vals = Array.from({ length: 16 }, (_, i) =>
      `<span class="ch" data-r="${i}">R${i}=${regs[i] ?? '?'}</span>`);
    el.chips.innerHTML = vals.join('');
    const spEl = el.chips.querySelector(`[data-r="0"]`);
    if (spEl) spEl.classList.add('sp');
  }
}

// ---------- 繪圖（512×256，bit15 = 最左黑點）----------
const img = el.canvas.getContext('2d').createImageData(512, 256);
function draw() {
  const d = img.data;
  for (let y = 0; y < 256; y++) {
    const row = state.screen.subarray(y * 64, y * 64 + 64);
    for (let w = 0; w < 32; w++) {
      const word = (row[2 * w] << 8) | row[2 * w + 1];
      for (let c = 0; c < 16; c++) {
        const on = (word >> (15 - c)) & 1;
        const base = ((y * 512 + w * 16 + c)) * 4;
        d[base] = d[base + 1] = d[base + 2] = on ? 0 : 255;
        d[base + 3] = 255;
      }
    }
  }
  el.canvas.getContext('2d').putImageData(img, 0, 0);
}

// ---------- 原始碼列表 + PC 高亮 ----------
function rebuildListing(scrollTo) {
  el.listing.innerHTML = '';
  state.lines.forEach((line, i) => {
    const div = document.createElement('div');
    div.className = 'line';
    const num = document.createElement('span');
    num.className = 'lno';
    num.textContent = String(i + 1).padStart(3, ' ');
    div.appendChild(num);
    const code = document.createElement('span');
    code.className = 'code';
    code.textContent = line || ' '; // 空行保留高度
    div.appendChild(code);
    el.listing.appendChild(div);
  });
  if (scrollTo !== undefined) highlightPc(scrollTo);
}

function highlightPc(pc) {
  let line = state.wordLine[pc];
  if (line === undefined) line = -1;
  if (line === state.curLine) return;
  if (state.curLine >= 0 && el.listing.children[state.curLine]) {
    el.listing.children[state.curLine].classList.remove('pc');
  }
  if (line >= 0 && el.listing.children[line]) {
    el.listing.children[line].classList.add('pc');
    if (state.curLine === -1 || line === 0) {
      el.listing.children[line].scrollIntoView({ block: 'nearest' });
    }
  }
  state.curLine = line;
}

// ---------- 記憶體檢視（ramDump）----------
async function ramInspect() {
  const start = parseInt(el.ramStart.value, 10) || 0;
  const len = Math.min(parseInt(el.ramLen.value, 10) || 64, 512);
  try {
    const m = await req({ type: 'ramDump', start, len });
    const rows = [];
    for (let i = 0; i < m.data.length; i += 8) {
      const addr = m.start + i;
      const base = `a${addr}`;
      rows.push(`<div class="rrow">${Array.from({ length: Math.min(8, m.data.length - i) },
        (_, k) => `<span class="cell">${addr + k}:${m.data[i + k]}</span>`).join('')}</div>`);
    }
    el.ramBody.innerHTML = rows.join('');
  } catch (e) { setStatus(String(e.message || e), 'error'); }
}

// ---------- 鍵盤 → HACK code ----------
const SPECIAL = {
  backspace: 129, arrowleft: 130, arrowup: 131, arrowright: 132, arrowdown: 133,
  home: 134, end: 135, pageup: 136, pagedown: 137, insert: 138, delete: 139,
  escape: 140, f1: 141, f2: 142, f3: 143, f4: 144, f5: 145, f6: 146,
  f7: 147, f8: 148, f9: 149, f10: 150, f11: 151, f12: 152,
  tab: 9, ' ': 32, '½': 187, '=': 61,
};
function codeFor(e) {
  if (e.key.length === 1) return e.key.charCodeAt(0);
  const k = e.key.toLowerCase();
  if (SPECIAL[k]) return SPECIAL[k];
  if (k.length === 2 && k[0] === 'f') return 140 + parseInt(k[1], 10);
  if (k.startsWith('numpad')) return parseInt(k.slice(6), 10) || 0;
  return 0;
}
function keyEvt(e, down) {
  const target = document.activeElement;
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' && target.type !== 'range')) return;
  if (e.repeat) { e.preventDefault(); return; }
  const code = codeFor(e);
  if (!code) return;
  e.preventDefault();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'setKey', code, down })); // fire-and-forget（伺服器不回包）
  }
}
window.addEventListener('keydown', (e) => keyEvt(e, true));
window.addEventListener('keyup', (e) => keyEvt(e, false));
// 避免空白鍵捲頁
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') { const t = document.activeElement; if (!t || (t.tagName !== 'TEXTAREA' && t.tagName !== 'INPUT')) e.preventDefault(); }
});

// ---------- 助手 --------
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function setStatus(msg, cls) {
  el.status.textContent = '';
  el.status.textContent = msg;
  el.status.className = cls || '';
}
function updateButtons() {
  el.runBtn.textContent = state.running ? '暫停' : '執行';
  el.runBtn.classList.toggle('on', state.running);
}
function b64toBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- 事件綁定 ----------
el.runBtn.onclick = () => (state.running ? stop() : start());
el.stepBtn.onclick = stepOnce;
el.resetBtn.onclick = doReset;
el.loadBtn.onclick = loadFromText;
el.openBtn.onclick = () => el.file.click();
el.file.onchange = () => {
  const f = el.file.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { el.ta.value = r.result; loadFromText(); };
  r.readAsText(f);
};
el.speed.oninput = () => {
  const v = el.speed.value;
  state.stepsPerFrame = Math.round(10 ** (7 * v / 100));
  el.speedVal.textContent = `每幀 ${state.stepsPerFrame.toLocaleString()} 步`;
};
el.speed.oninput();
el.ramBtn.onclick = ramInspect;
el.ta.addEventListener('keydown', (e) => e.stopPropagation()); // 編輯器按鍵只給編輯器
connect();