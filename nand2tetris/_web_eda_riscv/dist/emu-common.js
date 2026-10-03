/* 雙模擬器共用骨架（index.html/app.js＋rvemu.html/rvemu.js）：按鍵 held 陣列、
   跨視窗接收橋、內建 Jack 範例清單＋編譯。classic script，掛 window.EmuCommon；
   載入順序在 app.js/rvemu.js 之前。
   兩頁原各自一份手寫，邏輯逐行相同（P3 收斂；行為不變）。
   範例清單原散在四處（P6 待收 jack.js／browser_jack_smoke／test），
   此處先收斂兩模擬器頁共用的一份。 */
(() => {
  'use strict';

  // 按鍵：追蹤按住集合，永遠把最後按下的送進 setKey；全放開歸零。
  // opts: { keymap: {DOMKey: code}, setKey(code), buttons?: 有 data-key 的按鈕們 }
  function keyBridge(opts) {
    const held = [];
    const down = (code) => {
      if (!held.includes(code)) held.push(code);
      opts.setKey(held[held.length - 1]);
    };
    const up = (code) => {
      const k = held.indexOf(code);
      if (k >= 0) held.splice(k, 1);
      opts.setKey(held.length ? held[held.length - 1] : 0);
    };
    if (opts.buttons) opts.buttons.forEach((b) => {
      const code = Number(b.dataset.key);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); down(code); });
      b.addEventListener('pointerup', () => up(code));
      b.addEventListener('pointerleave', () => up(code));
    });
    window.addEventListener('keydown', (e) => {
      const c = opts.keymap[e.key];
      if (c === undefined) return;
      e.preventDefault();
      down(c);
    });
    window.addEventListener('keyup', (e) => {
      const c = opts.keymap[e.key];
      if (c === undefined) return;
      up(c);
    });
    return {
      down,
      up,
      clear() { held.length = 0; opts.setKey(0); },
    };
  }

  // 跨視窗接收橋（對應 jack.html 送出側）：載入即向 opener 報到；
  // 收到 ping 回報到；收到程式即交 onLoad(text)，自跑與否由各頁決定。
  // opts: { ready, ping, load, field, onLoad }
  function receiverSide(opts) {
    const sayReady = () => {
      if (window.opener) window.opener.postMessage({ type: opts.ready }, '*');
    };
    sayReady();
    window.addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.type === opts.ping) {
        sayReady();
      } else if (d.type === opts.load && typeof d[opts.field] === 'string') {
        opts.onLoad(d[opts.field]);
      }
    });
  }

  // ---- 內建 Jack 範例（兩模擬器頁共用；與 jack.html 同名單） ----
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

  function jackSources(dir) {
    const corpus = window.HACKJS_CORPUS || {};
    return Object.keys(corpus)
      .filter((k) => k.startsWith(dir + '/') && k.endsWith('.jack'))
      .sort();
  }

  function fillExampleSelect(sel) {
    sel.innerHTML = '';
    for (const p of PROGRAMS) {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name + (p.needsOS ? '（OS）' : '');
      sel.appendChild(o);
    }
  }

  // 範例 Jack → VM（使用者模組；needsOS 時 OS 在前）。只到 VM，後端各頁自理。
  // 回傳 { prog, userVm, fullVm }；缺檔或缺工具鏈即 throw。
  function compileJackVm(name) {
    const JACK = window.HackJack2Vm;
    if (!JACK) throw new Error('embed.js 未含 Jack 工具鏈');
    const corpus = window.HACKJS_CORPUS || {};
    const p = PROGRAMS.find((q) => q.name === name);
    if (!p) throw new Error(`未知範例：${name}`);
    const files = jackSources(p.dir).map((k) => ({
      path: k.split('/').pop().replace(/\.jack$/, '.vm'),
      src: JACK.compileJack(corpus[k]).join('\n') + '\n',
    }));
    if (files.length === 0) throw new Error(`語料缺 ${p.dir} 的 .jack`);
    let fullVm = files;
    if (p.needsOS) {
      const os = jackSources(OS_DIR).map((k) => ({
        path: k.split('/').pop().replace(/\.jack$/, '.vm'),
        src: JACK.compileJack(corpus[k]).join('\n') + '\n',
      }));
      fullVm = os.concat(files);
    }
    return { prog: p, userVm: files, fullVm };
  }

  window.EmuCommon = { keyBridge, receiverSide, OS_DIR, PROGRAMS, jackSources, compileJackVm, fillExampleSelect };
})();
