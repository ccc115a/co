/* enc.js：RV32 指令編碼器邏輯（classic script，file:// 直開可用）。
 * 自帶 RV32I＋M 解碼表（與 lib/ 無關，lib 缺席時仍可工作）；
 * 反向解碼另以 RVJS.disassemble 顯示組語對照（若已載入）。
 */
(function () {
  'use strict';

  var ABI2NUM = {
    zero: 0, ra: 1, sp: 2, gp: 3, tp: 4, t0: 5, t1: 6, t2: 7,
    s0: 8, fp: 8, s1: 9, a0: 10, a1: 11, a2: 12, a3: 13, a4: 14,
    a5: 15, a6: 16, a7: 17, s2: 18, s3: 19, s4: 20, s5: 21,
    s6: 22, s7: 23, s8: 24, s9: 25, s10: 26, s11: 27,
    t3: 28, t4: 29, t5: 30, t6: 31
  };
  var NUM2ABI = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2',
    's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
    's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
    't3', 't4', 't5', 't6'];

  // opcode 定數
  var OP = 0x33, OPIMM = 0x13, LOAD = 0x03, STORE = 0x23, BRANCH = 0x63,
      JALR = 0x67, JAL = 0x6f, LUI = 0x37, AUIPC = 0x17,
      MISC = 0x0f, SYS = 0x73;

  // { m: 助記符, f: 格式, op, f3, f7, fixed, note }
  var TABLE = [
    { m: 'lui', f: 'U', op: LUI },
    { m: 'auipc', f: 'U', op: AUIPC },
    { m: 'jal', f: 'J', op: JAL },
    { m: 'jalr', f: 'I', op: JALR, f3: 0x0 },
    { m: 'beq', f: 'B', op: BRANCH, f3: 0x0 },
    { m: 'bne', f: 'B', op: BRANCH, f3: 0x1 },
    { m: 'blt', f: 'B', op: BRANCH, f3: 0x4 },
    { m: 'bge', f: 'B', op: BRANCH, f3: 0x5 },
    { m: 'bltu', f: 'B', op: BRANCH, f3: 0x6 },
    { m: 'bgeu', f: 'B', op: BRANCH, f3: 0x7 },
    { m: 'lb', f: 'I', op: LOAD, f3: 0x0 },
    { m: 'lh', f: 'I', op: LOAD, f3: 0x1 },
    { m: 'lw', f: 'I', op: LOAD, f3: 0x2 },
    { m: 'lbu', f: 'I', op: LOAD, f3: 0x4 },
    { m: 'lhu', f: 'I', op: LOAD, f3: 0x5 },
    { m: 'sb', f: 'S', op: STORE, f3: 0x0 },
    { m: 'sh', f: 'S', op: STORE, f3: 0x1 },
    { m: 'sw', f: 'S', op: STORE, f3: 0x2 },
    { m: 'addi', f: 'I', op: OPIMM, f3: 0x0 },
    { m: 'slti', f: 'I', op: OPIMM, f3: 0x2 },
    { m: 'sltiu', f: 'I', op: OPIMM, f3: 0x3 },
    { m: 'xori', f: 'I', op: OPIMM, f3: 0x4 },
    { m: 'ori', f: 'I', op: OPIMM, f3: 0x6 },
    { m: 'andi', f: 'I', op: OPIMM, f3: 0x7 },
    { m: 'slli', f: 'I', op: OPIMM, f3: 0x1, shift: true },
    { m: 'srli', f: 'I', op: OPIMM, f3: 0x5, shift: true },
    { m: 'srai', f: 'I', op: OPIMM, f3: 0x5, shift: true, f7bit: 1 },
    { m: 'add', f: 'R', op: OP, f3: 0x0, f7: 0x00 },
    { m: 'sub', f: 'R', op: OP, f3: 0x0, f7: 0x20 },
    { m: 'sll', f: 'R', op: OP, f3: 0x1, f7: 0x00 },
    { m: 'slt', f: 'R', op: OP, f3: 0x2, f7: 0x00 },
    { m: 'sltu', f: 'R', op: OP, f3: 0x3, f7: 0x00 },
    { m: 'xor', f: 'R', op: OP, f3: 0x4, f7: 0x00 },
    { m: 'srl', f: 'R', op: OP, f3: 0x5, f7: 0x00 },
    { m: 'sra', f: 'R', op: OP, f3: 0x5, f7: 0x20 },
    { m: 'or', f: 'R', op: OP, f3: 0x6, f7: 0x00 },
    { m: 'and', f: 'R', op: OP, f3: 0x7, f7: 0x00 },
    { m: 'mul', f: 'R', op: OP, f3: 0x0, f7: 0x01 },
    { m: 'mulh', f: 'R', op: OP, f3: 0x1, f7: 0x01 },
    { m: 'mulhsu', f: 'R', op: OP, f3: 0x2, f7: 0x01 },
    { m: 'mulhu', f: 'R', op: OP, f3: 0x3, f7: 0x01 },
    { m: 'div', f: 'R', op: OP, f3: 0x4, f7: 0x01 },
    { m: 'divu', f: 'R', op: OP, f3: 0x5, f7: 0x01 },
    { m: 'rem', f: 'R', op: OP, f3: 0x6, f7: 0x01 },
    { m: 'remu', f: 'R', op: OP, f3: 0x7, f7: 0x01 },
    { m: 'fence', f: 'I', op: MISC, fixed: 0x0ff0000f },
    { m: 'ecall', f: 'I', op: SYS, fixed: 0x00000073 },
    { m: 'ebreak', f: 'I', op: SYS, fixed: 0x00100073 },
    { m: 'nop', f: 'I', op: OPIMM, fixed: 0x00000013 }
  ];

  var state = { fmt: 'R', mnem: 'add', vals: {} };

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, isErr) {
    var el = $('status');
    el.textContent = msg;
    el.className = isErr ? 'error' : '';
  }

  function byMnem(m) {
    for (var i = 0; i < TABLE.length; i++) if (TABLE[i].m === m) return TABLE[i];
    return null;
  }

  function mnemsOf(fmt) {
    return TABLE.filter(function (e) { return e.f === fmt; }).map(function (e) { return e.m; });
  }

  function parseReg(s) {
    s = String(s == null ? 'x0' : s).trim();
    var mx = /^[xX](\d{1,2})$/.exec(s);
    if (mx) {
      var n = parseInt(mx[1], 10);
      if (n >= 0 && n < 32) return n;
      throw new Error('暫存器編號超出範圍：' + s);
    }
    var k = s.toLowerCase();
    if (k in ABI2NUM) return ABI2NUM[k];
    throw new Error('暫存器名稱錯誤：' + s + '（可用 x0–x31 或 ABI 別名）');
  }

  function parseImm(s) {
    s = String(s == null ? '0' : s).trim();
    if (s === '') return 0;
    var v = (/^0[xX]/).test(s) ? parseInt(s, 16) : parseInt(s, 10);
    if (isNaN(v)) throw new Error('立即數格式錯誤：' + s);
    return v;
  }

  function regName(n) { return 'x' + n + '/' + NUM2ABI[n]; }

  function bin(v, w) {
    return (v >>> 0).toString(2).padStart(w, '0');
  }
  function hex(v) {
    return '0x' + (v >>> 0).toString(16).padStart(8, '0');
  }

  function mask(v, bits) {
    return ((v | 0) & ((bits >= 32 ? 0xffffffff : (1 << bits) - 1))) >>> 0;
  }
  function signExtend(v, bits) {
    var m = 1 << (bits - 1);
    v = v & ((bits >= 32) ? 0xffffffff : (1 << bits) - 1);
    return (v ^ m) - m;
  }

  /* ---- 編碼 ---- */

  function encode(entry, v) {
    var rd = 0, rs1 = 0, rs2 = 0, imm = 0;
    if (entry.fixed != null) return entry.fixed >>> 0;
    switch (entry.f) {
      case 'R':
        rd = parseReg(v.rd); rs1 = parseReg(v.rs1); rs2 = parseReg(v.rs2);
        return (((entry.f7 & 0x7f) << 25) | ((rs2 & 31) << 20) | ((rs1 & 31) << 15) |
          ((entry.f3 & 7) << 12) | ((rd & 31) << 7) | (entry.op & 0x7f)) >>> 0;
      case 'I':
        rd = parseReg(v.rd); rs1 = parseReg(v.rs1);
        if (entry.shift) {
          var sh = parseImm(v.shamt);
          if (sh < 0 || sh > 31) throw new Error('shamt 需 0–31');
          var hi = entry.f7bit ? 0x20 : 0x00;
          return ((hi << 25) | ((sh & 31) << 20) | ((rs1 & 31) << 15) |
            ((entry.f3 & 7) << 12) | ((rd & 31) << 7) | (entry.op & 0x7f)) >>> 0;
        }
        imm = mask(parseImm(v.imm), 12);
        return ((imm << 20) | ((rs1 & 31) << 15) |
          ((entry.f3 & 7) << 12) | ((rd & 31) << 7) | (entry.op & 0x7f)) >>> 0;
      case 'S':
        rs1 = parseReg(v.rs1); rs2 = parseReg(v.rs2);
        imm = mask(parseImm(v.imm), 12);
        return ((((imm >> 5) & 0x7f) << 25) | ((rs2 & 31) << 20) | ((rs1 & 31) << 15) |
          ((entry.f3 & 7) << 12) | ((imm & 31) << 7) | (entry.op & 0x7f)) >>> 0;
      case 'B': {
        rs1 = parseReg(v.rs1); rs2 = parseReg(v.rs2);
        var off = parseImm(v.imm);
        if (off % 2 !== 0) throw new Error('B 分支位移需 2 位元組對齊');
        var u = mask(off, 13);
        var b12 = (u >> 12) & 1, b11 = (u >> 11) & 1, b10_5 = (u >> 5) & 0x3f, b4_1 = (u >> 1) & 0xf;
        return ((b12 << 31) | (b10_5 << 25) | ((rs2 & 31) << 20) | ((rs1 & 31) << 15) |
          ((entry.f3 & 7) << 12) | (b4_1 << 8) | (b11 << 7) | (entry.op & 0x7f)) >>> 0;
      }
      case 'U':
        rd = parseReg(v.rd);
        imm = mask(parseImm(v.imm), 20);
        return ((imm << 12) | ((rd & 31) << 7) | (entry.op & 0x7f)) >>> 0;
      case 'J': {
        rd = parseReg(v.rd);
        var j = parseImm(v.imm);
        if (j % 2 !== 0) throw new Error('J 跳躍位移需 2 位元組對齊');
        var ju = mask(j, 21);
        var j20 = (ju >> 20) & 1, j19_12 = (ju >> 12) & 0xff, j11 = (ju >> 11) & 1, j10_1 = (ju >> 1) & 0x3ff;
        return ((j20 << 31) | (j10_1 << 21) | (j11 << 20) | (j19_12 << 12) |
          ((rd & 31) << 7) | (entry.op & 0x7f)) >>> 0;
      }
      default:
        throw new Error('未知格式：' + entry.f);
    }
  }

  function segments(entry, word) {
    word = word >>> 0;
    function f(hi, lo) { return bin(word >>> lo, hi - lo + 1); }
    switch (entry.f) {
      case 'R': return [['funct7', f(31, 25)], ['rs2', f(24, 20)], ['rs1', f(19, 15)], ['funct3', f(14, 12)], ['rd', f(11, 7)], ['opcode', f(6, 0)]];
      case 'I':
        if (entry.shift) return [['funct7/shamt-hi', f(31, 25)], ['shamt', f(24, 20)], ['rs1', f(19, 15)], ['funct3', f(14, 12)], ['rd', f(11, 7)], ['opcode', f(6, 0)]];
        return [['imm[11:0]', f(31, 20)], ['rs1', f(19, 15)], ['funct3', f(14, 12)], ['rd', f(11, 7)], ['opcode', f(6, 0)]];
      case 'S': return [['imm[11:5]', f(31, 25)], ['rs2', f(24, 20)], ['rs1', f(19, 15)], ['funct3', f(14, 12)], ['imm[4:0]', f(11, 7)], ['opcode', f(6, 0)]];
      case 'B': return [['imm[12|10:5]', f(31, 25)], ['rs2', f(24, 20)], ['rs1', f(19, 15)], ['funct3', f(14, 12)], ['imm[4:1|11]', f(11, 7)], ['opcode', f(6, 0)]];
      case 'U': return [['imm[31:12]', f(31, 12)], ['rd', f(11, 7)], ['opcode', f(6, 0)]];
      case 'J': return [['imm[20|10:1|11|19:12]', f(31, 12)], ['rd', f(11, 7)], ['opcode', f(6, 0)]];
      default: return [['word', bin(word, 32)]];
    }
  }

  /* ---- 解碼（內建表） ---- */

  function decode(word) {
    word = word >>> 0;
    var op = word & 0x7f, rd = (word >>> 7) & 31, f3 = (word >>> 12) & 7,
        rs1 = (word >>> 15) & 31, rs2 = (word >>> 20) & 31, f7 = (word >>> 25) & 0x7f;
    // 固定字先比對
    for (var k = 0; k < TABLE.length; k++) {
      if (TABLE[k].fixed != null && (TABLE[k].fixed >>> 0) === word) {
        return { entry: TABLE[k], fields: { fixed: hex(word) } };
      }
    }
    var i, e;
    if (op === OP) {
      for (i = 0; i < TABLE.length; i++) {
        e = TABLE[i];
        if (e.f === 'R' && e.op === OP && e.f3 === f3 && e.f7 === f7) {
          return { entry: e, fields: { rd: regName(rd), rs1: regName(rs1), rs2: regName(rs2), funct7: '0x' + f7.toString(16) } };
        }
      }
    } else if (op === OPIMM) {
      var shamt = (word >>> 20) & 31;
      for (i = 0; i < TABLE.length; i++) {
        e = TABLE[i];
        if (e.f !== 'I' || e.op !== OPIMM || e.f3 !== f3 || e.fixed != null) continue;
        if (e.shift) {
          var need = e.f7bit ? 0x20 : 0x00;
          if (f7 !== need) continue;
          return { entry: e, fields: { rd: regName(rd), rs1: regName(rs1), shamt: String(shamt) } };
        }
        return { entry: e, fields: { rd: regName(rd), rs1: regName(rs1), imm: String(signExtend(word >>> 20, 12)) } };
      }
    } else if (op === LOAD) {
      var names = { 0: 'lb', 1: 'lh', 2: 'lw', 4: 'lbu', 5: 'lhu' };
      if (names[f3]) return { entry: byMnem(names[f3]), fields: { rd: regName(rd), rs1: regName(rs1), imm: String(signExtend(word >>> 20, 12)) } };
    } else if (op === STORE) {
      var sn = { 0: 'sb', 1: 'sh', 2: 'sw' };
      if (sn[f3]) {
        var simm = signExtend((((word >>> 25) & 0x7f) << 5) | ((word >>> 7) & 31), 12);
        return { entry: byMnem(sn[f3]), fields: { rs1: regName(rs1), rs2: regName(rs2), imm: String(simm) } };
      }
    } else if (op === BRANCH) {
      var bn = { 0: 'beq', 1: 'bne', 4: 'blt', 5: 'bge', 6: 'bltu', 7: 'bgeu' };
      if (bn[f3]) {
        var b = (((word >>> 31) & 1) << 12) | (((word >>> 7) & 1) << 11) |
          (((word >>> 25) & 0x3f) << 5) | (((word >>> 8) & 0xf) << 1);
        return { entry: byMnem(bn[f3]), fields: { rs1: regName(rs1), rs2: regName(rs2), imm: String(signExtend(b, 13)) } };
      }
    } else if (op === JALR) {
      if (f3 === 0) return { entry: byMnem('jalr'), fields: { rd: regName(rd), rs1: regName(rs1), imm: String(signExtend(word >>> 20, 12)) } };
    } else if (op === JAL) {
      var j = (((word >>> 31) & 1) << 20) | (((word >>> 12) & 0xff) << 12) |
        (((word >>> 20) & 1) << 11) | (((word >>> 21) & 0x3ff) << 1);
      return { entry: byMnem('jal'), fields: { rd: regName(rd), imm: String(signExtend(j, 21)) } };
    } else if (op === LUI) {
      return { entry: byMnem('lui'), fields: { rd: regName(rd), imm: hex(word >>> 12) + '（高 20 位）' } };
    } else if (op === AUIPC) {
      return { entry: byMnem('auipc'), fields: { rd: regName(rd), imm: hex(word >>> 12) + '（高 20 位）' } };
    } else if (op === SYS) {
      if (word === 0x00000073) return { entry: byMnem('ecall'), fields: {} };
      if (word === 0x00100073) return { entry: byMnem('ebreak'), fields: {} };
    } else if (op === MISC) {
      if (word === 0x0ff0000f) return { entry: byMnem('fence'), fields: {} };
    }
    return null;
  }

  /* ---- 頁面邏輯 ---- */

  function fieldDefs(entry) {
    if (entry.fixed != null) return [];
    switch (entry.f) {
      case 'R': return [{ k: 'rd', d: 'rd（x0–31/別名）' }, { k: 'rs1', d: 'rs1' }, { k: 'rs2', d: 'rs2' }];
      case 'I':
        if (entry.shift) return [{ k: 'rd', d: 'rd' }, { k: 'rs1', d: 'rs1' }, { k: 'shamt', d: 'shamt（0–31）' }];
        return [{ k: 'rd', d: 'rd' }, { k: 'rs1', d: 'rs1' }, { k: 'imm', d: 'imm（-2048–2047，可 0x）' }];
      case 'S': return [{ k: 'rs1', d: 'rs1（基址）' }, { k: 'rs2', d: 'rs2（存入）' }, { k: 'imm', d: 'offset（-2048–2047）' }];
      case 'B': return [{ k: 'rs1', d: 'rs1' }, { k: 'rs2', d: 'rs2' }, { k: 'imm', d: 'offset（位元組，偶數）' }];
      case 'U': return [{ k: 'rd', d: 'rd' }, { k: 'imm', d: 'imm（高 20 位，可 0x）' }];
      case 'J': return [{ k: 'rd', d: 'rd' }, { k: 'imm', d: 'offset（位元組，偶數）' }];
      default: return [];
    }
  }

  function defaultVals(entry) {
    var v = state.vals, out = {};
    var defs = fieldDefs(entry);
    for (var i = 0; i < defs.length; i++) {
      var k = defs[i].k;
      if (v[k] != null) { out[k] = v[k]; continue; }
      out[k] = (/^r/.test(k)) ? 'x0' : '0';
    }
    // 好看的預設：addi 範例
    if (entry.m === 'addi' && v.rd == null) { out.rd = 'x1'; out.rs1 = 'x0'; out.imm = '5'; }
    return out;
  }

  function segHtml(segs) {
    return segs.map(function (s) {
      return '<span class="seg" title="' + s[0] + '">' + s[1] + '</span>';
    }).join(' ');
  }

  function refreshEncode() {
    var entry = byMnem(state.mnem) || byMnem('add');
    var box = $('encout');
    try {
      var word = encode(entry, state.vals);
      var segs = segments(entry, word);
      var full = bin(word, 32);
      box.innerHTML = segHtml(segs) +
        '<div>hex：<span class="hex">' + hex(word) + '</span>（' + (word >>> 0) + '）</div>' +
        '<div class="hint">' + entry.m + '（' + entry.f + ' 格式）｜完整二進位：' + full + '</div>';
      setStatus('就緒', false);
    } catch (e) {
      box.innerHTML = '<span style="color:var(--danger)">' + escapeHtml(e.message) + '</span>';
      setStatus(e.message, true);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderFields() {
    var entry = byMnem(state.mnem);
    var wrap = $('fields');
    wrap.innerHTML = '';
    var vals = defaultVals(entry);
    state.vals = vals;
    var defs = fieldDefs(entry);
    if (!defs.length) {
      wrap.innerHTML = '<span class="hint">本指令為固定編碼，無欄位可調。</span>';
    }
    for (var i = 0; i < defs.length; i++) {
      (function (d) {
        var lab = document.createElement('label');
        lab.textContent = d.d + ' ';
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'fld_' + d.k;
        inp.value = vals[d.k];
        inp.size = 10;
        inp.oninput = function () { state.vals[d.k] = inp.value; refreshEncode(); };
        lab.appendChild(inp);
        wrap.appendChild(lab);
        wrap.appendChild(document.createTextNode(' '));
      })(defs[i]);
    }
    refreshEncode();
  }

  function onFmtChange() {
    state.fmt = $('fmt').value;
    var ms = mnemsOf(state.fmt);
    state.mnem = ms[0];
    state.vals = {};
    var sel = $('mnem');
    sel.innerHTML = '';
    ms.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m; o.textContent = m;
      sel.appendChild(o);
    });
    renderFields();
  }

  function onMnemChange() {
    state.mnem = $('mnem').value;
    var e = byMnem(state.mnem);
    if (e && e.f !== state.fmt) {
      state.fmt = e.f;
      $('fmt').value = e.f;
      // 重建下拉選單以保持一致
      var ms = mnemsOf(state.fmt);
      var sel = $('mnem');
      sel.innerHTML = '';
      ms.forEach(function (m) {
        var o = document.createElement('option');
        o.value = m; o.textContent = m;
        if (m === state.mnem) o.selected = true;
        sel.appendChild(o);
      });
    }
    state.vals = {};
    renderFields();
  }

  function doDecode() {
    var t = ($('hexin').value || '').trim().replace(/_/g, '').replace(/\s+/g, '');
    var box = $('decout');
    var w;
    if (/^0[xX][0-9a-fA-F]+$/.test(t)) w = parseInt(t, 16);
    else if (/^[01]{32}$/.test(t)) w = parseInt(t, 2);
    else if (/^[0-9a-fA-F]{1,8}$/.test(t)) w = parseInt(t, 16);
    else {
      box.textContent = '格式錯誤：請貼 32 位 hex（如 0x00500093）或 32 位二進位';
      setStatus('解碼輸入格式錯誤', true);
      return;
    }
    w = w >>> 0;
    var r = decode(w);
    if (!r) {
      box.textContent = hex(w) + '：內建表無法識別（可能是 C 擴充或自訂指令）';
      setStatus('無法識別', true);
      return;
    }
    var segs = segments(r.entry, w);
    var html = '<div>' + segHtml(segs) + '</div>';
    html += '<table class="fields"><tr><th>欄位</th><th>值</th></tr>';
    html += '<tr><td>助記符</td><td>' + r.entry.m + '（' + r.entry.f + ' 格式）</td></tr>';
    Object.keys(r.fields).forEach(function (k) {
      html += '<tr><td>' + escapeHtml(k) + '</td><td>' + escapeHtml(r.fields[k]) + '</td></tr>';
    });
    html += '</table>';
    // RVJS.disassemble 對照（防禦：缺席時略過）
    try {
      if (globalThis.RVJS && typeof globalThis.RVJS.disassemble === 'function') {
        var lines = globalThis.RVJS.disassemble([w], 0) || [];
        if (lines.length) html += '<div class="hint">RVJS.disassemble：' + escapeHtml(lines[0]) + '</div>';
      } else {
        html += '<div class="hint">（RVJS 未載入：lib/ 撰寫中，此行為內建表結果）</div>';
      }
    } catch (e) {
      html += '<div class="hint">（RVJS.disassemble 失敗：' + escapeHtml(e.message) + '）</div>';
    }
    box.innerHTML = html;
    setStatus('解碼完成：' + r.entry.m, false);
  }

  function init() {
    var sel = $('mnem');
    sel.innerHTML = '';
    mnemsOf(state.fmt).forEach(function (m) {
      var o = document.createElement('option');
      o.value = m; o.textContent = m;
      if (m === state.mnem) o.selected = true;
      sel.appendChild(o);
    });
    renderFields();
  }

  globalThis.Enc = {
    onFmtChange: onFmtChange,
    onMnemChange: onMnemChange,
    onFieldInput: refreshEncode,
    doDecode: doDecode
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
