/* Nand2Tetris 互動式教材 — 共通腳本（book.js）
   依賴（頁面裡要先依序載入）：
     ../_web_eda/dist/corpus.js   → window.HACKJS_CORPUS（內建語料）
     ../_web_eda/dist/hdl-rt.js   → HACKJS_FS / HACKJS_PATH（唯讀 fs shim）
     ../_web_eda/dist/embed.js    → HackHdl / HackAsm / HackVm2Asm / HackJack2Vm / HackVM
   本檔提供：章節導覽、習題進度(localStorage)、以及互動元件
     N2T.hdl()   HDL 模擬（跑 .tst、比對 .cmp）
     N2T.emu()   組譯器＋HACK 虛擬機（Step/Run/螢幕/鍵盤）
     N2T.vm()    VM→組語 翻譯＋執行
     N2T.jack()  Jack 全鏈路（compiler→vm→asm→模擬）
 */
(() => {
  'use strict';

  const PROG_KEY = 'n2tbook-progress';

  const CHAPTERS = [
    { f: 'index', k: '總覽', t: '課程總覽與習題導覽' },
    { f: 'ch00', k: '第 0 章', t: '導論：Nand2Tetris' },
    { f: 'ch01', k: '第 1 章', t: '布林邏輯' },
    { f: 'ch02', k: '第 2 章', t: '算術單元' },
    { f: 'ch03', k: '第 3 章', t: '記憶單元' },
    { f: 'ch04', k: '第 4 章', t: '機器語言' },
    { f: 'ch05', k: '第 5 章', t: '計算機結構' },
    { f: 'ch06', k: '第 6 章', t: '組譯器' },
    { f: 'ch07', k: '第 7 章', t: 'VM：堆疊與算術' },
    { f: 'ch08', k: '第 8 章', t: 'VM：函式與控制流' },
    { f: 'ch09', k: '第 9 章', t: '高階語言' },
    { f: 'ch10', k: '第 10 章', t: '編譯器' },
    { f: 'ch11', k: '第 11 章', t: 'Jack 語言與編譯器' },
    { f: 'ch12', k: '第 12 章', t: '作業系統' },
  ];
  const exCount = {};

  /* ================= 工具 ================= */
  const elt = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const corpus = () => window.HACKJS_CORPUS || {};
  const dirnameOf = (p) => { const s = String(p).split('/'); s.pop(); return s.join('/') || '.'; };
  const stripBanner = (s) => {
    const lines = String(s == null ? '' : s).split('\n');
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i < lines.length && /This file is part of www\.nand2tetris\.org/.test(lines[i])) {
      while (i < lines.length && /^\s*\/\//.test(lines[i])) i++;
      if (i < lines.length && lines[i].trim() === '') i++;
    }
    return lines.slice(i).join('\n');
  };

  let hdlLibCache = null;
  function fullLib() {
    if (hdlLibCache) return hdlLibCache;
    const { loadLibrary, mergeLibs } = window.HackHdl;
    let lib = {};
    for (const d of ['../01', '../02', '../03/a', '../03/b', '../05', '../04/mult', '../04/fill', 'gen/chain']) {
      lib = mergeLibs(lib, loadLibrary(d));
    }
    hdlLibCache = lib;
    return lib;
  }

  /* ================= 進度 ================= */
  function loadProg() {
    try { return JSON.parse(localStorage.getItem(PROG_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProg(p) { try { localStorage.setItem(PROG_KEY, JSON.stringify(p)); } catch (e) { } }
  function isDone(id) { return !!loadProg()[id]; }
  function setDone(id, v) {
    const p = loadProg();
    if (v) p[id] = true; else delete p[id];
    saveProg(p);
  }
  function chapterIds(f) {
    if (!exCount[f]) {
      exCount[f] = new Set();
      $$('[data-ex-id]').forEach((e) => {
        const id = e.getAttribute('data-ex-id');
        if (id && id.startsWith(f + '-')) exCount[f].add(id);
      });
    }
    return exCount[f];
  }
  function chapterPct(f) {
    const ids = chapterIds(f);
    if (ids.size === 0) return 1;
    return [...ids].filter(isDone).length / ids.size;
  }
  function bindDoneToggles() {
    $$('[data-ex-id]').forEach((box) => {
      const id = box.getAttribute('data-ex-id');
      box.checked = isDone(id);
      box.addEventListener('change', () => { setDone(id, box.checked); refreshSidebar(); });
    });
  }
  function refreshSidebar() {
    $$('.sidebar nav a[data-f]').forEach((a) => {
      const dot = $1('.dot', a);
      if (dot) dot.classList.toggle('on', chapterPct(a.getAttribute('data-f')) >= 1);
    });
    const bar = $1('.sidebar .progbar > div');
    if (bar) {
      const done = CHAPTERS.filter((c) => c.f !== 'index').reduce((s, c) => s + chapterPct(c.f), 0);
      const p = Math.round((done / (CHAPTERS.length - 1)) * 100);
      bar.style.width = p + '%';
      const t = $1('.sidebar .progtext');
      if (t) t.textContent = `整體進度 ${p}%`;
    }
  }
  const $1 = (sel, root) => (root || document).querySelector(sel);

  /* ================= 導覽 ================= */
  function ensureLayout() {
    let layout = $1('body > .layout');
    if (layout) return layout;
    const mainwrap = elt('div', 'mainwrap');
    $$('body > *').forEach((n) => {
      if (n.tagName === 'SCRIPT' || n.classList.contains('sidebar') || n.classList.contains('layout')) return;
      mainwrap.appendChild(n);
    });
    layout = elt('div', 'layout');
    layout.appendChild(mainwrap);
    document.body.insertBefore(layout, document.body.firstChild);
    return layout;
  }

  function buildSidebar(cur) {
    const aside = elt('aside', 'sidebar');
    const brand = elt('a', 'brand'); brand.href = 'index.html';
    const h1 = elt('h1', null, '計算機結構');
    const sub = elt('div', 'sub', 'Nand2Tetris 互動教材 · 115');
    brand.appendChild(h1); brand.appendChild(sub);
    const nav = elt('nav');
    const pbar = elt('div', 'progbar'); pbar.appendChild(elt('div'));
    nav.appendChild(pbar);
    nav.appendChild(elt('div', 'progtext', ''));
    for (const c of CHAPTERS) {
      const a = elt('a'); a.href = c.f + '.html';
      a.setAttribute('data-f', c.f);
      if (c.f === cur) a.classList.add('active');
      const dot = elt('span', 'dot');
      a.appendChild(dot);
      a.appendChild(elt('span', null, ' ' + c.k + '　' + c.t));
      nav.appendChild(a);
    }
    aside.appendChild(brand);
    aside.appendChild(nav);
    const layout = ensureLayout();
    layout.insertBefore(aside, layout.firstChild);
    refreshSidebar();
  }

  function buildToolbar(cur) {
    const bar = elt('div', 'toolbar');
    const toc = elt('button', 'toc-btn', '☰ 目錄');
    toc.addEventListener('click', () => { location.href = 'index.html'; });
    const pager = elt('div', 'chpager');
    const idx = CHAPTERS.findIndex((c) => c.f === cur);
    const nav = (dir) => { const j = idx + dir; return (j >= 0 && j < CHAPTERS.length) ? CHAPTERS[j] : null; };
    pager.appendChild(elt('span', 'cur', idx >= 0 ? CHAPTERS[idx].k : ''));
    const prev = nav(-1);
    if (prev) { const a = elt('a', 'prev', '← ' + prev.k); a.href = prev.f + '.html'; pager.appendChild(a); }
    pager.appendChild(elt('span', 'cur', '·'));
    const next = nav(1);
    if (next) { const a = elt('a', 'next', next.k + ' →'); a.href = next.f + '.html'; pager.appendChild(a); }
    bar.appendChild(toc);
    bar.appendChild(elt('span', 'spacer'));
    bar.appendChild(pager);
    ensureLayout().querySelector('.mainwrap').insertBefore(bar, ensureLayout().querySelector('.mainwrap').firstChild);
  }

  /* ================= HDL 模擬 ================= */
  function parseOutTable(text) {
    const lines = text.split('\n').filter((l) => l.includes('|'));
    if (lines.length === 0) return { header: [], rows: [] };
    const header = lines[0].split('|').slice(1, -1).map((s) => s.trim());
    const separator = 1 < lines.length && /-+/.test(lines[1]) ? 1 : 0;
    const rows = [];
    for (let i = 1 + separator; i < lines.length; i++) {
      const cells = lines[i].split('|').slice(1, -1).map((s) => s.trim());
      if (cells.every((c) => c === '')) continue;
      rows.push(cells);
    }
    return { header, rows };
  }
  function renderOutTable(host, outText, cmpText) {
    host.innerHTML = '';
    const { header, rows } = parseOutTable(outText);
    if (header.length === 0) {
      host.appendChild(elt('pre', null, outText || '（無輸出）'));
      return;
    }
    const expected = cmpText ? parseOutTable(cmpText) : null;
    const MAX = 60;
    const badSet = new Set();
    if (expected && expected.rows.length === rows.length) {
      for (let i = 0; i < rows.length; i++) {
        if (JSON.stringify(rows[i]) !== JSON.stringify(expected.rows[i])) badSet.add(i);
      }
    }
    const table = elt('table', 'out');
    const th = elt('tr');
    header.forEach((h) => th.appendChild(elt('th', null, h)));
    table.appendChild(th);
    const show = rows.slice(0, MAX);
    for (let i = 0; i < show.length; i++) {
      const tr = elt('tr');
      cells2tds(tr, rows[i], badSet.has(i));
      table.appendChild(tr);
    }
    host.appendChild(table);
    if (rows.length > MAX) host.appendChild(elt('pre', null, `… 共 ${rows.length} 列，僅顯示前 ${MAX} 列`));
  }
  function cells2tds(tr, cells, bad) {
    cells.forEach((c) => tr.appendChild(elt('td', bad ? 'mism' : null, c)));
  }

  function N2Thdl(host, cfg) {
    const { mergeLibs, elab, generateJs, topClassExpr, parseScript, run, TopModel } = window.HackHdl;
    const dir = cfg.dir, top = cfg.top;
    const ref = (v) => (typeof v === 'string' && v.charAt(0) === '#')
      ? ((document.getElementById(v.slice(1)) || {}).textContent || '')
      : (v !== undefined ? v : undefined);
    const solution = stripBanner(cfg.hdl !== undefined ? ref(cfg.hdl) : (corpus()[`${dir}/${top}.hdl`] || `CHIP ${top} {\n  // 在此撰寫 ${top} 的線路\n}`));
    const tstDefault = stripBanner(cfg.tst !== undefined ? ref(cfg.tst) : (corpus()[`${dir}/${cfg.tstFile || top + '.tst'}`] || ''));
    const cmpDefault = stripBanner(cfg.cmp !== undefined ? ref(cfg.cmp) : (corpus()[`${dir}/${cfg.cmpFile || top + '.cmp'}`] || ''));

    const sim = elt('div', 'sim');
    const head = elt('div', 'simhead');
    head.appendChild(elt('span', null, 'HackHDL 模擬器'));
    if (cfg.dirLabel) head.appendChild(elt('span', 'hint', cfg.dirLabel));
    head.appendChild(elt('span', 'spacer'));
    const runBtn = elt('button', 'primary', '▶ 執行 .tst');
    const resetBtn = elt('button', null, '↺ 重設解答');
    head.appendChild(resetBtn); head.appendChild(runBtn);
    sim.appendChild(head);

    const body = elt('div', 'simbody');
    const left = elt('label', 'block');
    left.appendChild(elt('span', null, '‧ 晶片原始碼（可編輯後重新執行）'));
    const ta = elt('textarea', 'code'); ta.value = solution; ta.spellcheck = false;
    left.appendChild(ta);
    body.appendChild(left);

    const right = elt('div', 'block');
    right.appendChild(elt('span', null, '‧ 執行結果（與期望值比對）'));
    const banner = elt('div', 'banner');
    const outbox = elt('div', 'outbox');
    const errbox = elt('div', 'errbox');
    right.appendChild(banner); right.appendChild(outbox); right.appendChild(errbox);
    body.appendChild(right);
    sim.appendChild(body);

    const tstName = cfg.tstName || (cfg.tstFile || top + '.tst');
    const td = elt('details', 'src');
    td.appendChild(elt('summary', null, `查看測試腳本（${tstName}）`));
    td.appendChild(elt('pre', null, tstDefault));
    sim.appendChild(td);
    if (cmpDefault.trim()) {
      const cd = elt('details', 'src');
      cd.appendChild(elt('summary', null, `期望輸出（${top}.cmp）`));
      cd.appendChild(elt('pre', null, cmpDefault));
      sim.appendChild(cd);
    }
    host.appendChild(sim);

    resetBtn.addEventListener('click', () => { ta.value = solution; });

    runBtn.addEventListener('click', () => {
      runBtn.disabled = true;
      banner.className = 'banner';
      errbox.textContent = '';
      try {
        let edited;
        try {
          edited = window.HackHdl.parseHdl(ta.value);
        } catch (e) {
          throw new Error('HDL 語法錯誤：' + e.message);
        }
        const lib = mergeLibs(fullLib(), { [edited.name]: Object.assign({}, edited, { source: ta.value }) });
        const script = parseScript(tstDefault);
        const topName = script.load ? script.load.replace(/\.hdl$/i, '') : (cfg.tstTop || edited.name);
        if (cfg.customCompare) {
          window.HACKJS_FS.writeFileSync(`${dir}/${cfg.customCompare}`, cmpDefault);
        }
        const e = elab(lib, topName);
        const src = generateJs(e);
        const TopClass = new Function(`${src}\nreturn ${topClassExpr(e)};`)();
        const model = new TopModel(TopClass, e.chips[e.top]);
        const out = [];
        let error = null;
        try {
          run(model, script, dir, out, false);
        } catch (err) {
          error = err;
        }
        renderOutTable(outbox, out.join(''), cmpDefault);
        if (error) {
          banner.className = 'banner fail';
          banner.textContent = '✗ 未通過：輸出與期望值不同或執行錯誤';
          errbox.textContent = String(error.message || error);
        } else if (cmpDefault) {
          banner.className = 'banner pass';
          banner.textContent = '✓ 通過：輸出與期望值完全一致！';
        } else {
          banner.className = 'banner pass';
          banner.textContent = '✓ 執行完成（未提供 .cmp，僅顯示輸出）';
        }
      } catch (err) {
        banner.className = 'banner fail';
        banner.textContent = '✗ 失敗';
        errbox.textContent = String(err.message || err);
      } finally {
        runBtn.disabled = false;
      }
    });
  }

  /* ================= HACK 組語／虛擬機 ================= */
  function buildListing(asmText, hack) {
    const { parseAsmLine } = window.HackAsm;
    const ins = [];
    let addr = 0;
    for (const raw of asmText.split('\n')) {
      const code = parseAsmLine(raw);
      if (code === '') continue;
      if (code[0] === '(') {
        ins.push({ kind: 'label', text: `(${code.slice(1, code.indexOf(')'))})   address=${addr}` });
      } else {
        ins.push({ kind: 'ins', addr, src: code });
        addr++;
      }
    }
    const hackLines = hack.trim() === '' ? [] : hack.trim().split('\n');
    let hi = 0;
    return ins.map((x) => {
      if (x.kind === 'label') return x;
      const bin = hackLines[hi++] || '';
      const hex = parseInt(bin, 2).toString(16).toUpperCase().padStart(4, '0');
      const a = x.addr.toString(16).toUpperCase().padStart(2, '0');
      return { kind: 'ins', addr: x.addr, text: ` ${a}: ${x.src}   ${bin}  ${hex}` };
    });
  }
  function screenSnapshot(vm, canvas) {
    if (!canvas || !vm) return;
    const ctx = canvas.getContext('2d');
    const W = 512, H = 256;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    for (let r = 0; r < H; r++) {
      const base = r * 32;
      for (let c16 = 0; c16 < 32; c16++) {
        const word = vm.ram[16384 + base + c16];
        for (let b = 0; b < 16; b++) {
          const on = (word & (1 << (15 - b))) !== 0;
          const idx = ((r * W) + (c16 * 16 + b)) * 4;
          d[idx] = on ? 0 : 255; d[idx + 1] = on ? 0 : 255; d[idx + 2] = on ? 0 : 255; d[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function N2Temu(host, cfg) {
    const { Vm } = window.HackVM;
    const { assemble } = window.HackAsm;
    const refT = (v) => (v !== undefined && typeof v === 'string' && v.charAt(0) === '#')
      ? ((document.getElementById(v.slice(1)) || {}).textContent || '')
      : v;
    const asmDefault = stripBanner(cfg.asm !== undefined ? refT(cfg.asm) : (cfg.file ? (corpus()[cfg.file] || '') : ''));
    const showScreen = cfg.screen === true;
    const maxRun = cfg.maxRun || 60000;

    const sim = elt('div', 'sim');
    const head = elt('div', 'simhead');
    head.appendChild(elt('span', null, 'HACK 組譯器 ＋ 虛擬機'));
    if (cfg.hint) head.appendChild(elt('span', 'hint', cfg.hint));
    head.appendChild(elt('span', 'spacer'));
    const resetBtn = elt('button', null, '↺ 重設解答');
    head.appendChild(resetBtn);
    sim.appendChild(head);

    const body = elt('div', 'simbody');
    const left = elt('label', 'block');
    left.appendChild(elt('span', null, '‧ 來源（.asm，可編輯）'));
    const ta = elt('textarea', 'code'); ta.value = asmDefault; ta.spellcheck = false;
    left.appendChild(ta);
    body.appendChild(left);

    const right = elt('div', 'block');
    right.appendChild(elt('span', null, '‧ 機器碼與暫存器'));
    const banner = elt('div', 'banner');
    const listingEl = elt('div', 'listing');
    listingEl.appendChild(elt('div', 'line', '（尚未組譯）'));
    const regsEl = elt('div', 'regs', '');
    right.appendChild(banner); right.appendChild(listingEl); right.appendChild(regsEl);
    body.appendChild(right);
    sim.appendChild(body);

    const toolbar = elt('div', 'simhead');
    const asmBtn = elt('button', null, '↺ 重組譯');
    const stepBtn = elt('button', 'primary', 'Step');
    const run1k = elt('button', null, 'Run 1k');
    const runBig = elt('button', null, `Run ${maxRun >= 1000 ? Math.round(maxRun / 1000) + 'k' : maxRun}`);
    const setupLabel = elt('label'); setupLabel.style.cssText = 'display:flex;gap:5px;align-items:center;color:var(--mono-dim);font-size:12px';
    setupLabel.appendChild(elt('span', null, 'RAM 預設'));
    const setupInput = elt('input'); setupInput.type = 'text'; setupInput.style.width = '130px';
    setupInput.placeholder = '0=3 1=5';
    if (cfg.setup) setupInput.value = cfg.setup;
    setupLabel.appendChild(setupInput);
    toolbar.appendChild(asmBtn);
    toolbar.appendChild(stepBtn);
    toolbar.appendChild(run1k);
    toolbar.appendChild(runBig);
    let keyInput = null, keyBtn = null;
    if (cfg.keys) {
      const kl = elt('label'); kl.style.cssText = 'display:flex;gap:5px;align-items:center;color:var(--mono-dim);font-size:12px';
      kl.appendChild(elt('span', null, 'KBD'));
      keyInput = elt('input'); keyInput.type = 'number'; keyInput.style.width = '64px'; keyInput.placeholder = '0';
      keyBtn = elt('button', null, '設鍵');
      kl.appendChild(keyInput); kl.appendChild(keyBtn);
      toolbar.appendChild(kl);
    }
    toolbar.appendChild(setupLabel);
    toolbar.appendChild(elt('span', 'spacer'));
    if (showScreen) toolbar.appendChild(elt('span', 'hint', '黑底=畫素 1（白）· 執行後更新螢幕'));
    sim.appendChild(toolbar);

    let canvas = null;
    if (showScreen) {
      canvas = elt('canvas', 'scr'); canvas.width = 512; canvas.height = 256;
      sim.appendChild(canvas);
    }
    host.appendChild(sim);

    let vm = null, listing = [], curText = null;

    const setBanner = (text, cls) => {
      if (!text) { banner.className = 'banner'; banner.textContent = ''; return; }
      banner.className = 'banner ' + cls;
      banner.textContent = text;
    };
    const renderListing = () => {
      listingEl.innerHTML = '';
      listing.forEach((row) => {
        const div = elt('div', 'line'); div.textContent = row.text;
        if (row.kind === 'ins') div.dataset.pc = row.addr;
        listingEl.appendChild(div);
      });
    };
    const renderRegs = () => {
      if (!vm) return;
      const r = vm.ram;
      const rows = [
        ['PC', vm.pc], ['A', vm.a], ['D', vm.d], ['用途 RAM[0..15]（可設 RAM 預設後重新執行）', ''],
        ['R0(=SP)', r[0]], ['R1(=LCL)', r[1]], ['R2(=ARG)', r[2]], ['R3(=THIS)', r[3]], ['R4(=THAT)', r[4]],
      ];
      for (let i = 5; i < 16; i++) rows.push([`R${i}`, r[i]]);
      const sp = r[0];
      const base = (sp >= 254) ? 256 : Math.max(0, sp - 2);
      for (let i = 0; i < 8; i++) rows.push([`RAM[${base + i}]`, r[base + i]]);
      const html = rows.map(([k, v]) => `<div class="row"><span class="n">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');
      regsEl.innerHTML = html;
    };
    const highlight = (pc) => {
      $$('.line', listingEl).forEach((d) => {
        d.classList.toggle('cur', d.dataset.pc !== undefined && Number(d.dataset.pc) === pc);
      });
      const cur = $$('.line', listingEl).find((d) => d.dataset.pc !== undefined && Number(d.dataset.pc) === pc);
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    };
    const doAssemble = () => {
      curText = ta.value;
      try {
        const res = assemble(ta.value);
        listing = buildListing(ta.value, res.hack);
        vm = new Vm(); vm.loadHack(res.hack);
        renderListing(); renderRegs(); highlight(-1);
        setBanner(`✓ 組譯完成：${res.hack.trim() === '' ? 0 : res.hack.trim().split('\n').length} 條指令`, 'pass');
        if (canvas) screenSnapshot(vm, canvas);
        return true;
      } catch (e) {
        listingEl.innerHTML = '';
        listingEl.appendChild(elt('pre', null, String(e.message || e)));
        setBanner('✗ 組譯失敗', 'fail');
        return false;
      }
    };
    const ensureVm = () => {
      if (!vm || ta.value !== curText) return doAssemble();
      return !!vm;
    };
    const stepOnce = () => {
      if (!ensureVm()) return;
      const pc0 = vm.pc;
      vm.step();
      renderRegs(); highlight(vm.pc);
      if (canvas) screenSnapshot(vm, canvas);
      if (vm.pc >= vm.rom.length) setBanner('✓ 程式結束（PC 超出 ROM）', 'pass');
      else setBanner('');
    };
    const doRun = (n) => {
      if (!ensureVm()) return;
      vm.run(n);
      renderRegs(); highlight(vm.pc);
      if (canvas) screenSnapshot(vm, canvas);
      setBanner(vm.pc >= vm.rom.length ? '✓ 已執行至程式結束' : `✓ 已執行 ${n} 步（PC=${vm.pc}）`, 'pass');
    };

    asmBtn.addEventListener('click', doAssemble);
    resetBtn.addEventListener('click', () => { ta.value = asmDefault; doAssemble(); });
    stepBtn.addEventListener('click', stepOnce);
    run1k.addEventListener('click', () => doRun(1000));
    runBig.addEventListener('click', () => doRun(maxRun));
    setupInput.addEventListener('change', () => {
      if (!ensureVm()) return;
      const m = setupInput.value.match(/\d+\s*[=:]\s*-?\d+/g);
      if (m) for (const g of m) {
        const mm = g.match(/(\d+)\s*[=:]\s*(-?\d+)/);
        vm.ram[Number(mm[1])] = (Number(mm[2]) + 0x10000) % 0x10000;
      }
      renderRegs();
    });
    if (keyBtn) keyBtn.addEventListener('click', () => {
      if (!ensureVm()) return;
      vm.setKey(Number(keyInput.value) | 0);
      setBanner(`鍵盤 KBD = ${vm.ram[24576]}`, 'pass');
    });

    doAssemble();
    if (cfg.setup) {
      const m = cfg.setup.match(/\d+\s*[=:]\s*-?\d+/g);
      if (m) for (const g of m) {
        const mm = g.match(/(\d+)\s*[=:]\s*(-?\d+)/);
        vm.ram[Number(mm[1])] = (Number(mm[2]) + 0x10000) % 0x10000;
      }
      renderRegs();
    }
    if (cfg.autoRun) doRun(cfg.autoRun);
  }

  /* ================= VM → 組語 ================= */
  function N2Tvm(host, cfg) {
    const { translate } = window.HackVm2Asm;
    const refSrc = (v) => (v !== undefined && typeof v === 'string' && v.charAt(0) === '#')
      ? ((document.getElementById(v.slice(1)) || {}).textContent || '')
      : v;
    const inlineSrc = cfg.src !== undefined ? stripBanner(refSrc(cfg.src)) : undefined;
    const filesDefault = cfg.files || [{ path: (cfg.file || 'in.vm').split('/').pop(), src: inlineSrc !== undefined ? inlineSrc : stripBanner(corpus()[cfg.file] || '') }];

    const sim = elt('div', 'sim');
    const head = elt('div', 'simhead');
    head.appendChild(elt('span', null, 'VM→組語 翻譯器'));
    if (cfg.hint) head.appendChild(elt('span', 'hint', cfg.hint));
    head.appendChild(elt('span', 'spacer'));
    const goBtn = elt('button', 'primary', '▶ 翻譯 .vm');
    const runBtn = elt('button', null, '組譯並執行 ▸');
    head.appendChild(runBtn); head.appendChild(goBtn);
    sim.appendChild(head);

    const body = elt('div', 'simbody');
    const left = elt('label', 'block');
    left.appendChild(elt('span', null, '‧ VM 原始碼（可編輯）'));
    const ta = elt('textarea', 'code'); ta.value = filesDefault[0].src; ta.spellcheck = false;
    left.appendChild(ta);
    body.appendChild(left);

    const right = elt('div', 'block');
    right.appendChild(elt('span', null, '‧ 翻譯結果（.asm）'));
    const outAsm = elt('div', 'outbox');
    outAsm.appendChild(elt('pre', null, '（尚未翻譯）'));
    right.appendChild(outAsm);
    body.appendChild(right);
    sim.appendChild(body);
    host.appendChild(sim);

    let asmText = '';
    const doTranslate = () => {
      try {
        const files = filesDefault.map((f, i) => (i === 0 ? { path: f.path, src: ta.value } : f));
        asmText = translate(files);
        outAsm.innerHTML = '';
        outAsm.appendChild(elt('pre', null, asmText));
        goBtn.textContent = '↻ 重新翻譯';
        return true;
      } catch (e) {
        outAsm.innerHTML = '';
        outAsm.appendChild(elt('pre', null, String(e.message || e)));
        return false;
      }
    };
    goBtn.addEventListener('click', doTranslate);
    runBtn.addEventListener('click', () => {
      runBtn.disabled = true;
      if (!doTranslate()) { runBtn.disabled = false; return; }
      const panel = elt('div');
      host.appendChild(panel);
      N2Temu(panel, {
        asm: asmText,
        hint: 'VM 翻譯結果直接送入虛擬機（多檔會帶 bootstrap）',
        screen: false,
        maxRun: cfg.maxRun || 20000,
        setup: cfg.setup,
        keys: false,
      });
    });
    if (cfg.auto) doTranslate();
  }

  /* ================= Jack 全鏈路 ================= */
  const JACK_PROGRAMS = [
    { name: 'Seven', dir: '../11/jack/Seven', os: true, desc: '算出 7+8=15' },
    { name: 'Average', dir: '../11/jack/Average', os: true, desc: '陣列平均' },
    { name: 'ComplexArrays', dir: '../11/jack/ComplexArrays', os: true, desc: '高維陣列' },
    { name: 'ConvertToBin', dir: '../11/jack/ConvertToBin', os: true, desc: '十進位轉二進位' },
    { name: 'Square', dir: '../11/jack/Square', os: true, desc: '鍵盤移動方塊（含螢幕）' },
    { name: 'Pong', dir: '../11/jack/Pong', os: true, desc: '經典乒乓（含螢幕）' },
    { name: 'Sum(noOS)', dir: '../11/jackNoOs/Sum', os: false, desc: '無 OS 求和 1..10' },
    { name: 'Factorial(noOS)', dir: '../11/jackNoOs/Factorial', os: false, desc: '階乘（遞迴）' },
    { name: 'Fib(noOS)', dir: '../11/jackNoOs/Fib', os: false, desc: '費氏數列' },
    { name: 'GCD(noOS)', dir: '../11/jackNoOs/GCD', os: false, desc: '輾轉相除' },
    { name: 'PrimeUnder100(noOS)', dir: '../11/jackNoOs/PrimeUnder100', os: false, desc: '100 以內質數' },
  ];
  function sourcesIn(dir) {
    return Object.keys(corpus()).filter((k) => k.startsWith(dir + '/') && k.endsWith('.jack')).sort();
  }

  function N2Tjack(host) {
    const { compileJack } = window.HackJack2Vm;
    const sim = elt('div', 'sim');
    const head = elt('div', 'simhead');
    head.appendChild(elt('span', null, 'Jack 全鏈路：Compiler → VM → 組語 → 模擬'));
    head.appendChild(elt('span', 'hint', '「含 OS」的程式會先編譯 8 個 OS 類別再編譯程式本身'));
    head.appendChild(elt('span', 'spacer'));
    const sel = elt('select');
    for (const p of JACK_PROGRAMS) {
      const o = elt('option'); o.value = p.dir;
      o.textContent = `${p.name}（${p.desc}，${p.os ? '含 OS' : '無 OS'}）`;
      sel.appendChild(o);
    }
    const runBtn = elt('button', 'primary', '▶ 編譯並執行');
    head.appendChild(sel); head.appendChild(runBtn);
    sim.appendChild(head);

    const body = elt('div', 'simbody');
    const left = elt('label', 'block');
    left.appendChild(elt('span', null, '‧ Jack 原始碼（Main，可編輯）'));
    const ta = elt('textarea', 'code'); ta.spellcheck = false;
    ta.style.minHeight = '240px';
    left.appendChild(ta);
    const srcList = elt('div', 'hint', '');
    left.appendChild(srcList);
    body.appendChild(left);

    const right = elt('div', 'block');
    right.appendChild(elt('span', null, '‧ 執行結果'));
    const banner = elt('div', 'banner');
    const summary = elt('div', 'outbox');
    right.appendChild(banner); right.appendChild(summary);
    body.appendChild(right);
    sim.appendChild(body);

    const toolbar = elt('div', 'simhead');
    const stepBtn = elt('button', 'primary', 'Step');
    const run5k = elt('button', null, 'Run 5k');
    const runBig = elt('button', null, 'Run 100k');
    toolbar.appendChild(stepBtn);
    toolbar.appendChild(run5k);
    toolbar.appendChild(runBig);
    toolbar.appendChild(elt('span', 'spacer'));
    toolbar.appendChild(elt('span', 'hint', '有繪圖的程式（Square/Pong）執行後會顯示在下方畫面'));
    sim.appendChild(toolbar);
    const canvas = elt('canvas', 'scr'); canvas.width = 512; canvas.height = 256;
    sim.appendChild(canvas);
    host.appendChild(sim);

    let vm = null;

    const render = () => {
      if (!vm) return;
      const r = vm.ram;
      const lines = [
        `PC=${vm.pc}　D=${vm.d}　A=${vm.a}　cycles=${vm.cycles}`,
        `SP(RAM[0])=${r[0]}`
      ];
      if (r[1] || r[2] || r[3] || r[4]) {
        lines.push(`LCL=${r[1]}　ARG=${r[2]}　THIS=${r[3]}　THAT=${r[4]}`);
      }
      lines.push('', '指標區（pointer 300~302）: ' + Array.from(r.slice(300, 303)).join(' '));
      lines.push('區域 303~315: ' + Array.from(r.slice(303, 316)).join(' '));
      summary.innerHTML = '';
      const pre = elt('pre', null, lines.join('\n'));
      summary.appendChild(pre);
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(512, 256);
      const d = img.data;
      for (let rr = 0; rr < 256; rr++) {
        const base = rr * 32;
        for (let c16 = 0; c16 < 32; c16++) {
          const w = r[16384 + base + c16];
          for (let b = 0; b < 16; b++) {
            const on = (w & (1 << (15 - b))) !== 0;
            const idx = ((rr * 512) + (c16 * 16 + b)) * 4;
            d[idx] = on ? 0 : 255; d[idx + 1] = on ? 0 : 255; d[idx + 2] = on ? 0 : 255; d[idx + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    const loadProg = (dir) => {
      const files = sourcesIn(dir);
      const prog = JACK_PROGRAMS.find((p) => p.dir === dir);
      ta.value = files.length ? stripBanner(corpus()[files[files.length - 1]]) : '';
      srcList.textContent = `${dir}　共 ${files.length} 檔：${files.map((f) => f.split('/').pop()).join('、')}${prog.os ? '　＋OS 8 檔' : ''}`;
      vm = null;
      banner.className = 'banner';
    };

    const doCompileRun = () => {
      banner.className = 'banner';
      const dir = sel.value;
      const prog = JACK_PROGRAMS.find((p) => p.dir === dir);
      const files = sourcesIn(dir);
      if (!files.length) { banner.className = 'banner fail'; banner.textContent = '語料中找不到此程式的 .jack'; return; }
      try {
        const vmFiles = [];
        if (prog.os) {
          for (const k of sourcesIn('gen/os_src')) {
            vmFiles.push({ path: k.split('/').pop().replace(/\.jack$/, '.vm'), src: compileJack(corpus()[k]).join('\n') + '\n' });
          }
        }
        for (const k of files) {
          const src = k === files[files.length - 1] ? ta.value : stripBanner(corpus()[k]);
          vmFiles.push({ path: k.split('/').pop().replace(/\.jack$/, '.vm'), src: compileJack(src).join('\n') + '\n' });
        }
        const asm = window.HackVm2Asm.translate(vmFiles);
        const { hack } = window.HackAsm.assemble(asm);
        vm = new window.HackVM.Vm();
        vm.loadHack(hack);
        banner.className = 'banner pass';
        banner.textContent = `✓ 編譯成功：${vmFiles.length} 個 .vm → 組語 ${asm.trim().split('\n').length} 行 → ROM ${hack.trim().split('\n').length} 條`;
        summary.innerHTML = '';
        summary.appendChild(elt('pre', null, `已載入虛擬機。按下 Step / Run 觀察執行，繪圖程式會在下方畫出 SCREEN。`));
        render();
      } catch (e) {
        banner.className = 'banner fail';
        banner.textContent = '✗ 編譯失敗';
        summary.innerHTML = '';
        summary.appendChild(elt('pre', null, String(e.message || e)));
      }
    };

    runBtn.addEventListener('click', doCompileRun);
    sel.addEventListener('change', () => loadProg(sel.value));
    stepBtn.addEventListener('click', () => { if (!vm) doCompileRun(); if (vm) { vm.step(); render(); } });
    run5k.addEventListener('click', () => { if (!vm) doCompileRun(); if (vm) { vm.run(5000); render(); } });
    runBig.addEventListener('click', () => { if (!vm) doCompileRun(); if (vm) { vm.run(100000); render(); } });

    loadProg(JACK_PROGRAMS[0].dir);
  }

  /* ================= 曝光與初始化 ================= */
  window.N2T = { hdl: N2Thdl, emu: N2Temu, vm: N2Tvm, jack: N2Tjack };

  function initWidgets() {
    $$('[data-widget]').forEach((host) => {
      if (host.dataset.built) return;
      host.dataset.built = '1';
      const w = host.getAttribute('data-widget');
      try {
        if (w === 'hdl') {
          N2Thdl(host, {
            dir: host.dataset.dir, top: host.dataset.top,
            dirLabel: host.dataset.dirLabel,
            tstTop: host.dataset.tstTop,
            customCompare: host.dataset.customCompare || undefined,
            hdl: host.dataset.hdl,
            tst: host.dataset.tst,
            cmp: host.dataset.cmp,
            tstFile: host.dataset.tstFile,
            cmpFile: host.dataset.cmpFile,
            tstName: host.dataset.tstName,
          });
        } else if (w === 'emu') {
          N2Temu(host, {
            file: host.dataset.file, asm: host.dataset.asm,
            hint: host.dataset.hint, setup: host.dataset.setup,
            maxRun: Number(host.dataset.maxrun || 60000),
            screen: host.getAttribute('data-screen') === 'true',
            keys: host.getAttribute('data-keys') === 'true',
          });
        } else if (w === 'vm') {
          N2Tvm(host, {
            file: host.dataset.file,
            files: host.dataset.files ? JSON.parse(host.dataset.files) : undefined,
            src: host.dataset.src,
            setup: host.dataset.setup,
            hint: host.dataset.hint, auto: host.dataset.auto === 'true',
            maxRun: Number(host.dataset.maxrun || 20000),
          });
        } else if (w === 'jack') {
          N2Tjack(host);
        }
      } catch (e) {
        const box = elt('div', 'errbox', '初始化失敗：' + String(e.message || e));
        host.appendChild(box);
      }
    });
  }

  function init() {
    const curFile = location.pathname.split('/').pop() || 'index.html';
    const curBase = curFile.replace(/\.html$/, '');
    buildSidebar(curBase);
    buildToolbar(curBase);
    bindDoneToggles();
    initWidgets();
    if (curFile === 'index.html') {
      $$('.cover .card').forEach((card) => {
        const f = card.getAttribute('data-f');
        if (!f) return;
        const pct = chapterPct(f);
        const bar = $1('.pct > div', card);
        if (bar) bar.style.width = Math.round(pct * 100) + '%';
        const txt = $1('.pct-label', card);
        if (txt) txt.textContent = pct >= 1 ? '已完成 ✓' : (pct === 0 ? '尚未開始' : `${Math.round(pct * 100)}%`);
        if (pct >= 1) card.classList.add('done');
      });
    }
    refreshSidebar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();