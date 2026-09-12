/* hdl.html 頁面邏輯：內建章節案例（語料來自 window.HACKJS_CORPUS）＋自訂貼上。
   引擎＝embed.js 匯出的 HackHdl（HDL→JS 模擬＋.tst 執行），fs/path 走 hdl-rt.js shim。 */
(() => {
  'use strict';
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

  const H = window.HackHdl;
  const { loadLibrary, mergeLibs, elab, generateJs, topClassExpr, parseScript, run, TopModel } = H;

  const CHAPTERS = [
    { label: '01 基本邏輯閘', dir: '../01' },
    { label: '02 加法器/ALU', dir: '../02' },
    { label: '03/a 時序', dir: '../03/a' },
    { label: '03/b 記憶體', dir: '../03/b' },
    { label: '04 專案（hw）', dir: '../04/mult', dir2: '../04/fill' },
    { label: '05 CPU/電腦', dir: '../05' },
    { label: '* 全鏈路（chain）', dir: 'gen/chain' },
  ];

  const caseCache = new Map();
  let fullLibCache = null;

  function fullLib() {
    if (fullLibCache) return fullLibCache;
    let lib = {};
    for (const c of CHAPTERS) {
      for (const d of [c.dir, c.dir2].filter(Boolean)) {
        lib = mergeLibs(lib, loadLibrary(d));
      }
    }
    fullLibCache = lib;
    return lib;
  }

  function tstListFor(ch) {
    const key = ch.dir;
    if (caseCache.has(key)) return caseCache.get(key);
    const set = new Set();
    for (const d of [ch.dir, ch.dir2].filter(Boolean)) {
      for (const k of Object.keys(window.HACKJS_CORPUS)) {
        if (k.startsWith(d + '/') && k.endsWith('.tst')) set.add(k);
      }
    }
    const list = [...set].sort();
    caseCache.set(key, list);
    return list;
  }

  function fillChapter() {
    el.chapter.innerHTML = '';
    for (let i = 0; i < CHAPTERS.length; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = CHAPTERS[i].label;
      el.chapter.appendChild(o);
    }
  }

  function fillCase() {
    const ch = CHAPTERS[Number(el.chapter.value)];
    el.case.innerHTML = '';
    for (const k of tstListFor(ch)) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = k.replace(/\.tst$/, '');
      el.case.appendChild(o);
    }
  }

  function chipNameOf(tst) {
    const m = /load\s+([\w.-]+\.hdl)/.exec(tst);
    return m ? m[1].replace(/\.hdl$/, '') : null;
  }

  function dirname(p) {
    return p.split('/').slice(0, -1).join('/');
  }

  function loadSource() {
    if (el.mode.value !== 'chapter') return;
    const ch = CHAPTERS[Number(el.chapter.value)];
    const tstPath = el.case.value;
    const tst = window.HACKJS_CORPUS[tstPath] ?? '';
    el.tst.value = tst;
    const top = chipNameOf(tst);
    const hdlKey = top
      ? Object.keys(window.HACKJS_CORPUS).find((k) => k.endsWith(`/${top}.hdl`))
      : null;
    el.hdl.value = hdlKey ? window.HACKJS_CORPUS[hdlKey] : '';
    const cmpKey = `${tstPath.replace(/\.tst$/, '')}.cmp`;
    el.cmp.value = cmpKey in window.HACKJS_CORPUS ? window.HACKJS_CORPUS[cmpKey] : '';
  }

  const DEFAULT_CUSTOM = {
    hdl: 'CHIP And9 {\n  IN a, b;\n  OUT out;\n  PARTS:\n    Nand(a=a, b=b, out=n);\n    Nand(a=n, b=n, out=out);\n}',
    tst: 'load And9.hdl,\noutput-list a%B1.1.1 b%B1.1.1 out%B1.1.1;\nset a 0, set b 0, eval, output;\nset a 1, set b 0, eval, output;\nset a 1, set b 1, eval, output;',
    cmp: '| a | b |out|\n| 0 | 0 | 0 |\n| 1 | 0 | 0 |\n| 1 | 1 | 1 |',
  };

  function applyMode() {
    const custom = el.mode.value === 'custom';
    el.chapter.disabled = custom;
    el.case.disabled = custom;
    if (custom) {
      el.hdl.value = DEFAULT_CUSTOM.hdl;
      el.tst.value = DEFAULT_CUSTOM.tst;
      el.cmp.value = DEFAULT_CUSTOM.cmp;
    } else {
      loadSource();
    }
  }

  function renderTable(out) {
    el.outtab.innerHTML = '';
    const rows = out.join('').split('\n').filter((l) => l.includes('|'));
    for (const line of rows) {
      const cells = line.split(/[|]/).slice(1, -1);
      const tr = document.createElement('tr');
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c.trim();
        tr.appendChild(td);
      }
      el.outtab.appendChild(tr);
    }
  }

  function setBanner(cls, text) {
    el.banner.className = cls;
    el.banner.textContent = text;
  }

  function runCase() {
    el.run.disabled = true;
    setBanner('', '');
    try {
      let lib;
      let script;
      let top;
      let baseDir = '.';
      const tstText = el.mode.value === 'chapter'
        ? window.HACKJS_CORPUS[el.case.value]
        : el.tst.value;
      if (el.mode.value === 'chapter') {
        lib = fullLib();
        const tstPath = el.case.value;
        baseDir = dirname(tstPath);
        script = parseScript(tstText);
        top = script.load ? script.load.replace(/\.hdl$/, '') : chipNameOf(tstText);
      } else {
        lib = fullLib();
        const parsed = H.parseHdl(el.hdl.value);
        const chip = Object.assign({}, parsed, { source: el.hdl.value });
        lib = mergeLibs(lib, { [chip.name]: chip });
        script = parseScript(tstText);
        top = script.load ? script.load.replace(/\.hdl$/, '') : chip.name;
        const hasCmp = el.cmp.value.trim().length > 0;
        script.outputFile = './custom.out';
        if (hasCmp) {
          window.HACKJS_FS.writeFileSync('./custom.cmp', el.cmp.value);
          script.compareTo = './custom.cmp';
        }
      }
      if (!top) throw new Error('找不到 top（.tst 裡沒有 load，從 .hdl 也讀不出芯片名）');

      const e = elab(lib, top);
      const src = generateJs(e);
      const TopClass = new Function(`${src}\nreturn ${topClassExpr(e)};`)();
      const model = new TopModel(TopClass, e.chips[e.top]);

      const out = [];
      let error = null;
      try {
        run(model, script, baseDir, out, false);
      } catch (err) {
        error = err;
      }
      renderTable(out);
      if (error) {
        setBanner('fail', error.message.startsWith('!!!') ? '✗ 比對失敗' : '✗ 執行失敗');
        el.errlog.textContent = error.message + (error.message.includes('\n') ? '' : '\n');
      } else {
        setBanner('pass', '✓ 通過');
        if (el.mode.value === 'custom' && !el.cmp.value.trim()) {
          el.errlog.textContent = '(未提供 .cmp，只顯示輸出，未比對)\n';
        } else {
          el.errlog.textContent = '';
        }
      }
    } catch (err) {
      setBanner('fail', '✗ 失敗');
      el.errlog.textContent = err.message;
    } finally {
      el.run.disabled = false;
    }
  }

  el.mode.onchange = applyMode;
  el.chapter.onchange = () => { fillCase(); loadSource(); };
  el.case.onchange = loadSource;
  el.run.onclick = runCase;

  fillChapter();
  fillCase();
  el.status.textContent = `語料 ${Object.keys(window.HACKJS_CORPUS).length} 檔`;
  loadSource();
})();