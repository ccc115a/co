/* app.js：RV32 IDE 邏輯（classic script，file:// 直開可用）。
 * 契約（由 dist/rvjs.js 提供）：全域 RVJS = { assemble, disassemble, Emulator }。
 * 語料：dist/corpus.js（若存在）提供 globalThis.RVJS_CORPUS = [{name, src}...]，
 *       存在時覆蓋下拉選單；否則用下方內嵌 3 個預設範例。
 * 本檔對「lib/ 尚未就緒」做防禦式相容：RVJS 缺失時顯示提示，不拋未捕捉例外。
 */
(function () {
  'use strict';

  var ABI = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2',
    's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
    's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
    't3', 't4', 't5', 't6'];

  var BUILTIN_EXAMPLES = [
    {
      name: 'hello（UART 印 Hi RV32!）',
      src: [
        '# hello：逐字 ecall 輸出 "Hi RV32!"（a7=1 印出 a0 低位元組，a7=10 以 a0 為結束碼離開）',
        'main:',
        '    li a0, 72      # H',
        '    li a7, 1',
        '    ecall',
        '    li a0, 105     # i',
        '    li a7, 1',
        '    ecall',
        '    li a0, 32      # space',
        '    li a7, 1',
        '    ecall',
        '    li a0, 82      # R',
        '    li a7, 1',
        '    ecall',
        '    li a0, 86      # V',
        '    li a7, 1',
        '    ecall',
        '    li a0, 51      # 3',
        '    li a7, 1',
        '    ecall',
        '    li a0, 50      # 2',
        '    li a7, 1',
        '    ecall',
        '    li a0, 33      # !',
        '    li a7, 1',
        '    ecall',
        '    li a0, 10      # newline',
        '    li a7, 1',
        '    ecall',
        '    li a0, 0',
        '    li a7, 10',
        '    ecall'
      ].join('\n')
    },
    {
      name: 'sum（1..10 求和 exit 55）',
      src: [
        '# sum：1+2+...+10 = 55，結束碼即答案',
        '    li t0, 0       # 累加器',
        '    li t1, 1       # i',
        '    li t2, 11      # 上界（不含）',
        'loop:',
        '    add t0, t0, t1',
        '    addi t1, t1, 1',
        '    blt t1, t2, loop',
        '    mv a0, t0',
        '    li a7, 10',
        '    ecall'
      ].join('\n')
    },
    {
      name: 'fib（fib(10)=55 exit 55）',
      src: [
        '# fib：迭代求 fib(10) = 55，結束碼即答案',
        '    li t0, 0       # f(n-2)',
        '    li t1, 1       # f(n-1)',
        '    li t2, 10      # n',
        '    li t3, 0       # i',
        'loop:',
        '    beq t3, t2, done',
        '    add t4, t0, t1',
        '    mv t0, t1',
        '    mv t1, t4',
        '    addi t3, t3, 1',
        '    jal x0, loop',
        'done:',
        '    mv a0, t0',
        '    li a7, 10',
        '    ecall'
      ].join('\n')
    }
  ];

  var S = {
    examples: BUILTIN_EXAMPLES,
    words: [],
    origin: 0,
    emu: null,
    prevRegs: new Array(32).fill(0),
    addrs: [],
    assembledSrc: null,
    lastResult: null
  };

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, cls) {
    var el = $('status');
    el.textContent = msg;
    el.className = cls || '';
  }

  function parseOrigin() {
    var t = ($('origin').value || '0').trim();
    var v = (/^0[xX]/).test(t) ? parseInt(t, 16) : parseInt(t, 10);
    if (isNaN(v) || v < 0) throw new Error('起始位址格式錯誤：' + t);
    return v >>> 0;
  }

  function getExamples() {
    var c = (typeof globalThis !== 'undefined') ? globalThis.RVJS_CORPUS : null;
    if (Array.isArray(c) && c.length > 0 &&
        c.every(function (e) { return e && typeof e.name === 'string' && typeof e.src === 'string'; })) {
      return c;
    }
    return BUILTIN_EXAMPLES;
  }

  function fmtHex(v, digits) {
    return '0x' + (v >>> 0).toString(16).padStart(digits || 8, '0');
  }

  /* ---- Emulator 防禦式轉接（lib/ 由另一人撰寫，簽名以契約為準、寬容變體） ---- */

  function emuLoad(emu, words, origin) {
    if (typeof emu.loadWords === 'function') {
      if (emu.loadWords.length >= 2) { emu.loadWords(words, origin); return; }
      try { emu.loadWords(words, origin); return; }
      catch (e) { emu.loadWords(words); return; }
    }
    if (typeof emu.load === 'function') { emu.load(words, origin); return; }
    throw new Error('Emulator 缺少 loadWords 方法');
  }

  function emuRun(emu, budget) {
    if (typeof emu.run !== 'function') throw new Error('Emulator 缺少 run 方法');
    try {
      if (budget == null) return emu.run();
      return emu.run(budget);
    } catch (e) {
      if (budget != null) {
        try { return emu.run({ maxSteps: budget }); } catch (e2) { /* 往下拋原始錯誤 */ }
      }
      throw e;
    }
  }

  function emuStep(emu) {
    if (typeof emu.step === 'function') return emu.step();
    return emuRun(emu, 1);
  }

  function emuGetReg(emu, i) {
    if (typeof emu.getReg === 'function') return emu.getReg(i) | 0;
    if (typeof emu.getRegs === 'function') return emu.getRegs()[i] | 0;
    if (Array.isArray(emu.regs)) return emu.regs[i] | 0;
    if (Array.isArray(emu.registers)) return emu.registers[i] | 0;
    throw new Error('Emulator 無法讀取暫存器');
  }

  function emuGetPC(emu) {
    if (typeof emu.getPC === 'function') return emu.getPC() >>> 0;
    if (typeof emu.pc === 'number') return emu.pc >>> 0;
    if (typeof emu.getPc === 'function') return emu.getPc() >>> 0;
    return null;
  }

  function resultUart(res) {
    if (!res) return '';
    if (typeof res.uart === 'string') return res.uart;
    if (Array.isArray(res.uart)) return res.uart.join('');
    if (typeof res.output === 'string') return res.output;
    return '';
  }

  /* ---- 顯示 ---- */

  function renderRegs(pcChangedOnly) {
    var box = $('regs');
    box.innerHTML = '';
    for (var i = 0; i < 32; i++) {
      var v = 0;
      var ok = true;
      try { v = S.emu ? emuGetReg(S.emu, i) : (S.prevRegs[i] | 0); }
      catch (e) { ok = false; }
      var div = document.createElement('div');
      div.className = 'reg' + ((ok && (v | 0) !== (S.prevRegs[i] | 0)) ? ' changed' : '');
      var b = document.createElement('b');
      b.textContent = 'x' + i + '/' + ABI[i];
      var s = document.createElement('span');
      s.textContent = ' ' + fmtHex(v) + ' (' + (v | 0) + ')';
      div.appendChild(b);
      div.appendChild(s);
      box.appendChild(div);
    }
    void pcChangedOnly;
  }

  function snapshotRegs() {
    if (!S.emu) { S.prevRegs = new Array(32).fill(0); return; }
    var next = [];
    for (var i = 0; i < 32; i++) {
      try { next.push(emuGetReg(S.emu, i) | 0); }
      catch (e) { next.push(S.prevRegs[i] | 0); }
    }
    S.prevRegs = next;
  }

  // 錯誤行號提示：從例外訊息萃取行號，並把 textarea 選取範圍移到該行
  function hintErrorLine(src, msg) {
    var m = /[Ll]ine\s*(\d+)|第\s*(\d+)\s*行|:(\d+)[:\s]/.exec(String(msg));
    var n = m ? parseInt(m[1] || m[2] || m[3], 10) : NaN;
    if (isNaN(n) || n < 1) return null;
    try {
      var ta = $('src');
      var lines = String(src).split('\n');
      if (n > lines.length) return null;
      var off = 0;
      for (var i = 0; i < n - 1; i++) off += lines[i].length + 1;
      ta.focus();
      ta.setSelectionRange(off, off + lines[n - 1].length);
    } catch (e) { /* file:// 下保持可用即可 */ }
    return n;
  }

  function normalizeListing(asmRes, words, origin) {
    // 接受 lib 回傳的多種 listing 形狀；兜底用 disassemble 自建
    var out = [];
    var i, addr;
    if (asmRes && Array.isArray(asmRes.listing)) {
      for (i = 0; i < asmRes.listing.length; i++) {
        var e = asmRes.listing[i];
        if (typeof e === 'string') {
          addr = (origin + i * 4) >>> 0;
          out.push({ addr: addr, word: words[i] >>> 0, text: e });
        } else if (e && typeof e === 'object') {
          addr = (e.addr != null ? e.addr : origin + i * 4) >>> 0;
          out.push({
            addr: addr,
            word: (e.word != null ? e.word : words[i]) >>> 0,
            text: String(e.text != null ? e.text : e.asm != null ? e.asm : '')
          });
        }
      }
      if (out.length) return out;
    }
    var asm = [];
    try {
      if (globalThis.RVJS && typeof globalThis.RVJS.disassemble === 'function') {
        asm = globalThis.RVJS.disassemble(words, origin) || [];
      }
    } catch (e) { asm = []; }
    for (i = 0; i < words.length; i++) {
      out.push({ addr: (origin + i * 4) >>> 0, word: words[i] >>> 0, text: String((asm[i] != null ? asm[i] : '')) });
    }
    return out;
  }

  var listingRows = [];

  function renderListing(curPC) {
    var pre = $('listing');
    pre.innerHTML = '';
    listingRows = [];
    var rows = normalizeListing(S.lastAsmRes, S.words, S.origin);
    S.addrs = rows.map(function (r) { return r.addr; });
    if (!rows.length) { pre.textContent = '（空程式）'; return; }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var div = document.createElement('div');
      if (curPC != null && r.addr === curPC) div.className = 'cur';
      var pc = document.createElement('span');
      pc.className = 'ln';
      pc.textContent = fmtHex(r.addr) + '  ' + fmtHex(r.word) + '  ';
      var t = document.createElement('span');
      if (curPC != null && r.addr === curPC) { t.className = 'pc'; t.textContent = '▶ ' + r.text; }
      else t.textContent = '  ' + r.text;
      div.appendChild(pc);
      div.appendChild(t);
      pre.appendChild(div);
      listingRows.push(div);
    }
  }

  function updateFooter(res) {
    $('statSteps').textContent = 'steps: ' + (res && res.steps != null ? res.steps : '-');
    var exit = (res && res.exitCode != null) ? res.exitCode : (res && res.halted ? 0 : '-');
    $('statExit').textContent = 'exit: ' + exit;
  }

  /* ---- 動作 ---- */

  function needRVJS() {
    if (!globalThis.RVJS || typeof globalThis.RVJS.assemble !== 'function') {
      setStatus('RVJS 尚未載入（lib/ 撰寫中）：請先 node tools/build.js 產生 dist/rvjs.js', 'error');
      return false;
    }
    return true;
  }

  function needEmu() {
    if (!needRVJS()) return false;
    if (typeof globalThis.RVJS.Emulator !== 'function') {
      setStatus('Emulator 尚未提供（lib/rvemu.js 撰寫中）：組譯與反組譯可用，執行／單步請稍後再試', 'error');
      return false;
    }
    return true;
  }

  function doAssemble() {
    if (!needRVJS()) return false;
    var src = $('src').value;
    var origin;
    try { origin = parseOrigin(); }
    catch (e) { setStatus(String(e.message), 'error'); return false; }
    var res;
    try {
      res = globalThis.RVJS.assemble(src, { origin: origin });
    } catch (e) {
      var ln = hintErrorLine(src, e.message);
      setStatus('組譯失敗' + (ln ? '（第 ' + ln + ' 行）' : '') + '：' + e.message, 'error');
      $('statMsg').textContent = String((e && e.message) || e);
      return false;
    }
    var words = res.words || res.codes || [];
    S.words = Array.prototype.slice.call(words);
    S.origin = origin >>> 0;
    S.lastAsmRes = res;
    S.assembledSrc = src;
    S.emu = null;
    var nlbl = res.labels ? Object.keys(res.labels).length : 0;
    if (typeof globalThis.RVJS.Emulator === 'function') {
      try {
        S.emu = new globalThis.RVJS.Emulator();
        emuLoad(S.emu, S.words, S.origin);
      } catch (e) {
        S.emu = null;
        setStatus('組譯成功，但載入模擬器失敗：' + e.message, 'error');
        renderListing(null);
        renderRegs();
        return false;
      }
      setStatus('組譯成功：' + S.words.length + ' 條指令，' + nlbl + ' 個標籤', 'ok');
    } else {
      // lib/rvemu.js 撰寫中：組譯與反組譯先行可用
      setStatus('組譯成功：' + S.words.length + ' 條指令（Emulator 撰寫中，尚不能執行）', 'ok');
    }
    S.prevRegs = new Array(32).fill(0);
    S.lastResult = null;
    $('uart').textContent = '';
    renderListing(null);
    renderRegs();
    snapshotRegs();
    renderRegs();
    updateFooter(null);
    $('statMsg').textContent = '';
    return true;
  }

  function ensureFresh() {
    // 原始碼被改過或尚未組譯 → 先重組
    if (!S.emu || S.assembledSrc !== $('src').value) {
      if (!doAssemble()) return false;
      // doAssemble 已重設 prevRegs；單步/執行前快照歸零以便高亮
      S.prevRegs = new Array(32).fill(0);
    }
    return true;
  }

  function syncAfterRun(res) {
    renderRegs();
    var pc = null;
    try { pc = S.emu ? emuGetPC(S.emu) : null; } catch (e) { pc = null; }
    renderListing(pc);
    snapshotRegs();
    renderRegs();
    $('uart').textContent = resultUart(res);
    updateFooter(res);
  }

  function doRun() {
    if (!needEmu()) return;
    if (!ensureFresh()) return;
    snapshotRegs();
    // 重新載入，保證從頭執行（Emulator 無 reset 契約時重建）
    try {
      S.emu = new globalThis.RVJS.Emulator();
      emuLoad(S.emu, S.words, S.origin);
    } catch (e) { setStatus('載入模擬器失敗：' + e.message, 'error'); return; }
    var res;
    try { res = emuRun(S.emu, 1000000); }
    catch (e) { setStatus('執行失敗：' + e.message, 'error'); return; }
    S.lastResult = res || null;
    syncAfterRun(S.lastResult);
    var halted = S.lastResult && S.lastResult.halted;
    setStatus(halted ? '執行結束（halt），exit=' + ((S.lastResult.exitCode != null) ? S.lastResult.exitCode : 0) : '執行結束（未 halt，可能超步數）',
      halted ? 'ok' : 'error');
  }

  function doStep() {
    if (!needEmu()) return;
    if (!ensureFresh()) return;
    var before = [];
    for (var i = 0; i < 32; i++) {
      try { before.push(emuGetReg(S.emu, i) | 0); } catch (e) { before.push(0); }
    }
    S.prevRegs = before;
    var res;
    try { res = emuStep(S.emu); }
    catch (e) { setStatus('單步失敗：' + e.message, 'error'); return; }
    if (res && (res.uart != null || res.steps != null)) {
      // 單步回傳可能是 run 結果子集：累積 UART 顯示
      var u = resultUart(res);
      if (u) $('uart').textContent += u;
      S.lastResult = res;
      updateFooter(res);
    }
    renderRegs();
    var pc = null;
    try { pc = emuGetPC(S.emu); } catch (e) { pc = null; }
    renderListing(pc);
    snapshotRegs();
    renderRegs();
    setStatus(pc != null ? '單步：PC = ' + fmtHex(pc) : '單步完成', '');
  }

  function doReset() {
    $('uart').textContent = '';
    S.words = [];
    S.emu = null;
    S.prevRegs = new Array(32).fill(0);
    S.lastResult = null;
    S.lastAsmRes = null;
    S.assembledSrc = null;
    renderListing(null);
    $('listing').textContent = '（已重設）';
    renderRegs();
    updateFooter(null);
    setStatus('已重設', '');
    $('statMsg').textContent = '';
  }

  function onExampleChange() {
    var sel = $('example');
    var ex = S.examples[parseInt(sel.value, 10)];
    if (ex) $('src').value = ex.src;
  }

  function init() {
    S.examples = getExamples();
    var sel = $('example');
    sel.innerHTML = '';
    for (var i = 0; i < S.examples.length; i++) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = S.examples[i].name;
      sel.appendChild(o);
    }
    if (S.examples.length) $('src').value = S.examples[0].src;
    renderRegs();
    if (!globalThis.RVJS) {
      setStatus('RVJS 尚未載入（lib/ 撰寫中）：可先瀏覽範例，組譯需等 dist/rvjs.js', 'error');
    }
  }

  globalThis.App = {
    doAssemble: doAssemble,
    doRun: doRun,
    doStep: doStep,
    doReset: doReset,
    onExampleChange: onExampleChange
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
