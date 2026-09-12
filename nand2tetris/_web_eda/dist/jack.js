/* jack.html 頁面邏輯：內建 Jack 程式（需 OS / 無 OS / 虛擬 chain）＋自訂多檔貼上。
   管線全在瀏覽器：compileJack → translate（多檔 bootstrap，OS 排最前）→ assemble → hackemu。 */
(() => {
  'use strict';
  const el = {
    mode: document.getElementById('mode'),
    program: document.getElementById('program'),
    withOS: document.getElementById('withOS'),
    run: document.getElementById('run'),
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

  const { compileJack } = window.HackJack2Vm;
  const { translate } = window.HackVm2Asm;
  const { assemble } = window.HackAsm;
  const { Vm } = window.HackVM;
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
  const STAGES = [{ id: 'vm', label: '.vm' }, { id: 'asm', label: '.asm' }, { id: 'hack', label: '.hack' }, { id: 'run', label: '▶執行' }];

  let fileState = { names: [], active: 0 };      // 自訂模式的檔案 tab
  let lastRun = { vm: '', asm: '', hack: '', bootstrapped: false };

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

  function compileAll(files) {
    // files: [{path, src}]（src 為 .jack 原始碼）；回傳 .vm 字串列表
    const vmFiles = [];
    if (files.some((f) => f.custom) && el.withOS.checked) {
      for (const k of jackSources(OS_DIR)) {
        vmFiles.push({ path: k.split('/').pop().replace(/\.jack$/, '.vm'), src: compileJack(corpus[k]).join('\n') + '\n' });
      }
    }
    for (const f of files) {
      vmFiles.push({ path: f.path.replace(/\.jack$/, '.vm'), src: compileJack(f.src).join('\n') + '\n' });
    }
    const asm = translate(vmFiles);
    const { hack, bin } = assemble(asm);
    return { vmFiles, asm, hack, bin };
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

  function doRun() {
    el.run.disabled = true;
    setStatus('編譯＋執行中…');
    try {
      let files;
      let prog = currentProg();
      if (el.mode.value === 'builtin') {
        files = jackSources(prog.dir).map((k) => ({ path: k.split('/').pop(), src: corpus[k], custom: false }));
      } else {
        files = fileState.names.map((n) => ({ path: n, src: getCustomSrc(n), custom: true }));
        prog = { name: 'custom', needsOS: el.withOS.checked };
      }
      const t0 = performance.now();
      const { vmFiles, asm, hack, bin } = compileAll(files);
      if (bin.length === 0) throw new Error('組譯結果為空');
      const ramLines = hack.split('\n').filter((l) => l.trim()).length;
      let warn = '';
      if (ramLines > 32767) warn = `⚠ 注意：ROM ${ramLines} words 超過硬體 32K 上限（@x 只有 15 位址位元），模擬器可跑、實機不可載入。`;
      const maxSteps = 2000000;
      const runOut = runSim(hack, maxSteps);
      lastRun = { vm: vmFiles.map((f) => `// File: ${f.path}\n${f.src}`).join(''), asm, hack, run: runOut };
      const ms = Math.round(performance.now() - t0);
      setStatus(`完成：${vmFiles.length} 個 .vm、${ramLines} words ROM、${ms}ms`);
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
    const keys = ['vm', 'asm', 'hack', 'run'];
    el.artifact.value = lastRun[keys[i]] ?? '';
    el.stagetabs.innerHTML = '';
    STAGES.forEach((s, j) => {
      const b = document.createElement('button');
      b.textContent = s.label;
      b.className = j === i ? 'on' : '';
      b.onclick = () => showStage(j);
      el.stagetabs.appendChild(b);
    });
    el.info.textContent = '';
  }

  el.mode.onchange = applyMode;
  el.program.onchange = () => { applyMode(); };
  el.run.onclick = doRun;
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
  showStage(0);
  el.status.textContent = `語料 ${Object.keys(corpus).length} 檔`;
})();