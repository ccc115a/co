// WebEDA 前端主程式：編輯 Verilog → 解析 / 合成 / 模擬 / 佈局繞線 / 產生位元流
import { runSimulation, writeVCD } from './sim.js';
import { createWaveViewer } from './wave.js';

// ---------------- 小工具 ----------------
const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();

function toBytes(v) { return typeof v === 'string' ? enc.encode(v) : v; }
function toText(v) { return typeof v === 'string' ? v : dec.decode(v); }

function download(name, data) {
  const blob = data instanceof Uint8Array ? new Blob([data]) : new Blob([data], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------------- Worker 通訊 ----------------
const worker = new Worker('js/worker.js', { type: 'module' });
let reqId = 0;
const pending = new Map();
let fetchDone = 0, fetchTotal = 0;

worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'log') {
    const p = pending.get(m.id);
    if (p) p.log.push({ stream: m.stream, text: m.text });
    appendLog(m.stream, m.text);
    return;
  }
  if (m.type === 'fetch') {
    fetchDone = m.doneLength; fetchTotal = m.totalLength;
    return;
  }
  if (m.type === 'done') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    p.resolve({ ok: m.ok, files: m.files || {}, log: p.log, error: m.error });
  }
};

function callEngine(tool, args, files) {
  const id = ++reqId;
  return new Promise((resolve) => {
    pending.set(id, { resolve, log: [] });
    const payload = {};
    for (const [k, v] of Object.entries(files || {})) payload[k] = toBytes(v);
    worker.postMessage({ id, tool, args, files: payload });
  });
}

// ---------------- 全域狀態 ----------------
function mergeFiles(files) {
  // 引擎輸出可能含暫存目錄 'tmp'，不要累積進工作樹
  const merged = { ...state.tree };
  for (const [k, v] of Object.entries(files || {})) if (k !== 'tmp') merged[k] = v;
  return merged;
}
const state = {
  tree: {},          // 工作目錄（跨步驟累積的檔案）
  ports: null,       // elab 後的埠資訊
  top: 'top',
  wave: null,
  simResult: null,
  busy: false,
};

const TABS = ['log', 'wave', 'stats', 'files'];
function showTab(name) {
  for (const t of TABS) {
    $(`tab-${t}`).classList.toggle('active', t === name);
    $(`pane-${t}`).classList.toggle('hidden', t !== name);
  }
  if (name === 'wave' && state.wave) state.wave.redraw();
}

// ---------------- 日誌 ----------------
const logEl = $('log');
function appendLog(stream, text) {
  const span = document.createElement('span');
  span.className = stream === 'err' ? 'log-err' : 'log-out';
  span.textContent = text;
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
}
function clearLog() { logEl.textContent = ''; }
function logLine(text, cls = 'log-out') {
  appendLog(cls === 'log-err' ? 'err' : 'out', text.endsWith('\n') ? text : text + '\n');
}

// ---------------- 樣板：yosys 腳本 ----------------
const SIM_SCRIPT = (top) => [
  'read_verilog -sv design.v',
  `hierarchy -check -top ${top}`,
  'proc',
  'flatten',
  'memory_map',
  'async2sync',
  'opt -fast',
  'techmap',
  'opt -fast',
  'simplemap',
  'write_json sim.json',
].join('; ');
const ELAB_SCRIPT = (top) => `read_verilog -sv design.v; hierarchy -check -top ${top}; proc; check -assert; write_json elab.json`;
const SYNTH_SCRIPT = (top) => `read_verilog -sv design.v; synth_ice40 -top ${top} -json design.json`;

// ---------------- 步驟 ----------------
async function stepElaborate() {
  const top = $('top-name').value.trim() || 'top';
  state.top = top;
  logLine(`\n=== 解析（Elaborate）top=${top} ===`);
  const r = await callEngine('yosys', ['-p', ELAB_SCRIPT(top)], {
    'design.v': $('editor').value,
  });
  if (!r.ok) { logLine('解析失敗。', 'log-err'); showTab('log'); return false; }
  state.tree = { ...mergeFiles(r.files), 'design.v': $('editor').value };
  try {
    const elab = JSON.parse(toText(r.files['elab.json']));
    const mod = elab.modules[top];
    state.ports = Object.entries(mod.ports).map(([name, p]) => ({
      name, direction: p.direction, width: p.bits.length,
    }));
  } catch (e) {
    logLine(`埠資訊解析失敗: ${e.message}`, 'log-err');
    state.ports = null;
    return false;
  }
  buildStimulusRows();
  logLine(`解析成功：${state.ports.length} 個埠（輸入 ${state.ports.filter(p => p.direction === 'input').length}）。`);
  return true;
}

async function stepSynth() {
  const top = state.top || $('top-name').value.trim() || 'top';
  logLine(`\n=== 合成（synth_ice40）top=${top} ===`);
  const r = await callEngine('yosys', ['-p', SYNTH_SCRIPT(top)], {
    'design.v': $('editor').value,
  });
  if (!r.ok) { logLine('合成失敗。', 'log-err'); showTab('log'); return false; }
  state.tree = { ...mergeFiles(r.files), 'design.v': $('editor').value };
  renderStats();
  refreshFiles();
  logLine('合成完成。');
  return true;
}

async function stepPnr() {
  const device = $('device').value;
  const pkg = $('package').value;
  const freq = parseFloat($('freq').value) || 12;
  logLine(`\n=== 佈局繞線（nextpnr-ice40 ${device}/${pkg}，目標 ${freq} MHz）===`);
  const args = ['--' + device, '--package', pkg, '--json', 'design.json', '--asc', 'design.asc', '--freq', String(freq)];
  const pcf = $('pcf').value.trim();
  const files = { 'design.json': state.tree['design.json'] };
  if (pcf) { files['constraint.pcf'] = pcf; args.push('--pcf', 'constraint.pcf'); }
  const r = await callEngine('nextpnr-ice40', args, files);
  if (!r.ok) { logLine('佈局繞線失敗。', 'log-err'); showTab('log'); return false; }
  state.tree = mergeFiles(r.files);
  renderStats();
  refreshFiles();
  logLine('佈局繞線完成。');
  return true;
}

async function stepPack() {
  logLine('\n=== 產生位元流（icepack）===');
  const r = await callEngine('icepack', ['design.asc', 'design.bin'], { 'design.asc': state.tree['design.asc'] });
  if (!r.ok) { logLine('icepack 失敗。', 'log-err'); showTab('log'); return false; }
  state.tree = mergeFiles(r.files);
  refreshFiles();
  const bin = r.files['design.bin'];
  logLine(`位元流產生完成（${toBytes(bin).length} bytes）。`);
  return true;
}

async function stepSimulate() {
  const top = state.top || $('top-name').value.trim() || 'top';
  logLine(`\n=== 模擬（閘階層，yosys 映射 + 內建模擬器）top=${top} ===`);
  const r = await callEngine('yosys', ['-q', '-p', SIM_SCRIPT(top)], {
    'design.v': $('editor').value,
  });
  if (!r.ok) { logLine('網列映射失敗。', 'log-err'); showTab('log'); return; }
  state.tree = { ...mergeFiles(r.files), 'design.v': $('editor').value };
  const netlist = JSON.parse(toText(r.files['sim.json']));
  const stimuli = collectStimuli();
  const steps = parseInt($('steps').value, 10) || 100;
  const t0 = performance.now();
  let result;
  try {
    result = runSimulation(netlist, {
      top,
      steps,
      stimuli,
      showInternal: $('show-internal').checked,
      initFFs: $('init-ff-zero').checked ? 'zero' : 'x',
    });
  } catch (e) {
    logLine(`模擬失敗: ${e.message}`, 'log-err');
    return;
  }
  const dt = (performance.now() - t0).toFixed(1);
  for (const w of result.warnings) logLine(`警告: ${w}`, 'log-err');
  state.simResult = result;
  state.vcdText = writeVCD(result, { moduleName: top });
  state.tree = { ...state.tree, 'out.vcd': state.vcdText };
  if (!state.wave) state.wave = createWaveViewer($('wave-canvas'), result.signals);
  else state.wave.setData(result.signals);
  refreshFiles();
  showTab('wave');
  logLine(`模擬完成：${steps} 步，${result.signals.length} 個訊號，耗時 ${dt} ms。`);
}

// ---------------- 激勵設定 UI ----------------
function buildStimulusRows() {
  const box = $('stim-rows');
  box.innerHTML = '';
  const inputs = (state.ports || []).filter(p => p.direction === 'input');
  const outputs = (state.ports || []).filter(p => p.direction !== 'input');
  if (!inputs.length) {
    box.innerHTML = '<div class="muted">（此模組沒有輸入埠）</div>';
    return;
  }
  for (const p of inputs) {
    const row = document.createElement('div');
    row.className = 'stim-row';
    row.dataset.port = p.name;
    row.dataset.width = p.width;
    const isClk = /^(clk|clock|ck)$/i.test(p.name);
    row.innerHTML = `
      <label class="stim-name" title="${p.name}">${p.name} <span class="muted">[${p.width}]</span></label>
      <select class="stim-mode">
        <option value="const"${!isClk ? ' selected' : ''}>定值</option>
        <option value="clock"${isClk ? ' selected' : ''}>時脈</option>
        <option value="seq">序列</option>
      </select>
      <input class="stim-const" type="text" value="0" placeholder="十六進位">
      <input class="stim-half" type="number" value="5" min="1" title="半週期（步）" ${isClk ? '' : 'disabled'}>
      <input class="stim-seq" type="text" placeholder="0,1,2,3（最後一個重複）" disabled>
    `;
    box.appendChild(row);
  }
  const outInfo = document.createElement('div');
  outInfo.className = 'muted';
  outInfo.textContent = '輸出：' + (outputs.length ? outputs.map(o => `${o.name}[${o.width}]`).join(', ') : '（無）');
  box.appendChild(outInfo);
}

function collectStimuli() {
  const stimuli = {};
  document.querySelectorAll('.stim-row').forEach((row) => {
    const name = row.dataset.port;
    const mode = row.querySelector('.stim-mode').value;
    if (mode === 'clock') {
      stimuli[name] = { mode, half: parseInt(row.querySelector('.stim-half').value, 10) || 5 };
    } else if (mode === 'seq') {
      const seq = row.querySelector('.stim-seq').value.split(',').map(s => s.trim()).filter(s => s !== '')
        .map(s => { try { return BigInt(s); } catch { return 0n; } });
      stimuli[name] = { mode, seq: seq.length ? seq : [0n] };
    } else {
      const v = row.querySelector('.stim-const').value.trim() || '0';
      stimuli[name] = { mode, value: v };
    }
  });
  return stimuli;
}

// 序列值統一轉 BigInt（支援 0x 前綴或純數字）
document.addEventListener('input', (e) => {
  const row = e.target.closest?.('.stim-row');
  if (!row) return;
  if (e.target.classList.contains('stim-mode')) {
    const mode = e.target.value;
    row.querySelector('.stim-const').disabled = mode !== 'const';
    row.querySelector('.stim-half').disabled = mode !== 'clock';
    row.querySelector('.stim-seq').disabled = mode !== 'seq';
  }
});

// ---------------- 統計 ----------------
function renderStats() {
  const box = $('stats-body');
  const parts = [];
  const log = logEl.textContent;
  // 從 log 抽取 yosys 統計表與 nextpnr 利用率
  const statBlocks = [...log.matchAll(/=== ([^\s=]+) ===\n\n((?:[ \t]+.*\n)+)/g)];
  if (statBlocks.length) {
    parts.push('<h3>yosys 統計（合成後 cell 數）</h3>');
    const topBlock = statBlocks[statBlocks.length - 1];
    parts.push(`<pre class="stat-pre">${esc(topBlock[2].trim())}</pre>`);
  }
  const util = log.match(/Device utilisation:\n(?:\s+\S+.*\n)+/);
  if (util) {
    parts.push('<h3>nextpnr-ice40 資源利用率</h3>');
    parts.push(`<pre class="stat-pre">${esc(util[0].trim())}</pre>`);
  }
  const fmax = [...log.matchAll(/Max frequency for clock '[^']*': ([\d.]+) MHz \((\w+)/g)];
  if (fmax.length) {
    const m = fmax[fmax.length - 1];
    parts.push(`<h3>時序</h3><p>最高頻率：<b>${esc(m[1])} MHz</b>（${m[2] === 'PASS' ? '符合目標' : '未達目標'}）</p>`);
  }
  box.innerHTML = parts.length ? parts.join('') : '<div class="muted">尚無統計資料（先執行「合成」或「佈局繞線」）</div>';
}

function esc(s) { return s.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>'); }

// ---------------- 產物 ----------------
const ARTIFACTS = [
  ['design.v', 'Verilog 原始碼', 'text'],
  ['elab.json', '解析後網列 (JSON)', 'text'],
  ['sim.json', '模擬用閘階層網列', 'text'],
  ['design.json', '合成網列（給 nextpnr）', 'text'],
  ['design.asc', '佈局結果 (ASCII)', 'text'],
  ['design.bin', 'FPGA 位元流', 'bin'],
  ['out.vcd', '模擬波形 (VCD)', 'text'],
];
function refreshFiles() {
  const box = $('files-body');
  box.innerHTML = '';
  let any = false;
  for (const [name, label, kind] of ARTIFACTS) {
    const data = state.tree[name];
    if (data === undefined) continue;
    any = true;
    const bytes = toBytes(data).length;
    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = `<span class="file-name">${name}</span><span class="muted">${label} · ${fmtSize(bytes)}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '下載';
    btn.onclick = () => download(name, kind === 'bin' ? toBytes(data) : toText(data));
    row.appendChild(btn);
    box.appendChild(row);
  }
  if (!any) box.innerHTML = '<div class="muted">尚無產物</div>';
}
function fmtSize(n) {
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
}

// ---------------- 按鈕流程（含依賴自動補跑） ----------------
async function withBusy(fn) {
  if (state.busy) return;
  state.busy = true;
  document.querySelectorAll('button[data-step]').forEach(b => b.disabled = true);
  try { await fn(); }
  catch (e) { logLine(`內部錯誤: ${e.message}`, 'log-err'); }
  finally {
    state.busy = false;
    document.querySelectorAll('button[data-step]').forEach(b => b.disabled = false);
    setStatus('');
  }
}

// 編輯過的 design.v 需要重跑前置步驟
let dirty = true;
$('editor').addEventListener('input', () => { dirty = true; });

// ---------------- 事件繫結 ----------------
document.querySelectorAll('button[data-step]').forEach(b => {
  const map = {
    elaborate: () => withBusy(stepElaborate),
    synth: () => withBusy(async () => { if (!state.ports || dirty) { if (!await stepElaborate()) return; } await stepSynth(); dirty = false; }),
    simulate: () => withBusy(async () => { if (!state.ports || dirty) { if (!await stepElaborate()) return; } await stepSimulate(); dirty = false; }),
    pnr: () => withBusy(async () => { if (!state.tree['design.json'] || dirty) { if (!await stepElaborate()) return; if (!await stepSynth()) return; } await stepPnr(); dirty = false; }),
    pack: () => withBusy(async () => {
      if (!state.tree['design.asc'] || dirty) {
        if (!await stepElaborate()) return;
        if (!await stepSynth()) return;
        if (!await stepPnr()) return;
      }
      await stepPack(); dirty = false;
    }),
    download_vcd: () => { if (state.vcdText) download('out.vcd', state.vcdText); else alert('請先執行模擬'); },
  };
  b.addEventListener('click', map[b.dataset.step]);
});

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

$('device').addEventListener('change', () => {
  const d = $('device').value;
  const pkgs = { 'hx1k': ['tq144', 'vq100', 'cb132'], 'lp1k': ['tq144', 'cb132', 'cb81'], 'hx8k': ['ct256', 'tq144:4k', 'bg121:4k'] };
  $('package').innerHTML = (pkgs[d] || ['tq144']).map(p => `<option value="${p}">${p}</option>`).join('');
});

$('sample').addEventListener('change', () => loadSample($('sample').value));

// ---------------- 範例 ----------------
async function loadSample(name) {
  const text = await (await fetch(`samples/${name}`)).text();
  $('editor').value = text;
  state.ports = null;
  dirty = true;
  $('top-name').value = (name.replace('.v', '').match(/^[a-zA-Z_]\w*$/) ? name.replace('.v', '') : guessTop(text));
  logLine(`\n已載入範例 ${name}，按「解析」取得埠資訊。`);
}
function guessTop(text) {
  const m = [...text.matchAll(/^\s*module\s+([A-Za-z_]\w*)/gm)];
  if (!m.length) return 'top';
  // 取不被其他 module instance 引用的（最上層）
  const names = m.map(x => x[1]);
  return names.find(n => !new RegExp(`\\b${n}\\s+\\w+\\s*\\(`).test(text.replace(new RegExp(`module\\s+${n}`, 'g'), ''))) || names[names.length - 1];
}

// ---------------- 狀態列 ----------------
function setStatus(text) { $('status').textContent = text; }
setInterval(() => {
  if (state.busy && fetchTotal > fetchDone && fetchTotal > 0) {
    const mb = (fetchTotal / 1048576).toFixed(0);
    const pct = Math.round(fetchDone / fetchTotal * 100);
    setStatus(`下載 WebAssembly 引擎 ${pct}%（共 ${mb} MB，僅首次需要）`);
  }
}, 200);

// ---------------- 初始 ----------------
showTab('log');
loadSample('counter.v');
