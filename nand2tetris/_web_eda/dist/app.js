/* hackeda asm Emulator 前端（v0.8）：純瀏覽器、零伺服器、零 node。
   引擎＝HackAsm（組譯）＋ HackVM（虛擬機），全部由 dist/embed.js 提供全域物件。 */
(() => {
  'use strict';
  const VM = window.HackVM, ASM = window.HackAsm, EC = window.EmuCommon;
  if (!VM || !ASM || !EC) {
    document.getElementById('status').textContent = 'embed.js／emu-common.js 載入失敗（缺 HackVM/HackAsm/EmuCommon）';
    return;
  }

  const el = {
    ta: document.getElementById('asm'),
    example: document.getElementById('example'),
    openBtn: document.getElementById('open'),
    file: document.getElementById('file'),
    loadBtn: document.getElementById('load'),
    runBtn: document.getElementById('run'),
    stepBtn: document.getElementById('step'),
    resetBtn: document.getElementById('reset'),
    speed: document.getElementById('speed'),
    canvas: document.getElementById('screen'),
    status: document.getElementById('status'),
    regs: document.getElementById('regs'),
    chips: document.getElementById('chips'),
    listing: document.getElementById('listing'),
    ramStart: document.getElementById('ramStart'),
    ramLen: document.getElementById('ramLen'),
    ramBtn: document.getElementById('ramBtn'),
    ramBody: document.getElementById('ramBody'),
    ramPrev: document.getElementById('ramPrev'),
    ramNext: document.getElementById('ramNext'),
    fps: document.getElementById('fps'),
  };
  const ctx = el.canvas.getContext('2d');
  const SCREEN = document.createElement('canvas').getContext('2d').createImageData(512, 256);
  const PX = SCREEN.data;

  const vm = new VM.Vm();
  let running = false;
  let stepsPerFrame = 10000;
  let frames = 0, lastT = performance.now();
  let lines = [], lineMap = [], wordLine = [], pc = 0;

  const setStatus = (msg, kind) => {
    el.status.textContent = msg;
    el.status.className = kind || '';
  };

  function repaint() {
    let o = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 512; x++, o += 4) {
        const on = vm.screenPixel(y, x);
        PX[o] = PX[o + 1] = PX[o + 2] = on ? 0 : 255;
        PX[o + 3] = 255;
      }
    }
    ctx.putImageData(SCREEN, 0, 0);
    const r = vm.ram;
    el.regs.textContent = `PC=${vm.pc}　A=${vm.a}　D=${vm.d}　SP=${r[0]}　(指令 #${vm.cycles})`;
    el.chips.innerHTML = Array.from(r.slice(0, 16)).map((v, i) => `R${i}=${v}`).join('\n');
  }

  let curIdx = -1;
  function buildListing() {
    // 列表只在載入時重建；執行中高亮只動 class（見 markPc），不再每幀全表重建。
    let html = '';
    for (let i = 0; i < lines.length; i++) {
      const ln = lineMap[i];
      const mark = ln === null ? '   ' : String(ln).padStart(3, ' ');
      html += `<div class=""><span class="pc">${mark}</span> ${lines[i]}</div>`;
    }
    el.listing.innerHTML = html;
    curIdx = -1;
  }

  function markPc() {
    // Pong 等大程式列表上萬行：只動兩個 div 的 class，不重建、不全表掃描。
    const idx = wordLine[pc] ?? -1;
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
    const cur = el.listing.children[curIdx];
    if (!cur) return;
    const cont = el.listing.parentElement;
    const cr = cont.getBoundingClientRect();
    const lr = cur.getBoundingClientRect();
    const cTop = lr.top - cr.top + cont.scrollTop;
    const vBottom = cont.scrollTop + cont.clientHeight;
    if (cTop < cont.scrollTop || cTop + lr.height > vBottom) {
      cont.scrollTop = Math.max(0, Math.round(cTop - cont.clientHeight / 2 + lr.height / 2));
    }
  }

  function buildLineMap(asmSrc) {
    const ls = asmSrc.replace(/\r/g, '').split('\n');
    const lmap = [], wl = [];
    let pc2 = 0;
    for (let i = 0; i < ls.length; i++) {
      const t = ls[i].trim().replace(/\/\/.*$/, '').trim();
      if (!t) { lmap.push(null); continue; }
      if (t.startsWith('(') && t.endsWith(')')) { lmap.push(null); continue; }
      lmap.push(pc2);
      wl[pc2] = i;
      pc2++;
    }
    return [ls, lmap, wl];
  }

  function load(asmSrc) {
    try {
      const text = String(asmSrc).replace(/\r/g, '');
      const body = text.split('\n').map((l) => l.trim()).filter((l) => l);
      const allBin = body.length > 0 && body.every((l) => /^[01]{16}$/.test(l));
      if (allBin) {
        lines = []; lineMap = []; wordLine = [];
        vm.loadHack(text);
        repaint();
        if (el.listing) el.listing.textContent = '（直接載入 Hack 機器碼，無組語對照）';
        setStatus(`直接載入 Hack 機器碼：${body.length} 條指令`);
        return;
      }
      const r = ASM.assemble(asmSrc);
      [lines, lineMap, wordLine] = buildLineMap(asmSrc);
      vm.loadHack(r.hack);
      repaint();
      buildListing();
      markPc();
      scrollToPc();
      setStatus(`組譯完成：${r.hack.trim().split('\n').length} 條指令`);
    } catch (e) {
      setStatus(`組譯錯誤：${e.message}`, 'error');
    }
  }

  el.runBtn.onclick = () => {
    running = !running;
    el.runBtn.textContent = running ? '暫停 ⏸' : '執行 ▶';
    setStatus(running ? '執行中' : '已暫停');
  };
  el.stepBtn.onclick = () => { running = false; el.runBtn.textContent = '執行 ▶'; vm.step(); pc = vm.pc; repaint(); markPc(); scrollToPc(); };
  el.resetBtn.onclick = () => { vm.reset(); pc = vm.pc; repaint(); markPc(); scrollToPc(); };
  el.loadBtn.onclick = () => load(el.ta.value);
  EC.fillExampleSelect(el.example);
  el.example.onchange = () => {
    const name = el.example.value;
    try {
      const t0 = performance.now();
      const { fullVm } = EC.compileJackVm(name);
      const asmText = window.HackVm2Asm.translate(fullVm);
      el.ta.value = asmText;
      load(asmText);
      const ms = Math.round(performance.now() - t0);
      const words = asmText.split('\n').filter((l) => l.trim()).length;
      setStatus(`範例 ${name}：Jack→VM→HackCPU 編譯完成（${ms}ms），${words} 行組語`);
    } catch (e) {
      setStatus(`範例 ${name} 編譯失敗：${e.message}`, 'error');
    }
  };
  el.ta.value = '';
  el.openBtn.onclick = () => el.file.click();
  el.file.onchange = () => {
    const f = el.file.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { el.ta.value = String(rd.result); load(el.ta.value); };
    rd.readAsText(f);
  };
  el.speed.oninput = () => {
    stepsPerFrame = Math.max(1, Math.round(10 ** (1 + el.speed.value / 100 * 6)));
  };
  el.speed.oninput();

  const ram = { start: 256, len: 128 };
  const readRam = () => {
    ram.start = Math.max(0, Number(el.ramStart.value) | 0);
    ram.len = Math.max(1, Math.min(32768, Number(el.ramLen.value) | 0));
    const rows = [];
    for (let i = 0; i < ram.len && ram.start + i < 32768; i += 8) {
      const addr = ram.start + i;
      const vals = Array.from(vm.ram.slice(addr, addr + 8));
      rows.push(`${String(addr).padStart(5)}: ${vals.map((v) => v.toString(16).padStart(4, '0').toUpperCase()).join(' ')}`);
    }
    el.ramBody.textContent = rows.join('\n');
  };
  document.querySelectorAll('[data-ram]').forEach((b) => {
    b.onclick = () => { el.ramStart.value = b.dataset.ram; el.ramLen.value = b.dataset.len || '128'; readRam(); };
  });
  el.ramBtn.onclick = readRam;
  el.ramPrev.onclick = () => { el.ramStart.value = Math.max(0, (Number(el.ramStart.value) | 0) - (Number(el.ramLen.value) | 0)); readRam(); };
  el.ramNext.onclick = () => { if (Number(el.ramStart.value) >= 0) el.ramStart.value = (Number(el.ramStart.value) | 0) + (Number(el.ramLen.value) | 0); readRam(); };
  readRam();

  EC.keyBridge({
    keymap: { ArrowLeft: VM.KEY_LEFT, ArrowUp: VM.KEY_UP, ArrowRight: VM.KEY_RIGHT, ArrowDown: VM.KEY_DOWN },
    setKey: (c) => vm.setKey(c),
  });

  function tick(t) {
    frames++;
    if (t - lastT >= 1000) { el.fps.textContent = `fps=${Math.round(frames * 1000 / (t - lastT))}`; frames = 0; lastT = t; }
    if (running) {
      vm.run(stepsPerFrame);
      pc = vm.pc;
      repaint();
      markPc();
      scrollToPc();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  EC.receiverSide({
    ready: 'hackjs-ready', ping: 'hackjs-ping', load: 'hackjs-load', field: 'asm',
    onLoad: (text) => {
      console.log('[hackjs] 收到 jack.html 的組語', text.length, '字元');
      el.ta.value = text;
      load(text);
      running = true;
      el.runBtn.textContent = '暫停 ⏸';
      setStatus('已接收 Jack 編譯結果（← jack.html），可執行程式並觀察暫存器/RAM/螢幕');
    },
  });

  const sample = `// 示範：R0 = R1 * R2（2 × 5 = 10）
@2
D=A
@R1
M=D
@5
D=A
@R2
M=D
@R1
D=M
@R0
M=0
(LOOP)
@R1
D=M
@R0
M=D+M
@R2
M=M-1
@R2
D=M
@LOOP
D;JGT
(END)
@END
0;JMP`;
  // ---- v1.2 書籤/深連結（hash 優先於 query）：#asm=<組語> / #file=<語料 key> ----
  function hashWant() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return null;
    let h;
    try { h = decodeURIComponent(raw); } catch (_) { h = raw; }
    if (/^(asm|file|ram)=/.test(h)) return new URLSearchParams(h);
    return null;
  }

  let first = true;
  function applyWant() {
    const wh = hashWant();
    const qd = new URLSearchParams(location.search);
    const asm = (wh && wh.get('asm')) ?? qd.get('asm');
    const file = wh && wh.get('file');
    const ram = (wh && wh.get('ram')) ?? qd.get('ram');
    if (file) {
      const text = window.HACKJS_FS ? window.HACKJS_FS.read(file) : null;
      if (text == null) { setStatus(`語料中沒有 ${file}`, 'error'); return; }
      el.ta.value = text;
      load(text);
    } else if (asm != null) {
      el.ta.value = asm;
      load(asm);
    } else if (first) {
      el.ta.value = sample;
      load(sample);
    }
    if (ram) {
      for (const g of ram.split(',')) {
        const m = /^(\d+):(-?\d+)$/.exec(g.trim());
        if (m) vm.ram[Number(m[1]) | 0] = Number(m[2]) & 0xffff;
      }
      repaint();
    }
    first = false;
  }

  applyWant();
  window.addEventListener('hashchange', applyWant);
})();