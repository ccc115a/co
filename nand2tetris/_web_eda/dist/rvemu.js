/* RISCV 模擬器 前端：純瀏覽器、零伺服器、零 node。
   引擎＝HackJack2Vm（Jack→VM）＋ HackVm2Rv（VM→RV32）＋ HackRv（rvasm 組譯＋rvemu 執行），
   全部由 dist/embed.js 提供全域物件；範例是 12 支 Jack 程式，選取即現場編成 .s。
   記憶體常數與 lib/riscv/vm2riscv.js 同值：MIRROR＝0x20000（Jack word W → byte MIRROR＋4W）。 */
(() => {
  'use strict';
  const JACK = window.HackJack2Vm, VR = window.HackVm2Rv, RV = window.HackRv;
  const corpus = window.HACKJS_CORPUS || {};
  if (!JACK || !VR || !RV) {
    document.getElementById('status').textContent = 'embed.js 載入失敗（缺 HackJack2Vm/HackVm2Rv/HackRv）';
    return;
  }

  const MIRROR = 0x20000;
  const SCREEN_WORD0 = 16384, SCREEN_WORDS = 8192, KBD_WORD = 24576;
  const KBD_MIRROR = MIRROR + KBD_WORD * 4;
  const ABI = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1',
    'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
    's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6'];

  const el = {
    example: document.getElementById('example'),
    build: document.getElementById('build'),
    load: document.getElementById('load'),
    run: document.getElementById('run'),
    step: document.getElementById('step'),
    reset: document.getElementById('reset'),
    speed: document.getElementById('speed'),
    maxsteps: document.getElementById('maxsteps'),
    src: document.getElementById('src'),
    listing: document.getElementById('listing'),
    canvas: document.getElementById('screen'),
    status: document.getElementById('status'),
    regs: document.getElementById('regs'),
    chips: document.getElementById('chips'),
    uart: document.getElementById('uart'),
    memStart: document.getElementById('memStart'),
    memLen: document.getElementById('memLen'),
    memBtn: document.getElementById('memBtn'),
    memBody: document.getElementById('memBody'),
    memPrev: document.getElementById('memPrev'),
    memNext: document.getElementById('memNext'),
    fps: document.getElementById('fps'),
  };
  const ctx = el.canvas.getContext('2d');
  const IMG = document.createElement('canvas').getContext('2d').createImageData(512, 256);
  const PX = IMG.data;

  const OS_DIR = 'gen/os_src';
  const PROGRAMS = [
    { name: 'Seven', dir: '../11/jack/Seven', needsOS: true },
    { name: 'Average', dir: '../11/jack/Average', needsOS: true },
    { name: 'ComplexArrays', dir: '../11/jack/ComplexArrays', needsOS: true },
    { name: 'ConvertToBin', dir: '../11/jack/ConvertToBin', needsOS: true },
    { name: 'Square', dir: '../11/jack/Square', needsOS: true },
    { name: 'Pong', dir: '../11/jack/Pong', needsOS: true },
    { name: 'Sum', dir: '../11/jackNoOs/Sum', needsOS: false },
    { name: 'Factorial', dir: '../11/jackNoOs/Factorial', needsOS: false },
    { name: 'Fib', dir: '../11/jackNoOs/Fib', needsOS: false },
    { name: 'GCD', dir: '../11/jackNoOs/GCD', needsOS: false },
    { name: 'PrimeUnder100', dir: '../11/jackNoOs/PrimeUnder100', needsOS: false },
    { name: 'chain', dir: 'gen/chain', needsOS: false },
  ];

  let emu = new RV.Emulator();
  let running = false;
  let stepsPerFrame = 10000;
  // 上限 0＝無限跑（Pong 等遊戲永不 halt，預設即無限；填正整數則跑滿即停）。
  // Pong 光初始化（清屏＋畫球拍）就要約 100 萬步，舊預設 20 萬步會停在全黑畫面。
  let steps = 0, maxSteps = Infinity;
  let curIdx = -1;
  let words = [];
  let disLines = [];
  let frames = 0, lastT = performance.now();

  const setStatus = (msg, kind) => {
    el.status.textContent = msg;
    el.status.className = kind || '';
  };
  const hex8 = (v) => '0x' + (v >>> 0).toString(16).padStart(8, '0');

  function jackSources(dir) {
    return Object.keys(corpus)
      .filter((k) => k.startsWith(dir + '/') && k.endsWith('.jack'))
      .sort();
  }

  // 範例 Jack（含 OS 時 OS 在前）→ 嚴格翻成 .s（OS 呼叫未定義即 throw）
  function compileExample(name) {
    const p = PROGRAMS.find((q) => q.name === name);
    if (!p) throw new Error(`未知範例：${name}`);
    const files = jackSources(p.dir).map((k) => ({
      path: k.split('/').pop().replace(/\.jack$/, '.vm'),
      src: JACK.compileJack(corpus[k]).join('\n') + '\n',
    }));
    if (files.length === 0) throw new Error(`語料缺 ${p.dir} 的 .jack`);
    let vmFiles = files;
    if (p.needsOS) {
      const os = jackSources(OS_DIR).map((k) => ({
        path: k.split('/').pop().replace(/\.jack$/, '.vm'),
        src: JACK.compileJack(corpus[k]).join('\n') + '\n',
      }));
      vmFiles = os.concat(files);
    }
    return VR.translate(vmFiles);
  }

  // 上限輸入：<=0 或非數字＝無限（顯示 ∞）；正整數＝再跑這麼多步即停。
  function readBudget() {
    const n = Number(el.maxsteps.value);
    if (!Number.isFinite(n) || n <= 0) return Infinity;
    return Math.max(1, Math.floor(n));
  }
  const fmtMax = () => (maxSteps === Infinity ? '∞' : String(maxSteps));

  function freshEmu() {
    emu = new RV.Emulator();
    curIdx = -1;
    held.length = 0;
  }

  function screenWordAt(w) {
    try {
      return emu.loadWord(MIRROR + w * 4) & 0xffff;
    } catch (_) { return 0; }
  }

  function repaint() {
    // 逐 word 讀一次（8192 次 loadWord），再展開成 16 像素；
    // 舊寫法逐像素讀（131072 次），同 word 重讀 16 次，每幀白白多花十幾毫秒。
    let o = 0;
    for (let y = 0; y < 256; y++) {
      const row = SCREEN_WORD0 + y * 32;
      for (let bx = 0; bx < 32; bx++) {
        const v = screenWordAt(row + bx);
        for (let b = 0; b < 16; b++, o += 4) {
          const on = (v & (1 << (15 - b))) !== 0;
          PX[o] = PX[o + 1] = PX[o + 2] = on ? 0 : 255;
          PX[o + 3] = 255;
        }
      }
    }
    ctx.putImageData(IMG, 0, 0);
    const g = (i) => emu.getReg(i);
    el.regs.textContent =
      `PC=${hex8(emu.pc)}　steps=${steps}/${fmtMax()}　halted=${emu.halted}　exit=${emu.exitCode}\n` +
      `ra=${hex8(g(1))}　s1(SP)=${hex8(g(9))}　a0=${hex8(g(10))}　a7=${g(17)}`;
    el.chips.innerHTML = Array.from({ length: 32 },
      (_, i) => `x${i}/${ABI[i]}=${hex8(g(i))}`).join('\n');
    el.uart.textContent = emu.uart || '（無輸出）';
    readMem();
  }

  function markPc() {
    // Pong 有 1.4 萬行列表：舊寫法每幀 querySelector('.cur') 全表掃描會卡；
    // 改記住上一個下標，只動兩個 div 的 class。
    const idx = Math.floor((emu.pc >>> 0) / 4);
    const kids = el.listing.children;
    if (curIdx === idx) return kids[idx] || null;
    if (kids[curIdx]) kids[curIdx].classList.remove('cur');
    curIdx = idx;
    if (kids[idx]) {
      kids[idx].classList.add('cur');
      return kids[idx];
    }
    return null;
  }

  function scrollToPc() {
    const cur = el.listing.querySelector('.cur');
    if (!cur) return;
    const cont = el.listing.parentElement;
    const cr = cont.getBoundingClientRect();
    const lr = cur.getBoundingClientRect();
    const cTop = lr.top - cr.top + cont.scrollTop;
    if (cTop < cont.scrollTop || cTop + lr.height > cont.scrollTop + cont.clientHeight) {
      cont.scrollTop = Math.max(0, Math.round(cTop - cont.clientHeight / 2));
    }
  }

  function load(sText) {
    try {
      const r = RV.assemble(String(sText), { origin: 0 });
      words = r.words;
      disLines = RV.disassemble(words, 0);
      // 全新 Emulator：舊記憶體（STATIC／堆疊／SCREEN 鏡像／KBD／暫存器）不清，
      // 切範例或重載會帶著上一個程式的髒狀態跑；loadWords 只覆寫程式區。
      freshEmu();
      emu.loadWords(words, 0);
      steps = 0;
      maxSteps = Infinity;
      running = false;
      el.run.textContent = '執行 ▶';
      el.listing.innerHTML = disLines.map((l) => `<div>${l}</div>`).join('');
      repaint();
      markPc();
      scrollToPc();
      setStatus(`組譯完成：${words.length} words RV32`);
    } catch (e) {
      setStatus(`組譯錯誤：${e.message}`, 'error');
    }
  }

  function stopRun(msg) {
    running = false;
    el.run.textContent = '執行 ▶';
    if (msg) setStatus(msg);
  }

  function tick(t) {
    frames++;
    if (t - lastT >= 1000) { el.fps.textContent = `fps=${Math.round(frames * 1000 / (t - lastT))}（${stepsPerFrame}步/幀）`; frames = 0; lastT = t; }
    if (running) {
      try {
        for (let k = 0; k < stepsPerFrame && steps < maxSteps && !emu.halted; k++) {
          emu.step();
          steps++;
        }
      } catch (e) {
        stopRun(`執行錯誤（${steps} 步）：${e.message}`);
        repaint();
        markPc();
        return;
      }
      if (emu.halted) stopRun(`停機（${steps} 步）：exit=${emu.exitCode}`);
      else if (steps >= maxSteps) stopRun(`跑滿 ${maxSteps} 步即停（程式不 halt 是正常的）`);
      repaint();
      markPc();
    }
    requestAnimationFrame(tick);
  }

  // ---- 記憶體 ----
  function parseAddr(s) {
    const v = Number(String(s).trim());
    if (!Number.isInteger(v) || v < 0) throw new Error(`位址格式錯誤：${s}`);
    return v >>> 0;
  }

  function readMem() {
    try {
      const start = parseAddr(el.memStart.value);
      const len = Math.max(1, Math.min(256, Number(el.memLen.value) | 0));
      const rows = [];
      for (let i = 0; i < len; i += 4) {
        const a = (start + i * 4) >>> 0;
        const vs = [];
        for (let j = 0; j < 4 && i + j < len; j++) {
          try { vs.push(hex8(emu.loadWord((a + j * 4) >>> 0)).slice(2)); }
          catch (_) { vs.push('????????'); }
        }
        rows.push(`${hex8(a)}: ${vs.join(' ')}`);
      }
      el.memBody.textContent = rows.join('\n');
    } catch (e) {
      el.memBody.textContent = e.message;
    }
  }

  // ---- 按鍵（寫入 KBD 鏡像；放開歸零） ----
  const held = [];
  function setKbd(code) {
    try { emu.storeWord(KBD_MIRROR, code); } catch (_) {}
  }
  function keyDown(code) {
    if (!held.includes(code)) held.push(code);
    setKbd(held[held.length - 1]);
  }
  function keyUp(code) {
    const k = held.indexOf(code);
    if (k >= 0) held.splice(k, 1);
    setKbd(held.length ? held[held.length - 1] : 0);
  }
  document.querySelectorAll('button.key').forEach((b) => {
    const code = Number(b.dataset.key);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); keyDown(code); });
    b.addEventListener('pointerup', () => keyUp(code));
    b.addEventListener('pointerleave', () => keyUp(code));
  });
  const KEYMAP = { ArrowLeft: 130, ArrowUp: 131, ArrowRight: 132, ArrowDown: 133, ' ': 32 };
  window.addEventListener('keydown', (e) => {
    const c = KEYMAP[e.key];
    if (c === undefined) return;
    e.preventDefault();
    keyDown(c);
  });
  window.addEventListener('keyup', (e) => {
    const c = KEYMAP[e.key];
    if (c === undefined) return;
    keyUp(c);
  });

  // ---- 接線 ----
  el.example.innerHTML = '';
  for (const p of PROGRAMS) {
    const o = document.createElement('option');
    o.value = p.name;
    o.textContent = p.name + (p.needsOS ? '（OS）' : '');
    el.example.appendChild(o);
  }

  function useExample(autoRun) {
    const name = el.example.value;
    try {
      const t0 = performance.now();
      const s = compileExample(name);
      el.src.value = s;
      load(s);
      const ms = Math.round(performance.now() - t0);
      setStatus(`範例 ${name}：Jack→VM→RISCV 編譯完成（${ms}ms），${words.length} words`);
      if (autoRun) {
        const b = readBudget();
        maxSteps = b === Infinity ? Infinity : steps + b;
        running = true;
        el.run.textContent = '暫停 ⏸';
      }
    } catch (e) {
      setStatus(`範例 ${name} 編譯失敗：${e.message}`, 'error');
    }
  }

  el.build.onclick = () => useExample(false);
  el.load.onclick = () => load(el.src.value);
  el.run.onclick = () => {
    if (words.length === 0) { setStatus('先載入程式（選範例或按「組譯並載入」）', 'error'); return; }
    // 每次按下「執行 ▶」都按輸入框再給一份預算（steps＋budget），
    // 跑滿停住後再按一次即從當下狀態續跑，而非卡死在 steps＝maxSteps 動彈不得。
    if (!running) {
      const b = readBudget();
      maxSteps = b === Infinity ? Infinity : steps + b;
    }
    running = !running;
    el.run.textContent = running ? '暫停 ⏸' : '執行 ▶';
    setStatus(running ? (maxSteps === Infinity ? '執行中（無上限）' : `執行中（上限 ${fmtMax()} 步）`) : '已暫停');
  };
  el.step.onclick = () => {
    if (words.length === 0) return;
    running = false;
    el.run.textContent = '執行 ▶';
    try { emu.step(); steps++; } catch (e) { setStatus(`執行錯誤：${e.message}`, 'error'); }
    repaint();
    markPc();
    scrollToPc();
  };
  el.reset.onclick = () => {
    if (words.length === 0) return;
    // 重載到全新記憶體：SCREEN 鏡像立刻全黑、暫存器歸零（舊寫法只覆寫程式區，
    // 畫面停在舊幀、STATIC 留著，看起來像「重設了但球還在」）。
    freshEmu();
    emu.loadWords(words, 0);
    steps = 0;
    maxSteps = Infinity;
    repaint();
    markPc();
    scrollToPc();
    setStatus('已重設');
  };
  el.speed.oninput = () => {
    // RV 單步比 HACK 單步重得多，且 Pong 每約 9 千步才走一格（4px）：
    // 沿用 HACK 頁的 10..10^7 映射會讓球一幀飛 60px 以上、開局不到 1 秒就 Game Over 定格。
    // 改映射 316..10 萬步/幀（對數），預設 60 即 1 萬步/幀 ≈ 每幀走一格，球速適中可玩。
    stepsPerFrame = Math.max(1, Math.round(10 ** (2.5 + el.speed.value / 100 * 2.5)));
  };
  el.speed.oninput();
  document.querySelectorAll('[data-mem]').forEach((b) => {
    b.onclick = () => { el.memStart.value = b.dataset.mem; el.memLen.value = b.dataset.len || '32'; readMem(); };
  });
  el.memBtn.onclick = readMem;
  el.memPrev.onclick = () => {
    try {
      const len = Math.max(1, Number(el.memLen.value) | 0);
      el.memStart.value = hex8((parseAddr(el.memStart.value) - len * 4) >>> 0);
    } catch (_) {}
    readMem();
  };
  el.memNext.onclick = () => {
    try {
      const len = Math.max(1, Number(el.memLen.value) | 0);
      el.memStart.value = hex8((parseAddr(el.memStart.value) + len * 4) >>> 0);
    } catch (_) {}
    readMem();
  };
  readMem();
  requestAnimationFrame(tick);

  // ---- 跨視窗橋接（對應 jack.html 的 rvjs-*；仿 app.js 的 hackjs-*） ----
  if (window.opener) window.opener.postMessage({ type: 'rvjs-ready' }, '*');
  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'rvjs-ping') {
      if (window.opener) window.opener.postMessage({ type: 'rvjs-ready' }, '*');
    } else if (d.type === 'rvjs-load' && typeof d.s === 'string') {
      el.src.value = d.s;
      load(d.s);
      const b = readBudget();
      maxSteps = b === Infinity ? Infinity : steps + b;
      running = true;
      el.run.textContent = '暫停 ⏸';
      setStatus('已接收 Jack 編譯結果（← jack.html 全量 .s），可執行並觀察暫存器/STATIC/螢幕');
    }
  });

  // ---- 書籤：#prog=Pong（&run=1） ----
  function hashWant() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return null;
    let h;
    try { h = decodeURIComponent(raw); } catch (_) { h = raw; }
    if (/^(prog|run)=/.test(h)) {
      const hp = new URLSearchParams(h);
      return { prog: hp.get('prog'), run: hp.get('run') === '1' };
    }
    return null;
  }

  function applyWant() {
    const q = new URLSearchParams(location.search);
    const wh = hashWant();
    const wantProg = (wh && wh.prog) ?? q.get('prog');
    const autoRun = (wh ? wh.run : false) || q.get('run') === '1';
    if (wantProg && PROGRAMS.some((p) => p.name === wantProg)) {
      el.example.value = wantProg;
      useExample(autoRun);
      if (autoRun && running) {
        history.replaceState(null, '', location.pathname + location.search + '#prog=' + wantProg + '&run=1');
      }
      return;
    }
    el.example.value = 'Sum';
    useExample(false);
  }

  el.example.onchange = () => {
    useExample(false);
    history.replaceState(null, '', location.pathname + location.search + '#prog=' + el.example.value);
  };

  applyWant();
  window.addEventListener('hashchange', applyWant);
})();
