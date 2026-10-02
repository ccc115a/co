/* jack.html 頁面邏輯：內建 Jack 程式（需 OS / 無 OS / 虛擬 chain）＋自訂多檔貼上。
   雙後端（頁首選單＋網址 backend=hackcpu|riscv 指定，預設 HackCPU）：
   1) HackCPU：.jack → .vm → .asm → .hack → hackemu（▶執行與送 HACK 模擬器用 OS 在前的全量）
   2) RISCV：.jack → .vm → .s → bytecode → rvemu 定步執行（OS 全量參與，Output 內聯為 UART；
      送 RISCV 模擬器用同一份全量 .s，rvjs-* 跨視窗協議）
   分頁（.vm／.asm／.hack／RISCV／bytecode）只顯示使用者模組，不含 OS；
   bytecode 需模組可獨立組譯（含 OS 呼叫的模組只顯示原因）；▶執行永遠用全量。 */
(() => {
  'use strict';
  const el = {
    mode: document.getElementById('mode'),
    program: document.getElementById('program'),
    backend: document.getElementById('backend'),
    withOS: document.getElementById('withOS'),
    run: document.getElementById('run'),
    emu: document.getElementById('emu'),
    status: document.getElementById('status'),
    fname: document.getElementById('fname'),
    addfile: document.getElementById('addfile'),
    delfile: document.getElementById('delfile'),
    filetabs: document.getElementById('filetabs'),
    code: document.getElementById('code'),
    errlog: document.getElementById('errlog'),
    stagetabs: document.getElementById('stagetabs'),
    info: document.getElementById('info'),
    artifact: document.getElementById('artifact'),
  };

  const BACKENDS = ['hackcpu', 'riscv'];
  const RV_STEPS = 2000000;
  const RV_STATIC_BASE = 0x11000; // 與 lib/riscv/vm2riscv.js 的 STATIC_BASE 同值（第 0 檔 static 區）

  const { compileJack } = window.HackJack2Vm;
  const { translate } = window.HackVm2Asm;
  const { assemble } = window.HackAsm;
  const { Vm } = window.HackVM;
  const translateVm2Rv = window.HackVm2Rv ? window.HackVm2Rv.translate : null;
  const rvAssemble = window.HackRv ? window.HackRv.assemble : null;
  const rvDis = window.HackRv ? window.HackRv.disassemble : null;
  const RvEmu = window.HackRv ? window.HackRv.Emulator : null;
  const corpus = window.HACKJS_CORPUS;

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
  const STAGES_HACK = [{ id: 'vm', label: '.vm' }, { id: 'asm', label: '.asm' }, { id: 'hack', label: '.hack' }, { id: 'run', label: '▶執行' }];
  const STAGES_RV = [{ id: 'vm', label: '.vm' }, { id: 's', label: 'RISCV' }, { id: 'bc', label: 'bytecode' }, { id: 'run', label: '▶執行' }];
  const KEYS_HACK = ['vm', 'asm', 'hack', 'run'];
  const KEYS_RV = ['vm', 's', 'bytecode', 'run'];

  let fileState = { names: [], active: 0 };      // 自訂模式的檔案 tab
  let lastRun = { backend: 'hackcpu', vm: '', asm: '', hack: '', s: '', bytecode: '', run: '', fullAsm: '', fullS: '' };

  function jackSources(dir) {
    return Object.keys(corpus)
      .filter((k) => k.startsWith(dir + '/') && k.endsWith('.jack'))
      .sort();
  }

  function setStatus(s) { el.status.textContent = s; }

  function fillProgram() {
    el.program.innerHTML = '';
    for (const p of PROGRAMS) {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      el.program.appendChild(o);
    }
  }

  function currentProg() {
    return PROGRAMS.find((p) => p.name === el.program.value);
  }

  function buildTabs(names, active, onpick, onRename) {
    el.filetabs.innerHTML = '';
    names.forEach((name, i) => {
      const b = document.createElement('button');
      b.textContent = name;
      b.className = active === i ? 'on' : '';
      b.onclick = () => { fileState.active = i; redrawTabs(); el.code.value = getCustomSrc(i); };
      el.filetabs.appendChild(b);
    });
    if (el.mode.value === 'custom') {
      el.fname.value = names[active] ?? 'Main.jack';
    } else {
      const src = names[active];
      el.fname.value = src;
    }
  }

  function getCustomSrc(i) {
    const key = 'custom/' + fileState.names[i];
    return window.HACKJS_FS.read(key) ?? '';
  }

  function setCustomSrc(name, text) {
    window.HACKJS_FS.writeFileSync('custom/' + name, text);
  }

  function redrawTabs() {
    buildTabs(fileState.names, fileState.active);
  }

  function syncWithOS() {
    if (el.mode.value === 'builtin') {
      el.withOS.checked = currentProg().needsOS;
      el.withOS.disabled = true;
    } else {
      el.withOS.disabled = false;
    }
  }

  function applyMode() {
    syncWithOS();
    if (el.mode.value === 'builtin') {
      loadBuiltinProgram();
    } else {
      if (fileState.names.length === 0) {
        fileState.names = ['Main.jack'];
        if (!getCustomSrc(0)) setCustomSrc('Main.jack', 'class Main {\n  function void main() {\n    return;\n  }\n}');
        if (!getCustomSrc(0)) setCustomSrc('Main.jack', '');
      }
      redrawTabs();
      el.code.value = getCustomSrc(fileState.active);
    }
  }

  function loadBuiltinProgram() {
    const p = currentProg();
    const files = jackSources(p.dir).map((k) => k.split('/').pop());
    fileState.names = files;
    fileState.active = 0;
    redrawTabs();
    const first = jackSources(p.dir)[0];
    el.code.value = corpus[first] ?? '';
    setStatus('');
  }

  function userVmOf(files) {
    // files: [{path, src}]（src 為 .jack 原始碼，均為使用者模組，不含 OS）
    return files.map((f) => ({
      path: f.path.replace(/\.jack$/, '.vm'), src: compileJack(f.src).join('\n') + '\n',
    }));
  }

  function fullVmOf(userVm) {
    // 執行用全量：OS 在前、使用者模組在後
    if (!el.withOS.checked) return userVm;
    const osVm = jackSources(OS_DIR).map((k) => ({
      path: k.split('/').pop().replace(/\.jack$/, '.vm'), src: compileJack(corpus[k]).join('\n') + '\n',
    }));
    return osVm.concat(userVm);
  }

  function vmText(userVm) {
    return userVm.map((f) => `// File: ${f.path}\n${f.src}`).join('');
  }

  function runSim(hack, maxSteps) {
    const vm = new Vm();
    vm.loadHack(hack);
    vm.run(maxSteps);
    const rows = [];
    const r = vm.ram;
    rows.push(`PC = ${vm.pc}   MAX = ${maxSteps} 步`);
    rows.push(`RAM[0..16]  = ${Array.from(r.slice(0, 17)).join(', ')}`);
    rows.push(`RAM[16]     = ${r[16]}`);
    rows.push(`SCREEN      = ${SCREEN_WORDS} words（${vm.ram[SCREEN_BASE + SCREEN_WORDS - 1]} 最後 word）`);
    return rows.join('\n');
  }

  function runRv(words, maxSteps, singleFile) {
    const emu = new RvEmu();
    emu.loadWords(words, 0);
    for (let k = 0; k < maxSteps; k++) emu.step();
    const hex8 = (v) => '0x' + (v >>> 0).toString(16).padStart(8, '0');
    const sint = (v) => v | 0;
    const rows = [];
    rows.push(`RV32 執行（${maxSteps} 步跑滿即停；正常程式尾端是無窮迴圈，不 halt）`);
    rows.push(`steps = ${maxSteps}   PC = ${hex8(emu.pc)}   halted = ${emu.halted}`);
    rows.push(`ra  = ${hex8(emu.getReg(1))} (${sint(emu.getReg(1))})`);
    rows.push(`s1 (VM SP) = ${hex8(emu.getReg(9))} (${sint(emu.getReg(9))})`);
    rows.push(`a0  = ${hex8(emu.getReg(10))} (${sint(emu.getReg(10))})`);
    const st = [];
    for (let i = 0; i < 8; i++) st.push(emu.loadWord(RV_STATIC_BASE + i * 4));
    rows.push(`STATIC[0..7] @0x${RV_STATIC_BASE.toString(16)} = [${st.join(', ')}]`);
    rows.push(`STATIC[0] = ${st[0]}（第 0 檔 static 0，慣例為 Main 計算結果）`);
    rows.push(`UART = ${JSON.stringify(emu.uart)}`);
    if (singleFile) rows.push('註：單檔無 bootstrap（VM SP 未初始化），堆疊行為僅供參考。');
    return rows.join('\n');
  }

  function doRun() {
    el.run.disabled = true;
    setStatus('編譯＋執行中…');
    try {
      const backend = el.backend.value;
      if (!translateVm2Rv || !rvAssemble || !rvDis || !RvEmu) {
        if (backend === 'riscv') throw new Error('此 embed.js 未含 RISC-V 工具鏈，請重新整理頁面');
      }
      let files;
      let prog = currentProg();
      if (el.mode.value === 'builtin') {
        files = jackSources(prog.dir).map((k) => ({ path: k.split('/').pop(), src: corpus[k], custom: false }));
      } else {
        files = fileState.names.map((n) => ({ path: n, src: getCustomSrc(n), custom: true }));
        prog = { name: 'custom', needsOS: el.withOS.checked };
      }
      const t0 = performance.now();
      const userVm = userVmOf(files);
      let statusLine;
      if (backend === 'riscv') {
        // 顯示用（RISCV／bytecode 分頁）：只含使用者模組，不含 OS。
        // RISCV 分頁是 lenient 預覽（OS 呼叫列外部表頭）；bytecode 需模組可獨立組譯，
        // 含 OS 呼叫的模組只顯示原因。執行用全量（OS 在前、嚴格翻譯）。
        let sText;
        try {
          sText = translateVm2Rv(userVm, { lenient: true });
        } catch (err) {
          sText = `（RISC-V 後端無法轉換：${err.message}）\n`;
        }
        let bytecode;
        try {
          const strictS = translateVm2Rv(userVm); // 嚴格：未定義即 throw
          const uw = rvAssemble(strictS, { origin: 0 }).words;
          if (uw.length === 0) throw new Error('組譯結果為空');
          bytecode = rvDis(uw, 0).join('\n');
        } catch (err) {
          bytecode = `（此模組需 OS 全量才可組譯為 bytecode：${err.message}\n  ▶執行仍使用 OS 全量執行）\n`;
        }
        const fullVm = fullVmOf(userVm);
        let execS;
        try {
          execS = translateVm2Rv(fullVm);
        } catch (err) {
          throw new Error(`RISC-V 後端無法執行此程式：${err.message}`);
        }
        const { words } = rvAssemble(execS, { origin: 0 });
        if (words.length === 0) throw new Error('組譯結果為空');
        const runOut = runRv(words, RV_STEPS, fullVm.length === 1);
        lastRun = { backend, vm: vmText(userVm), s: sText, bytecode, run: runOut, fullS: execS };
        statusLine = `完成（RISCV）：${userVm.length} 個 .vm、${words.length} words RV32`;
      } else {
        const fullVm = fullVmOf(userVm);
        const asm = translate(userVm);
        const { hack, bin } = assemble(asm);
        if (bin.length === 0) throw new Error('組譯結果為空');
        const fullAsm = translate(fullVm);
        const fullHack = assemble(fullAsm).hack;
        const ramLines = fullHack.split('\n').filter((l) => l.trim()).length;
        let warn = '';
        if (ramLines > 32767) warn = `⚠ 注意：ROM ${ramLines} words 超過硬體 32K 上限（@x 只有 15 位址位元），模擬器可跑、實機不可載入。`;
        const maxSteps = 2000000;
        const runOut = runSim(fullHack, maxSteps);
        lastRun = { backend, vm: vmText(userVm), asm, hack, run: runOut, fullAsm };
        statusLine = `完成（HackCPU）：${userVm.length} 個 .vm、${ramLines} words ROM`;
      }
      const ms = Math.round(performance.now() - t0);
      setStatus(`${statusLine}、${ms}ms`);
      el.errlog.textContent = '✓ 編譯＋執行成功\n';
      showStage(0);
    } catch (err) {
      setStatus('失敗');
      el.errlog.textContent += err.message;
    } finally {
      el.run.disabled = false;
    }
  }

  function showStage(i) {
    const isRv = lastRun.backend === 'riscv';
    const defs = isRv ? STAGES_RV : STAGES_HACK;
    const keys = isRv ? KEYS_RV : KEYS_HACK;
    if (el.backend.value !== lastRun.backend) {
      // 切換後端後尚未執行：顯示空頁＋提示
      el.artifact.value = '';
      el.stagetabs.innerHTML = '';
      const cur = el.backend.value === 'riscv' ? STAGES_RV : STAGES_HACK;
      cur.forEach((s, j) => {
        const b = document.createElement('button');
        b.textContent = s.label;
        b.className = j === i ? 'on' : '';
        b.onclick = () => showStage(j);
        el.stagetabs.appendChild(b);
      });
      el.info.textContent = '（已切換後端，請按「編譯＋執行」）';
      return;
    }
    el.artifact.value = lastRun[keys[i]] ?? '';
    el.stagetabs.innerHTML = '';
    defs.forEach((s, j) => {
      const b = document.createElement('button');
      b.textContent = s.label;
      b.className = j === i ? 'on' : '';
      b.onclick = () => showStage(j);
      el.stagetabs.appendChild(b);
    });
    el.info.textContent = '';
  }

  function validBackend(b) {
    return BACKENDS.includes(b) ? b : 'hackcpu';
  }

  function mirrorHash() {
    if (el.mode.value !== 'builtin') return;
    history.replaceState(null, '',
      location.pathname + location.search + '#prog=' + el.program.value + '&backend=' + el.backend.value);
  }

  function syncEmu() {
    const rv = el.backend.value === 'riscv';
    el.emu.disabled = false;
    el.emu.textContent = rv ? '在 RISCV 模擬器跑 ▸' : '在 HACK 模擬器跑 ▸';
    el.emu.title = rv
      ? '把全量 RISCV 組語送到「RISCV 模擬器」（新視窗），可互動玩 Pong 並觀察暫存器/STATIC/螢幕'
      : '把編譯結果送到「HACK 模擬器」（新視窗），可互動玩 Pong 並觀察暫存器/RAM/螢幕';
  }

  el.mode.onchange = applyMode;
  el.program.onchange = () => {
    applyMode();
    mirrorHash();
  };
  el.backend.onchange = () => {
    syncEmu();
    showStage(0);
    mirrorHash();
  };
  el.run.onclick = doRun;

  // 送模擬器橋接（雙後端共用一台狀態機）：HackCPU 走 hackjs-* 到 index.html，
  // RISCV 走 rvjs-* 到 rvemu.html（送全量 .s）。
  const BRIDGES = {
    hackcpu: {
      win: 'hackjs-emu', home: 'index.html', ready: 'hackjs-ready', ping: 'hackjs-ping',
      pack: (t) => ({ type: 'hackjs-load', asm: t }),
      sent: (n) => `已送出 ${n} 字元組語到 HACK 模擬器（新視窗可玩可觀察）`,
    },
    riscv: {
      win: 'rvemu-win', home: 'rvemu.html', ready: 'rvjs-ready', ping: 'rvjs-ping',
      pack: (t) => ({ type: 'rvjs-load', s: t }),
      sent: (n) => `已送出 ${n} 字元 RISCV 組語到 RISCV 模擬器（新視窗可玩可觀察）`,
    },
  };
  const emuState = { win: null, ready: false, pending: null, pingT: null, tries: 0, bridgeName: 'hackcpu' };
  function emuReply() {
    const b = BRIDGES[emuState.bridgeName];
    if (emuState.pending !== null && emuState.ready && emuState.win && !emuState.win.closed && b) {
      emuState.win.postMessage(b.pack(emuState.pending), '*');
      setStatus(b.sent(emuState.pending.length));
      emuState.pending = null;
      if (emuState.pingT) { clearInterval(emuState.pingT); emuState.pingT = null; }
    }
  }
  function emuPing() {
    if (emuState.pingT) { clearInterval(emuState.pingT); emuState.pingT = null; }
    emuState.tries = 0;
    emuState.pingT = setInterval(() => {
      const b = BRIDGES[emuState.bridgeName];
      if (emuState.pending === null || emuState.ready || !emuState.win || emuState.win.closed || !b) {
        clearInterval(emuState.pingT); emuState.pingT = null; return;
      }
      try { emuState.win.postMessage({ type: b.ping }, '*'); } catch (_) {}
      emuState.tries++;
      if (emuState.tries === 15 && emuState.win && !emuState.win.closed) {
        setStatus('模擬器無回應，強制重新載入一次…');
        try { emuState.win.location.href = b.home + '?er=' + Date.now(); } catch (_) {}
        emuState.ready = false;
        emuState.tries = 0;
      } else if (emuState.tries > 22) {
        clearInterval(emuState.pingT); emuState.pingT = null;
        setStatus('模擬器視窗一直未回應（請對該視窗按 ⌘⇧R 重新整理後重試）');
      }
    }, 250);
  }
  window.addEventListener('message', (e) => {
    const d = e.data || {};
    const b = BRIDGES[emuState.bridgeName];
    if (b && d.type === b.ready && emuState.win && !emuState.win.closed) {
      emuState.ready = true;
      emuReply();
    }
  });
  el.emu.onclick = () => {
    const rv = el.backend.value === 'riscv';
    const want = rv ? 'riscv' : 'hackcpu';
    if (lastRun.backend !== el.backend.value || (rv ? !lastRun.fullS : !lastRun.hack)) doRun();
    const text = rv ? lastRun.fullS : lastRun.fullAsm;
    if (!text) return;
    if (!emuState.win || emuState.win.closed || emuState.bridgeName !== want) {
      emuState.win = window.open(rv ? 'rvemu.html' : 'index.html', rv ? 'rvemu-win' : 'hackjs-emu');
      emuState.ready = false;
      emuState.bridgeName = want;
    }
    emuState.pending = text;
    if (emuState.ready) emuReply();
    else { setStatus('等待模擬器就緒…'); emuPing(); }
  };
  el.addfile.onclick = () => {
    const n = el.fname.value.trim();
    if (!n.endsWith('.jack')) { el.errlog.textContent = '檔名需以 .jack 結尾'; return; }
    if (fileState.names.includes(n)) { el.errlog.textContent = `已有 ${n}`; return; }
    fileState.names.push(n);
    fileState.active = fileState.names.length - 1;
    setCustomSrc(n, '');
    redrawTabs();
    el.code.value = '';
  };
  el.delfile.onclick = () => {
    if (fileState.names.length <= 1) return;
    fileState.names.splice(fileState.active, 1);
    if (fileState.active >= fileState.names.length) fileState.active = fileState.names.length - 1;
    redrawTabs();
    el.code.value = getCustomSrc(fileState.active);
  };
  el.code.oninput = () => {
    if (el.mode.value === 'custom') setCustomSrc(fileState.names[fileState.active], el.code.value);
  };

  fillProgram();
  applyMode();
  syncEmu();
  showStage(0);
  el.status.textContent = `語料 ${Object.keys(corpus).length} 檔`;

  // ---- v1.2 書籤/深連結：#prog=Pong（&run=1 &backend=riscv）或 #Pong（!run）----
  function hashWant() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return null;
    let h;
    try { h = decodeURIComponent(raw); } catch (_) { h = raw; }
    if (/^(prog|run|backend)=/.test(h)) {
      const hp = new URLSearchParams(h);
      return { prog: hp.get('prog'), run: hp.get('run') === '1', backend: hp.get('backend') };
    }
    const m = /^(.*)!run$/.exec(h);
    return m ? { prog: m[1], run: true, backend: null } : { prog: h, run: false, backend: null };
  }

  function applyWant() {
    const q = new URLSearchParams(location.search);
    const wh = hashWant();
    const wantProg = (wh && wh.prog) ?? q.get('prog');
    const autoRun = (wh ? wh.run : false) || q.get('run') === '1';
    const wantBackend = validBackend((wh && wh.backend) ?? q.get('backend') ?? 'hackcpu');
    el.backend.value = wantBackend;
    syncEmu();
    if (wantProg && PROGRAMS.some((p) => p.name === wantProg)) {
      el.program.value = wantProg;
      applyMode();
    }
    showStage(0);
    if (wantProg && autoRun) setTimeout(doRun, 50);
  }

  applyWant();
  window.addEventListener('hashchange', applyWant);
})();