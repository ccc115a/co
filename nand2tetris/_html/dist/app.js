/* hackeda asm Emulator 前端（v0.8）：純瀏覽器、零伺服器、零 node。
   引擎＝HackAsm（組譯）＋ HackVM（虛擬機），全部由 dist/embed.js 提供全域物件。 */
(() => {
  'use strict';
  const VM = window.HackVM, ASM = window.HackAsm;
  if (!VM || !ASM) {
    document.getElementById('status').textContent = 'embed.js 載入失敗（缺 HackVM/HackAsm）';
    return;
  }

  const el = {
    ta: document.getElementById('asm'),
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

  function renderListing(pcNow) {
    let html = '';
    for (let i = 0; i < lines.length; i++) {
      const ln = lineMap[i];
      const cls = ln === null ? '' : (ln === pcNow ? ' cur' : '');
      const mark = ln === null ? '   ' : String(ln).padStart(3, ' ');
      html += `<div class="${cls}"><span class="pc">${mark}</span> ${lines[i]}</div>`;
    }
    el.listing.innerHTML = html;
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
      const r = ASM.assemble(asmSrc);
      [lines, lineMap, wordLine] = buildLineMap(asmSrc);
      vm.loadHack(r.hack);
      repaint();
      renderListing(vm.pc);
      setStatus(`組譯完成：${r.hack.trim().split('\n').length} 條指令`);
    } catch (e) {
      setStatus(`組譯錯誤：${e.message}`, 'error');
    }
  }

  const KEY = VM.KEY_LEFT;
  const held = [];
  el.runBtn.onclick = () => {
    running = !running;
    el.runBtn.textContent = running ? '暫停 ⏸' : '執行 ▶';
    setStatus(running ? '執行中' : '已暫停');
  };
  el.stepBtn.onclick = () => { running = false; el.runBtn.textContent = '執行 ▶'; vm.step(); pc = vm.pc; repaint(); renderListing(vm.pc); };
  el.resetBtn.onclick = () => { vm.reset(); repaint(); renderListing(vm.pc); };
  el.loadBtn.onclick = () => load(el.ta.value);
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

  window.addEventListener('keydown', (e) => {
    const map = { ArrowLeft: VM.KEY_LEFT, ArrowUp: VM.KEY_UP, ArrowRight: VM.KEY_RIGHT, ArrowDown: VM.KEY_DOWN };
    const c = map[e.key];
    if (c) {
      e.preventDefault();
      if (!held.includes(c)) held.push(c);
      vm.setKey(held[held.length - 1]);
    }
  });
  window.addEventListener('keyup', (e) => {
    const c = { ArrowLeft: VM.KEY_LEFT, ArrowUp: VM.KEY_UP, ArrowRight: VM.KEY_RIGHT, ArrowDown: VM.KEY_DOWN }[e.key];
    if (c) {
      const k = held.indexOf(c);
      if (k >= 0) held.splice(k, 1);
      vm.setKey(held.length ? held[held.length - 1] : 0);
    }
  });

  function tick(t) {
    frames++;
    if (t - lastT >= 1000) { el.fps.textContent = `fps=${Math.round(frames * 1000 / (t - lastT))}`; frames = 0; lastT = t; }
    if (running) {
      vm.run(stepsPerFrame);
      pc = vm.pc;
      repaint();
      renderListing(pc);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

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
  el.ta.value = sample;
  load(sample);
})();