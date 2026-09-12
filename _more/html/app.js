(function () {
  "use strict";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function byId(id) { return document.getElementById(id); }
  function u16(v) { return (v & 0xFFFF) >>> 0; }
  function s16(v) { v = u16(v); return v > 32767 ? v - 65536 : v; }
  function bit(v, i) { return (v >>> i) & 1; }
  function hex16(v) { return u16(v).toString(16).padStart(4, "0").toUpperCase(); }
  function bindec(v) { return "0b" + u16(v).toString(2).padStart(16, "0"); }

  function parseHexField(input) {
    var s = input.value.trim();
    if (/^0b[01]+$/.test(s)) return u16(parseInt(s.slice(2), 2));
    if (/^[0-9a-fA-F]{1,4}$/.test(s)) return u16(parseInt(s, 16));
    return u16(parseInt(s, 10)) || 0;
  }
  function parseDec(s) {
    if (/^0b[01]+$/.test(s)) return parseInt(s.slice(2), 2);
    return parseInt(s, 10);
  }

  function bits16(container, value) {
    container.textContent = "";
    for (var i = 15; i >= 0; i--) {
      container.append(el("span", bit(value, i) ? "on" : "", String(bit(value, i))));
    }
  }
  function bits8(container, value) {
    container.textContent = "";
    for (var i = 7; i >= 0; i--) {
      container.append(el("span", bit(value, i) ? "on" : "", String(bit(value, i))));
    }
  }

  /* ============================= 01 邏輯閘 ============================= */
  var GATE_DEF = [
    { id: "g-nand", name: "Nand", hdl: "CHIP Nand { IN a,b; OUT out; }",
      ins: ["a", "b"], outs: ["out"],
      f: function (a) { return [! (a[0] && a[1]) ? 1 : 0]; },
      note: "Nand 是整套課程唯一「假設已存在」的原始閘，其他全部由它組成。真值表只有「全 1 得 0」一種例外。" },
    { id: "g-not", name: "Not", hdl: "CHIP Not { IN in; OUT out; }",
      ins: ["in"], outs: ["out"],
      f: function (a) { return [a[0] ? 0 : 1]; },
      note: "Nand(x,x) = not(x and x) = not x。所以 Not = 把 Nand 的兩個輸入接在一起（1 個 Nand）。" },
    { id: "g-and", name: "And", hdl: "CHIP And { IN a,b; OUT out; }",
      ins: ["a", "b"], outs: ["out"],
      f: function (a) { return [(a[0] && a[1]) ? 1 : 0]; },
      note: "Nand(a,b) 再取 Not：And(a,b) = not(nand(a,b))，需要 2 個 Nand。" },
    { id: "g-or", name: "Or", hdl: "CHIP Or { IN a,b; OUT out; }",
      ins: ["a", "b"], outs: ["out"],
      f: function (a) { return [(a[0] || a[1]) ? 1 : 0]; },
      note: "德摩根定律：or(a,b) = not(not a and not b)。先用 2 個 Not 取反，再 Nand（合計 3 個 Nand）。" },
    { id: "g-xor", name: "Xor", hdl: "CHIP Xor { IN a,b; OUT out; }",
      ins: ["a", "b"], outs: ["out"],
      f: function (a) { return [(a[0] ^ a[1])]; },
      note: "xor(a,b) = and(a, not b) or and(not a, b)。這是「互斥或」：兩輸入不同才為 1，需要 4 個 Nand。" },
    { id: "g-mux", name: "Mux", hdl: "CHIP Mux { IN a,b,sel; OUT out; }",
      ins: ["a", "b", "sel"], outs: ["out"],
      f: function (a) { return [a[2] ? a[1] : a[0]]; },
      note: "二選一多工器：sel=0 輸出 a，sel=1 輸出 b。做加法器等組合電路時的「開關」。公式：out = (a and not sel) or (b and sel)。" },
    { id: "g-dmux", name: "DMux", hdl: "CHIP DMux { IN in,sel; OUT a,b; }",
      ins: ["in", "sel"], outs: ["a", "b"],
      f: function (a) { return [a[1] ? 0 : a[0], a[1] ? a[0] : 0]; },
      note: "一對二解多工器：sel=0 時 in 送到 a，sel=1 時 in 送到 b。是 Mux 的逆操作，用來「選擇把資料寫到哪個位置」。",
      outIs1: true }
  ];

  function buildGate(cfg) {
    var c = byId(cfg.id);
    if (!c) return;
    var vals = cfg.ins.map(function () { return 0; });
    var panel = el("div", "panel sim");
    var t = el("div", "ptitle");
    t.append(cfg.name + " 互動模擬");
    panel.append(t);
    var pre = el("pre");
    pre.classList.add("hdlsig");
    pre.append(cfg.hdl);
    panel.append(pre);

    function refresh() {
      var outs = cfg.f(vals);
      outs.forEach(function (o, i) {
        var v = c.querySelector('.out-' + i + ' .vout');
        if (v) {
          v.textContent = String(o);
          v.className = "vout" + (o ? "" : "");
        }
      });
      var rows = panel.querySelectorAll("table.tt tr[data-r]");
      rows.forEach(function (r) {
        var bitsRow = r.getAttribute("data-bits");
        var ok = bitsRow.split("").every(function (ch, k) {
          return ch === "-" || (ch === "1" ? vals[k] === 1 : vals[k] === 0);
        });
        r.classList.toggle("hl", ok);
      });
    }

    var io = el("div", "io");
    var ins = el("div", "ins");
    ins.append(el("div", "sigline", "輸入："));
    var inRow = el("div", "chiprow");
    vals.forEach(function (_, i) {
      var ch = el("span", "chip", cfg.ins[i]);
      ch.onclick = function () { vals[i] = 1 - vals[i]; ch.classList.toggle("on"); refresh(); };
      inRow.append(ch);
    });
    ins.append(inRow);
    io.append(ins);
    var outs = el("div", "ins");
    outs.append(el("div", "sigline", "輸出："));
    cfg.outs.forEach(function (o, i) {
      var line = el("div", "sigline out-" + i);
      line.append(el("span", "sig", o + " = "), el("span", "vout", ""));
      outs.append(line);
    });
    io.append(outs);
    panel.append(io);

    var table = el("table", "tt");
    var nr = cfg.ins.length, ncols = nr + cfg.outs.length;
    var thead = el("tr");
    cfg.ins.forEach(function (n) { thead.append(el("th", "", n)); });
    cfg.outs.forEach(function (n) { thead.append(el("th", "", n)); });
    table.append(thead);
    for (var mask = 0; mask < Math.pow(2, nr); mask++) {
      var iv = [];
      for (var j = 0; j < nr; j++) iv.push((mask >> j) & 1);
      var ov = cfg.f(iv);
      var tr = el("tr");
      tr.setAttribute("data-r", "1");
      tr.setAttribute("data-bits", iv.concat(ov).join(""));
      iv.forEach(function (b) { tr.append(el("td", "", String(b))); });
      ov.forEach(function (b) { tr.append(el("td", "", String(b))); });
      table.append(tr);
    }
    panel.append(table);
    panel.append(el("div", "prose note", cfg.note));
    c.append(panel);
  }

  /* ------------------- 16 位元 / 寬位元元件 ------------------- */
  function multiWidget(container, cfg) {
    var state = {};
    cfg.fields.forEach(function (f) { state[f.k] = f.def; });
    var panel = el("div", "panel sim");
    var t = el("div", "ptitle");
    t.append(cfg.name + " 互動模擬");
    panel.append(t);
    panel.append(el("div", "prose", cfg.desc));

    function refresh() {
      var out = cfg.compute(state);
      Object.keys(out).forEach(function (k) {
        var box = panel.querySelector(".out-" + k);
        if (!box) return;
        if (box.dataset.w === "16") { bits16(box, out[k]); box.dataset.s16 = String(s16(out[k])); }
        else { box.textContent = String(out[k]); box.className = "vout" + (out[k] ? "" : ""); }
      });
      var meta = panel.querySelector(".s16meta");
      if (meta) meta.textContent = "有號數： " + (panel.querySelector(".out-first") ? panel.querySelector(".out-first").dataset.s16 : "");
      cfg.fields.forEach(function (f) {
        var led = panel.querySelector(".v-" + f.k);
        if (led && f.kind === "chip") {
          led.className = "chip v-" + f.k + (state[f.k] ? " on" : "");
        }
      });
    }

    function hexInput(f) {
      var d = el("div", "field");
      d.append(el("label", "", f.label + " (hex)"));
      var inp = el("input", "hexin");
      inp.value = hex16(state[f.k]);
      inp.title = "可輸入 4 位 16 進位（如 00A5）、0b 二進位或十進位";
      inp.oninput = function () { state[f.k] = parseHexField(inp); refresh(); };
      d.append(inp);
      var rnd = el("button", "btn small", "隨機");
      rnd.onclick = function () {
        state[f.k] = Math.floor(Math.random() * 65536);
        inp.value = hex16(state[f.k]);
        refresh();
      };
      d.append(rnd);
      return d;
    }
    function chipInput(f) {
      var d = el("div", "field");
      d.append(el("label", "", f.label));
      var ch = el("span", "chip v-" + f.k + (state[f.k] ? " on" : ""), "0");
      ch.onclick = function () {
        state[f.k] = 1 - state[f.k];
        ch.classList.toggle("on");
        ch.textContent = String(state[f.k]);
        refresh();
      };
      d.append(ch);
      return d;
    }

    cfg.fields.forEach(function (f) {
      if (f.kind === "chips8") {
        panel.append(chips8Input(f, state, refresh, panel));
      } else {
        panel.append(f.kind === "hex" ? hexInput(f) : chipInput(f));
      }
    });
    var orow = el("div", "io");
    cfg.outs.forEach(function (o) {
      var box = el("span", o.w === "16" ? "bits out-" + o.k : "vout out-" + o.k);
      box.dataset.w = o.w;
      var line = el("div", "sigline");
      line.append(el("span", "sig", o.label + " = "));
      line.append(box);
      orow.append(line);
    });
    if (cfg.outs.some(function (o) { return o.w === "16"; })) {
      var meta = el("div", "sigline sig s16meta");
      meta.textContent = "";
      orow.append(meta);
    }
    panel.append(orow);
    panel.append(el("div", "prose note", cfg.note));
    container.append(panel);
    refresh();
  }

  var MULTI_DEF = [
    { id: "g-not16", name: "Not16", desc: "16 位元逐位取反：out[i] = not(in[i])（i = 0..15）。",
      fields: [{ k: "x", label: "in", kind: "hex", def: 0x0F0F }],
      outs: [{ k: "out", label: "out", w: "16" }],
      compute: function (s) { return { out: (~u16(s.x)) & 0xFFFF }; },
      note: "等於把 16 個 Not 閘串排：機械式地把每個位元反轉。" },
    { id: "g-and16", name: "And16", desc: "16 位元逐位 AND：out[i] = and(x[i], y[i])。",
      fields: [{ k: "x", label: "x", kind: "hex", def: 0x00FF }, { k: "y", label: "y", kind: "hex", def: 0x0F0F }],
      outs: [{ k: "out", label: "out", w: "16" }],
      compute: function (s) { return { out: u16(s.x) & u16(s.y) }; },
      note: "常用來「遮罩」：x & 0x00FF 只保留低 8 位元。" },
    { id: "g-or16", name: "Or16", desc: "16 位元逐位 OR：out[i] = or(x[i], y[i])。",
      fields: [{ k: "x", label: "x", kind: "hex", def: 0x00FF }, { k: "y", label: "y", kind: "hex", def: 0x0F0F }],
      outs: [{ k: "out", label: "out", w: "16" }],
      compute: function (s) { return { out: u16(s.x) | u16(s.y) }; },
      note: "搭配德摩根定律，用它就可以拼出多數邏輯運算。" },
    { id: "g-mux16", name: "Mux16", desc: "16 位元二選一：sel=0 取 x，sel=1 取 y。",
      fields: [{ k: "x", label: "x", kind: "hex", def: 0x1234 }, { k: "y", label: "y", kind: "hex", def: 0xABCD }, { k: "sel", label: "sel", kind: "chip", def: 0 }],
      outs: [{ k: "out", label: "out", w: "16" }],
      compute: function (s) { return { out: s.sel ? u16(s.y) : u16(s.x) }; },
      note: "CPU 裡拿它當「資料選擇開關」，例如選 ALU 結果送進 A 暫存器還是 D 暫存器。" },
    { id: "g-or8", name: "Or8Way", desc: "8 輸入 OR：只要任一 in[i]=1，out=1。",
      fields: [{ k: "bits", label: "in[0..7]", kind: "chips8", def: 0 }],
      outs: [{ k: "out", label: "out", w: "1" }],
      compute: function (s) { return { out: s.bits ? 1 : 0 }; },
      note: "ALU 用它偵測「結果是否有任何一個位元為 1」，再取反就得到 zr（是否為零）。" },
    { id: "g-mux4", name: "Mux4Way16", desc: "四選一：以 2 個選位 sel[1:0] 挑出 a、b、c、d 其一。",
      fields: [{ k: "a", label: "a", kind: "hex", def: 0x1111 }, { k: "b", label: "b", kind: "hex", def: 0x2222 }, { k: "c", label: "c", kind: "hex", def: 0x3333 }, { k: "d", label: "d", kind: "hex", def: 0x4444 }, { k: "sel1", label: "sel[1]", kind: "chip", def: 0 }, { k: "sel0", label: "sel[0]", kind: "chip", def: 0 }],
      outs: [{ k: "out", label: "out", w: "16" }],
      compute: function (s) {
        var i = s.sel1 * 2 + s.sel0;
        return { out: [u16(s.a), u16(s.b), u16(s.c), u16(s.d)][i] };
      },
      note: "實作上由三個 Mux16 樹狀組合，這是「編碼選擇 → 解多工」的標準型態（DMux 的逆）。" },
    { id: "g-mux8", name: "Mux8Way16", desc: "八選一：以 3 個選位 sel[2:0] 挑出 a…h 其一。",
      fields: (function () {
        var fs = [];
        "abcdefgh".split("").forEach(function (ch, i) {
          fs.push({ k: ch, label: ch, kind: "hex", def: (i + 1) * 0x1111 });
        });
        ["sel2", "sel1", "sel0"].forEach(function (k, i) {
          fs.push({ k: k, label: "sel[" + i + "]", kind: "chip", def: 0 });
        });
        return fs;
      })(),
      outs: [{ k: "out", label: "out", w: "16" }],
      compute: function (s) {
        var i = s.sel2 * 4 + s.sel1 * 2 + s.sel0;
        return { out: u16(s["abcdefgh"[i]]) || 0 };
      },
      note: "試著把輸出換成有號數觀察：sel=111 時取 h。RAM16K 選擇 word 就是用這種「大 Mux 樹」。" },
    { id: "g-dmux4", name: "DMux4Way", desc: "一對四解多工（1 位元）：把 in 送到 sel 指向的那一根輸出，其餘為 0。",
      fields: [{ k: "in", label: "in", kind: "chip", def: 1 }, { k: "sel1", label: "sel[1]", kind: "chip", def: 0 }, { k: "sel0", label: "sel[0]", kind: "chip", def: 0 }],
      outs: [{ k: "a", label: "a", w: "1" }, { k: "b", label: "b", w: "1" }, { k: "c", label: "c", w: "1" }, { k: "d", label: "d", w: "1" }],
      compute: function (s) {
        var o = [0, 0, 0, 0];
        o[s.sel1 * 2 + s.sel0] = s.in;
        return { a: o[0], b: o[1], c: o[2], d: o[3] };
      },
      note: "對照 Mux4Way16：選位相同，只是把「進」變成「出」。" },
    { id: "g-dmux8", name: "DMux8Way", desc: "一對八解多工（1 位元）：以 sel[2:0] 選出 a…h 其一接受 in。",
      fields: [{ k: "in", label: "in", kind: "chip", def: 1 }, { k: "sel2", label: "sel[2]", kind: "chip", def: 0 }, { k: "sel1", label: "sel[1]", kind: "chip", def: 0 }, { k: "sel0", label: "sel[0]", kind: "chip", def: 0 }],
      outs: "abcdefgh".split("").map(function (ch) { return { k: ch, label: ch, w: "1" }; }),
      compute: function (s) {
        var o = new Array(8).fill(0);
        o[s.sel2 * 4 + s.sel1 * 2 + s.sel0] = s.in;
        var r = {};
        "abcdefgh".split("").forEach(function (ch, i) { r[ch] = o[i]; });
        return r;
      },
      note: "RAM 的「寫入致能解碼」就是這個原理：位址選到哪個 word，load 訊號就送進哪一個。" }
  ];

  function chips8Input(f, state, refresh, panel) {
    var d = el("div", "field");
    d.append(el("label", "", f.label));
    var row = el("div", "chiprow");
    for (var i = 7; i >= 0; i--) {
      (function (i) {
        var ch = el("span", "chip", String(i) + ":" + bit(state.bits, i));
        ch.onclick = function () {
          state.bits = u16(state.bits) ^ (1 << i);
          ch.textContent = String(i) + ":" + bit(state.bits, i);
          ch.classList.toggle("on", !!bit(state.bits, i));
          refresh();
        };
        row.append(ch);
      })(i);
    }
    d.append(row);
    return d;
  }

  /* ============================= 02 加法器 / ALU ============================= */
  function buildAdder() {
    var c = byId("halfadder");
    if (c) {
      var a = 0, b = 0;
      var panel = el("div", "panel sim");
      panel.append(klassTitle("HalfAdder：sum = a xor b，carry = a and b"));
      var io = mkTwoIn("HalfAdder", "a", "b", a, b, function (av, bv) {
        a = av; b = bv;
      });
      panel.append(io.div);
      var outrow = el("div", "sigline");
      outrow.append(el("span", "sig", "sum = "));
      var sumV = el("span", "vout o", "0");
      var carV = el("span", "vout", "0");
      outrow.append(sumV, el("span", "sig", "　carry = "), carV);
      panel.append(outrow);
      function upd() {
        var s = a ^ b, cy = a & b;
        sumV.textContent = String(s);
        sumV.className = "vout o" + (s ? "" : "");
        carV.textContent = String(cy);
      }
      io.chips.forEach(function (ch, i) {
        ch.onclick = function () {
          if (i === 0) { a = 1 - a; } else { b = 1 - b; }
          io.chips[i].textContent = String(i === 0 ? a : b);
          io.chips[i].classList.toggle("on", i === 0 ? !!a : !!b);
          upd();
        };
      });
      upd();
      panel.append(ktable([
        ["a", "b", "sum", "carry"],
        ["0", "0", "0", "0"],
        ["0", "1", "1", "0"],
        ["1", "0", "1", "0"],
        ["1", "1", "0", "1"]
      ]));
      panel.append(el("div", "prose note", "半加器不接收進位輸入，所以 1+1=2 只有在多個位元串接（全加器）時才有意義。"));
      c.append(panel);
    }

    var c2 = byId("fulladder");
    if (c2) {
      var va = 0, vb = 0, vc = 0;
      var panel = el("div", "panel sim");
      panel.append(klassTitle("FullAdder：持續把 a、b、cin 三者相加，輸出 sum 與新進位 carry"));
      var io = el("div", "io");
      var row = el("div", "chiprow");
      var chips = [];
      ["a", "b", "cin"].forEach(function (n) {
        var ch = el("span", "chip", n);
        chips.push(ch);
        row.append(ch);
      });
      io.append(el("div", "sigline ins", "輸入："), row);
      panel.append(io);
      var outrow = el("div", "sigline");
      outrow.append(el("span", "sig", "sum = "), el("span", "vout o", "0"), el("span", "sig", "　carry = "), el("span", "vout", "0"));
      panel.append(outrow);
      function upd() {
        var vals = chips.map(function (ch) { return ch.classList.contains("on") ? 1 : 0; });
        va = vals[0]; vb = vals[1]; vc = vals[2];
        var sum = va ^ vb ^ vc;
        var cy = (va & vb) | (vc & (va ^ vb));
        outrow.children[1].textContent = String(sum);
        outrow.children[3].textContent = String(cy);
      }
      chips.forEach(function (ch) {
        ch.onclick = function () { ch.classList.toggle("on"); upd(); };
      });
      upd();
      panel.append(ktable([
        ["a", "b", "cin", "sum", "carry"],
        ["0", "0", "0", "0", "0"],
        ["0", "0", "1", "1", "0"],
        ["0", "1", "0", "1", "0"],
        ["0", "1", "1", "0", "1"],
        ["1", "0", "0", "1", "0"],
        ["1", "0", "1", "0", "1"],
        ["1", "1", "0", "0", "1"],
        ["1", "1", "1", "1", "1"]
      ]));
      panel.append(el("div", "prose note", "累計的進位：1+1+1 = 3，二進位是 11，所以 carry=1、sum=1。Add16 就是 16 個全加器串接。"));
      c2.append(panel);
    }

    var c3 = byId("add16");
    if (c3) {
      multiWidget(c3, {
        id: "add16-w",
        name: "Add16",
        desc: "16 位元加法器：out = x + y（二補數，溢位自動捨棄）。",
        fields: [{ k: "x", label: "x", kind: "hex", def: 0x0005 }, { k: "y", label: "y", kind: "hex", def: 0x0003 }],
        outs: [{ k: "out", label: "out", w: "16" }],
        compute: function (s) { return { out: (u16(s.x) + u16(s.y)) & 0xFFFF }; },
        note: "輸入 0xFFFF（-1）與 0x0001（1）：輸出 0，這就是二補數「-1 + 1 = 0」的硬體實作。"
      });
    }
    var c4 = byId("inc16");
    if (c4) {
      multiWidget(c4, {
        id: "inc16-w",
        name: "Inc16",
        desc: "遞增器：out = in + 1（把 Add16 的一個輸入固定為 1）。",
        fields: [{ k: "x", label: "in", kind: "hex", def: 0x0007 }],
        outs: [{ k: "out", label: "out", w: "16" }],
        compute: function (s) { return { out: (u16(s.x) + 1) & 0xFFFF }; },
        note: "39 之後是 3A（10 進位 58）→ 3B…。程式計數器 PC 每步＋1 就靠它。"
      });
    }
  }

  var ALU18 = [
    [1, 0, 1, 0, 1, 0, "0"],
    [1, 1, 1, 1, 1, 1, "1"],
    [1, 1, 1, 0, 1, 0, "-1"],
    [0, 0, 1, 1, 0, 0, "x"],
    [1, 1, 0, 0, 0, 0, "y"],
    [0, 0, 1, 1, 0, 1, "!x"],
    [1, 1, 0, 0, 0, 1, "!y"],
    [0, 0, 1, 1, 1, 1, "-x"],
    [1, 1, 0, 0, 1, 1, "-y"],
    [0, 1, 1, 1, 1, 1, "x+1"],
    [1, 1, 0, 1, 1, 1, "y+1"],
    [0, 0, 1, 1, 1, 0, "x-1"],
    [1, 1, 0, 0, 1, 0, "y-1"],
    [0, 0, 0, 0, 1, 0, "x+y"],
    [0, 1, 0, 0, 1, 1, "x-y"],
    [0, 0, 0, 1, 1, 1, "y-x"],
    [0, 0, 0, 0, 0, 0, "x&y"],
    [0, 1, 0, 1, 0, 1, "x|y"]
  ];

  function buildALU() {
    var c = byId("alu");
    if (!c) return;
    var st = { zx: 0, nx: 0, zy: 0, ny: 0, f: 1, no: 0, x: 0x0006, y: 0x0004 };
    var panel = el("div", "panel sim height16");
    panel.append(klassTitle("Hack ALU 互動：6 個控制位元 zx nx zy ny f no 決定 18 種函式"));

    function quicktest() {
      var sel = byId("alu-fn");
      if (!sel) return;
      var v = parseInt(sel.value, 10);
      var row = ALU18[v];
      ["zx", "nx", "zy", "ny", "f", "no"].forEach(function (k, i) {
        st[k] = row[i];
        var ch = panel.querySelector(".ch-" + k);
        ch.classList.toggle("on", !!row[i]);
        ch.textContent = String(row[i]);
      });
      refresh();
    }

    var fnrow = el("div", "field");
    fnrow.append(el("label", "", "18 種函式"));
    var sel = el("select", "btn");
    sel.id = "alu-fn";
    var labels = ["0", "1", "-1", "x", "y", "!x", "!y", "-x", "-y", "x+1", "y+1", "x-1", "y-1", "x+y", "x-y", "y-x", "x&y", "x|y"];
    labels.forEach(function (lb, i) {
      var o = el("option", "", lb);
      o.value = String(i);
      if (i === 13) o.selected = true;
      sel.append(o);
    });
    sel.onchange = quicktest;
    fnrow.append(sel);
    panel.append(fnrow);

    function hexInput(k, label) {
      var d = el("div", "field");
      d.append(el("label", "", label));
      var inp = el("input", "hexin");
      inp.value = hex16(st[k]);
      inp.oninput = function () { st[k] = parseHexField(inp); refresh(); };
      d.append(inp);
      return d;
    }
    panel.append(hexInput("x", "x (hex)"));
    panel.append(hexInput("y", "y (hex)"));

    function ctrl(label, k) {
      var d = el("div", "field");
      d.append(el("label", "", label));
      var ch = el("span", "chip ch-" + k, st[k] ? "1" : "0");
      ch.onclick = function () { st[k] = 1 - st[k]; ch.classList.toggle("on"); ch.textContent = String(st[k]); refresh(); };
      d.append(ch);
      d.title = label + "=1 時啟用";
      return d;
    }
    var ctr = el("div", "sigline");
    ctr.append(el("span", "sig", "控制位元："));
    ["zx", "nx", "zy", "ny", "f", "no"].forEach(function (k) {
      ctr.append(ctrl(k, k));
    });
    panel.append(ctr);

    var outrow = el("div", "io");
    var outbits = el("span", "bits out-bits");
    var outdec = el("span", "sig out-dec");
    var zrV = el("span", "vout zr-v");
    var ngV = el("span", "vout ng-v");
    var b1 = el("div", "sigline");
    b1.append(el("span", "sig", "out = "), outbits);
    var b2 = el("div", "sigline");
    b2.append(el("span", "sig", "有號數 "), outdec, el("span", "sig", "　zr = "), zrV, el("span", "sig", "　ng = "), ngV);
    outrow.append(b1, b2);
    panel.append(outrow);

    function refresh() {
      var res = aluCompute(st.x, st.y, st.zx, st.nx, st.zy, st.ny, st.f, st.no);
      bits16(outbits, res.out);
      outdec.textContent = String(s16(res.out));
      zrV.textContent = String(res.zr);
      ngV.textContent = String(res.ng);
    } 
    panel.append(ktable([
      ["zx+nx 的作用", "先歸零(zx)再取反(nx)"],
      ["f=1", "out = x + y（相加）"],
      ["f=0", "out = x & y（AND）"],
      ["no=1", "out = !out（取反輸出）"],
      ["zr", "out == 0 時為 1"],
      ["ng", "out < 0（最高位為 1）時為 1"]
    ]));
    c.append(panel);
    refresh();
  }
  function aluCompute(x, y, zx, nx, zy, ny, f, no) {
    x = u16(x); y = u16(y);
    if (zx) x = 0;
    if (nx) x = (~x) & 0xFFFF;
    if (zy) y = 0;
    if (ny) y = (~y) & 0xFFFF;
    var out = f ? ((x + y) & 0xFFFF) : (x & y);
    if (no) out = (~out) & 0xFFFF;
    return { out: out, zr: out === 0 ? 1 : 0, ng: (out & 0x8000) ? 1 : 0 };
  }

  /* ============================= 03 RAM8 / PC ============================= */
  function buildRAM8() {
    var c = byId("ram8");
    if (!c) return;
    var mem = new Array(8).fill(0);
    var st = { addr: 0, in: 0x1234, load: 0 };
    var panel = el("div", "panel sim");
    panel.append(klassTitle("迷你 RAM8：只有 load=1 的那一拍才把 in 寫入 address 指向的 word"));

    function hexIn(label, k) {
      var d = el("div", "field");
      d.append(el("label", "", label));
      var inp = el("input", "hexin");
      inp.value = hex16(st[k]);
      inp.oninput = function () { st[k] = parseHexField(inp); refresh(); };
      d.append(inp);
      return d;
    }
    panel.append(hexIn("address", "addr"));
    panel.append(hexIn("in", "in"));

    var ld = el("div", "field");
    ld.append(el("label", "", "load"));
    var lc = el("span", "chip", "0");
    lc.onclick = function () { st.load = 1 - st.load; lc.textContent = String(st.load); lc.classList.toggle("on", !!st.load); refresh(); };
    ld.append(lc);
    panel.append(ld);

    var ticks = el("div", "sigline");
    var tick = el("button", "btn primary", "▶ 時間步 tick（提交）");
    tick.onclick = function () {
      if (st.load) mem[st.addr % 8] = u16(st.in);
      stepFlash("已提交：RAM[" + (st.addr % 8) + "] ← " + (st.load ? hex16(st.in) : "（load=0，維持原值）"));
      refresh();
    };
    ticks.append(tick);
    var flash = el("span", "sig");
    flash.style.color = "#0891b2";
    ticks.append(flash);
    panel.append(ticks);

    var t = el("table", "tt");
    var tr0 = el("tr");
    tr0.append(el("th", "", "位址"));
    tr0.append(el("th", "", "內容 (hex)"));
    tr0.append(el("th", "", "內容 (有號)"));
    t.append(tr0);
    panel.append(t);
    var rows = [];

    function stepFlash(msg) {
      flash.textContent = msg;
      setTimeout(function () { flash.textContent = ""; }, 1600);
    }
    function refresh() {
      rows.forEach(function (r) {
        r.cells[1].textContent = hex16(mem[r.dataset.i]);
        r.cells[2].textContent = String(s16(mem[r.dataset.i]));
        r.classList.toggle("hl", Number(r.dataset.i) === st.addr % 8);
      });
    }
    for (var i = 0; i < 8; i++) {
      var r = el("tr");
      r.dataset.i = String(i);
      r.append(el("td", "", "RAM[" + i + "]"));
      r.append(el("td", "", hex16(0)));
      r.append(el("td", "", "0"));
      t.append(r);
      rows.push(r);
    }
    refresh();
    panel.append(el("div", "prose note", "把它「放大 2048 倍」就是 RAM16K。實際的 Register/Bit 也一樣：load 決定「鎖住」還是「覆寫」。"));
    c.append(panel);
  }

  function buildPC() {
    var c = byId("pc");
    if (!c) return;
    var st = { out: 0, inc: 1, load: 0, reset: 0, in: 0x000A };
    var panel = el("div", "panel sim");
    panel.append(klassTitle("程式計數器 PC：每拍 inc（＋1）、load（載入 in）、reset（歸零）三選一"));

    var hexr = el("div", "field");
    hexr.append(el("label", "", "in (hex)"));
    var inp = el("input", "hexin");
    inp.value = hex16(st.in);
    inp.oninput = function () { st.in = parseHexField(inp); };
    hexr.append(inp);
    panel.append(hexr);

    function btn(label, k) {
      var b = el("button", "btn" + (k === "inc" ? " primary" : ""), label);
      b.onclick = function () {
        Object.keys({ inc: 1, load: 1, reset: 1 }).forEach(function (kk) { st[kk] = 0; });
        st[k] = 1;
        mark(btnState);
        refresh(true);
      };
      return b;
    }
    var btnState = el("div", "sigline");
    var binc = btn("inc（+1）", "inc");
    var bload = btn("load＝in", "load");
    var breset = btn("reset→0", "reset");
    btnState.append(binc, bload, breset);
    panel.append(btnState);

    var outrow = el("div", "sigline");
    outrow.append(el("span", "sig", "下一次輸出 out（下一拍的值） = "));
    var outV = el("span", "vout o", "");
    outrow.append(outV);
    panel.append(outrow);

    function mark(row) {
      row.innerHTML = "";
      row.append(binc, bload, breset);
      [binc, bload, breset].forEach(function (b) {
        b.classList.toggle("primary", b === row.querySelector(".primary"));
      });
    }
    function refresh(show) {
      if (show) {
        outV.textContent = [
          "0x" + hex16(st.in), "0x0000"
        ][0];
      }
      var next = st.reset ? 0 : (st.load ? u16(st.in) : (u16(st.out) + 1) & 0xFFFF);
      outV.textContent = "0x" + hex16(next) + "（二進位 " + bindec(next) + "）";
      binc.classList.toggle("primary", st.inc === 1);
    }
    refresh(false);
    panel.append(ktable([
      ["inc", "out ← out + 1（平常每拍）"],
      ["load", "out ← in（jump 時載入目標位址）"],
      ["reset", "out ← 0（重開機，優先權最高）"]
    ]));
    c.append(panel);
  }

  /* ============================= 04/06 組譯器 ============================= */
  var ASM_SYMBOLS = { R0: 0, R1: 1, R2: 2, R3: 3, R4: 4, R5: 5, R6: 6, R7: 7, R8: 8, R9: 9, R10: 10, R11: 11, R12: 12, R13: 13, R14: 14, R15: 15, SP: 0, LCL: 1, ARG: 2, THIS: 3, THAT: 4, SCREEN: 16384, KBD: 24576 };
  var ASM_COMP = {
    "0101010": "0", "0111111": "1", "0111010": "-1", "0001100": "D", "0110000": "A",
    "0001101": "!D", "0110001": "!A", "0001111": "-D", "0110011": "-A",
    "0011111": "D+1", "0110111": "A+1", "0001110": "D-1", "0110010": "A-1",
    "0000010": "D+A", "0010011": "D-A", "0000111": "A-D", "0000000": "D&A", "0010101": "D|A",
    "1110000": "M", "1110001": "!M", "1110011": "-M", "1110111": "M+1",
    "1110010": "M-1", "1000010": "D+M", "1010011": "D-M", "1000111": "M-D",
    "1000000": "D&M", "1010101": "D|M"
  };
  var ASM_DEST = { "000": "", "001": "M", "010": "D", "011": "MD", "100": "A", "101": "AM", "110": "AD", "111": "AMD" };
  var ASM_JUMP = { "000": "", "001": "JGT", "010": "JEQ", "011": "JGE", "100": "JLT", "101": "JNE", "110": "JLE", "111": "JMP" };

  function asmDecodeC(bits) {
    var a = bits.charAt(3);
    var comp = ASM_COMP[a + bits.slice(4, 10)];
    var dest = ASM_DEST[bits.slice(10, 13)];
    var jump = ASM_JUMP[bits.slice(13, 16)];
    return { a: a, cbits: bits.slice(4, 10), comp: comp || "?", dest: dest, jump: jump };
  }
  function asmSemantic(d) {
    var parts = [];
    if (d.dest) parts.push("目的地：寫入 " + d.dest.split("").join(" 與 ") + (d.dest.indexOf("M") >= 0 ? "（writeM 啟動，寫記憶體）" : ""));
    var alu = d.comp + (d.a === "1" ? "（以 M 為 y 來源）" : "");
    parts.push("ALU 運算：" + alu);
    if (d.jump) parts.push("跳轉：" + d.jump + "（ALU out 滿足條件即載入 PC）");
    return parts.join("；");
  }

  function assemble(src) {
    var lines = src.split(/\r?\n/);
    var codes = [], lineNo = [];
    lines.forEach(function (ln, i) {
      var s = ln.replace(/\/\/.*$/, "").trim();
      if (!s) return;
      if (/^\(.*\)$/.test(s)) { codes.push({ k: "L", s: s, ln: i + 1, addr: null }); return; }
      codes.push({ k: "I", s: s, ln: i + 1, addr: null });
    });
    var syms = Object.assign({}, ASM_SYMBOLS);
    var errors = [];
    var addr = 0;
    codes.forEach(function (co) {
      if (co.k === "L") {
        var lab = co.s.slice(1, -1);
        if (lab in syms) { errors.push("行 " + co.ln + "：重複的標籤 (" + lab + ")"); }
        syms[lab] = addr;
      } else { co.addr = addr; addr++; }
    });
    var nextVar = 16;
    function resolve(sym, ln) {
      if (/^\d+$/.test(sym)) return { v: parseInt(sym, 10) & 0x7FFF, from: "常數" };
      if (sym in syms) return { v: syms[sym], from: "符號表" };
      var v = nextVar++;
      syms[sym] = v;
      return { v: v, from: "新增變數" };
    }
    var listing = [];
    codes.forEach(function (co) {
      if (co.k === "L") { listing.push({ addr: co.addr, src: co.s, bin: "", hex: "", kind: "L" }); return; }
      var bin;
      if (co.s.charAt(0) === "@") {
        var r = resolve(co.s.slice(1), co.ln);
        bin = (r.v & 0x7FFF).toString(2).padStart(16, "0");
        listing.push({ addr: co.addr, src: co.s, bin: bin, hex: u16(parseInt(bin, 2)).toString(16).padStart(4, "0").toUpperCase(), kind: "A", from: r.from });
      } else {
        bin = encodeC(co.s);
        if (!bin) { errors.push("行 " + co.ln + "：無法解析 C 指令「" + co.s + "」"); listing.push({ addr: co.addr, src: co.s, bin: "?", hex: "?", kind: "E" }); return; }
        listing.push({ addr: co.addr, src: co.s, bin: bin, hex: u16(parseInt(bin, 2)).toString(16).padStart(4, "0").toUpperCase(), kind: "C" });
      }
    });
    return { listing: listing, syms: syms, errors: errors, nextVar: nextVar };
  }

  function encodeC(s) {
    var m = s.match(/^(?:([AMD]{1,3})=)?([^;]+)(?:;([A-Z]+))?$/);
    if (!m) return null;
    var dest = m[1] || "", comp = m[2], jump = m[3] || "";
    var a0 = { "0": "0101010", "1": "0111111", "-1": "0111010", "D": "0001100", "A": "0110000", "!D": "0001101", "!A": "0110001", "-D": "0001111", "-A": "0110011", "D+1": "0011111", "A+1": "0110111", "D-1": "0001110", "A-1": "0110010", "D+A": "0000010", "D-A": "0010011", "A-D": "0000111", "D&A": "0000000", "D|A": "0010101" };
    var a1 = { "M": "1110000", "!M": "1110001", "-M": "1110011", "M+1": "1110111", "M-1": "1110010", "D+M": "1000010", "D-M": "1010011", "M-D": "1000111", "D&M": "1000000", "D|M": "1010101" };
    var compEnc = a0[comp] || a1[comp];
    if (!compEnc) return null;
    var dEnc = { "": "000", "M": "001", "D": "010", "MD": "011", "A": "100", "AM": "101", "AD": "110", "AMD": "111" };
    var jEnc = { "": "000", "JGT": "001", "JEQ": "010", "JGE": "011", "JLT": "100", "JNE": "101", "JLE": "110", "JMP": "111" };
    if (!(dest in dEnc) || !(jump in jEnc)) return null;
    return "111" + compEnc + dEnc[dest] + jEnc[jump];
  }

  var SAMPLE_ADD = "@2\nD=A\n@3\nD=D+A\n@0\nM=D";
  var SAMPLE_SUM = "// sum = 1+2+...+10\n@10\nD=A\n@R0\nM=D\n@0\nD=A\n@sum\nM=D\n@i\nM=1\n(LOOP)\n@i\nD=M\n@R0\nD=D-M\n@STOP\nD;JGT\n@i\nD=M\n@sum\nM=D+M\n@i\nM=M+1\n@LOOP\n0;JMP\n(STOP)";
  var SAMPLE_FILL = "// 清空 SCREEN 起的 256 個字為 0\n@256\nD=A\n@n\nM=D\n@SCREEN\nD=A\n@addr\nM=D\n(LOOP)\n@n\nD=M-1\n@DONE\nD;JLT\n@n\nM=D\n@addr\nA=M\nM=0\n@addr\nM=M+1\n@LOOP\n0;JMP\n(DONE)";;
  var ASM_SAMPLES = { add: SAMPLE_ADD, sum: SAMPLE_SUM, fill: SAMPLE_FILL };

  function buildAsm(box) {
    var ta = box.querySelector("textarea.asm");
    var out = box.querySelector(".asm-out");
    var syms = box.querySelector(".asm-syms");
    if (!ta || !out) return;
    var samplesCfg = box.querySelectorAll("[data-sample]");
    samplesCfg.forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-sample");
        if (ASM_SAMPLES[k]) { ta.value = ASM_SAMPLES[k]; run(); }
      };
    });

    function run() {
      var r = assemble(ta.value);
      out.innerHTML = "";
      if (r.errors.length) {
        r.errors.forEach(function (e) {
          var d = el("div", "asmline", "⚠ " + e);
          d.style.color = "#dc2626";
          out.append(d);
        });
      }
      var table = el("table", "tt");
      var tr = el("tr");
      ["位址", "來源", "機器碼 (bin)", "HEX"].forEach(function (h) { tr.append(el("th", "", h)); });
      table.append(tr);
      var pass = box.querySelector(".pass-status");
      if (pass) {
        pass.textContent = "pass1：收集符號（標籤位置、內定符號）；pass2：逐列編碼。目前看到的就是 pass2 的最終產物。";
      }
      r.listing.forEach(function (l) {
        var tr2 = el("tr");
        tr2.append(el("td", "", l.kind === "L" ? "—" : String(l.addr).padStart(2, "0")));
        tr2.append(el("td", "", l.src));
        tr2.append(el("td", "", l.bin === "?" ? "?" : l.bin));
        tr2.append(el("td", "", l.hex === "?" ? "?" : l.hex));
        if (l.kind === "L") tr2.classList.add("b");
        table.append(tr2);
      });
      out.append(table);
      if (r.errors.length === 0) {
        var ok = el("div", "sigline sig");
        ok.style.color = "#16a34a";
        ok.textContent = "✔ 組譯成功：共 " + r.listing.length + " 列";
        out.append(ok);
      }
      if (syms) {
        syms.innerHTML = "";
        var t2 = el("table", "symtab2");
        var h2 = el("tr");
        h2.append(el("th", "", "符號"), el("th", "", "位址（二進位）"));
        t2.append(h2);
        Object.keys(r.syms).sort(function (a, b) { return r.syms[a] - r.syms[b]; }).forEach(function (k) {
          var tr3 = el("tr");
          tr3.append(el("td", "", k));
          tr3.append(el("td", "", String(r.syms[k])));
          t2.append(tr3);
        });
        syms.append(t2);
      }
    }
    ta.addEventListener("input", run);
    ta.value = SAMPLE_ADD;
    run();
  }

  function buildDecode() {
    var inp = byId("decode-in");
    var out = byId("decode-out");
    if (!inp || !out) return;
    function run() {
      var s = inp.value.trim();
      out.innerHTML = "";
      if (!s) return;
      var bits;
      if (/^[01]{16}$/.test(s)) bits = s;
      else if (/^[0-9a-fA-F]{4}$/.test(s)) {
        var n = u16(parseInt(s, 16));
        bits = n.toString(2).padStart(16, "0");
      } else {
        out.append(el("div", "note", "請輸入 16 位元二進位（如 1110110000010000）或 4 位 HEX（如 EC10）。若要「組語→機器碼」請用上一章組譯器。"));
        return;
      }
      if (bits.charAt(0) === "0") {
        var val = parseInt(bits, 2);
        var line = el("div", "asmline");
        line.append(el("span", "addr", "A 指令："));
        line.append(el("code", "", "@" + val));
        out.append(line);
        out.append(el("div", "note", "把 15 位元常數 " + val + " 載入 A 暫存器。" + (val >= 16384 && val < 16384 + 8192 ? "（落在螢幕映射區 SCREEN）" : "") + (val === 24576 ? "（KBD 鍵盤映射）" : "")));
      } else {
        var d = asmDecodeC(bits);
        var mn = (d.dest ? d.dest + "=" : "") + d.comp + (d.jump ? ";" + d.jump : "");
        var hdr = el("div", "asmline");
        hdr.append(el("span", "addr", "C 指令："));
        hdr.append(el("code", "", mn));
        out.append(hdr);
        var t = el("table", "tt");
        [
          ["bit 15–13", "111", "C 指令前綴"],
          ["bit 12 (a)", d.a, "ALU 的 y 來源：" + (d.a === "1" ? "M（inM）" : "A")],
          ["bit 11–6 (c)", d.cbits, "ALU 控制 zx nx zy ny f no：" + d.comp],
          ["bit 5–3 (d)", bits.slice(3, 6), "目的地：" + (d.dest || "（無）")],
          ["bit 2–0 (j)", bits.slice(0, 3), "跳轉：" + (d.jump || "（無）")]
        ].forEach(function (row) {
          var tr = el("tr");
          tr.append(el("td", "", row[0]), el("td", "", row[1]), el("td", "", row[2]));
          t.append(tr);
        });
        out.append(t);
        out.append(el("div", "note", asmSemantic(d)));
      }
    }
    inp.addEventListener("input", run);
  }

  /* ============================= 07 VM 堆疊 ============================= */
  var VM_SAMPLES = {
    "SimpleAdd": "push constant 7\npush constant 8\nadd",
    "StackOps": "push constant 2\npush constant 3\nadd\npush constant 10\nlt\npush constant 5\npush constant 5\neq\npush constant 9\nneg\npush constant 4\npush constant 6\nsub",
    "LocalTest": "push constant 300\npop local 0\npush constant 7\npush local 0\nadd\npush constant 0\npop local 1\npush local 1\npush constant 100\nsub",
    "TempStatic": "push constant 42\npop temp 0\npush constant 7\npush temp 0\nsub\npush constant 1\npop static 0\npush static 0"
  };
  var VM_SEG2NAME = { local: "LCL", argument: "ARG", this: "THIS", that: "THAT" };
  var VM_TMP = ["TMP0", "TMP1", "TMP2", "TMP3", "TMP4", "TMP5", "TMP6", "TMP7"];

  function vmAsmLines(op, seg, idx) {
    var S = "@SP\nA=M\nM=D\n@SP\nM=M+1";
    var lines = [];
    if (op === "push") {
      if (seg === "constant") {
        lines = ["@" + idx, "D=A", "@SP", "A=M", "M=D", "@SP", "M=M+1"];
      } else if (seg === "temp") {
        lines = ["@" + VM_TMP[idx], "D=M", "@SP", "A=M", "M=D", "@SP", "M=M+1"];
      } else if (seg === "static") {
        lines = ["@Static." + idx, "D=M", "@SP", "A=M", "M=D", "@SP", "M=M+1"];
      } else if (seg === "pointer") {
        lines = ["@" + (idx === 0 ? "THIS" : "THAT"), "D=M", "@SP", "A=M", "M=D", "@SP", "M=M+1"];
      } else {
        return ["@" + VM_SEG2NAME[seg], "D=M", "@" + idx, "A=D+A", "D=M", "@SP", "A=M", "M=D", "@SP", "M=M+1"];
      }
    } else if (op === "pop") {
      if (seg === "temp") {
        return ["@SP", "AM=M-1", "D=M", "@" + VM_TMP[idx], "M=D"];
      } else if (seg === "static") {
        return ["@SP", "AM=M-1", "D=M", "@Static." + idx, "M=D"];
      } else if (seg === "pointer") {
        return ["@SP", "AM=M-1", "D=M", "@" + (idx === 0 ? "THIS" : "THAT"), "M=D"];
      } else {
        return ["@" + VM_SEG2NAME[seg], "D=M", "@" + idx, "D=D+A", "@R13", "M=D", "@SP", "AM=M-1", "D=M", "@R13", "A=M", "M=D"];
      }
    } else if (op === "add") return ["@SP", "AM=M-1", "D=M", "A=A-1", "M=D+M"];
    else if (op === "sub") return ["@SP", "AM=M-1", "D=M", "A=A-1", "M=M-D"];
    else if (op === "neg") return ["@SP", "A=M-1", "M=-M"];
    else if (op === "not") return ["@SP", "A=M-1", "M=!M"];
    else if (op === "and") return ["@SP", "AM=M-1", "D=M", "A=A-1", "M=D&M"];
    else if (op === "or") return ["@SP", "AM=M-1", "D=M", "A=A-1", "M=D|M"];
    else if (op === "eq" || op === "gt" || op === "lt") {
      var jc = op === "eq" ? "JEQ" : (op === "gt" ? "JGT" : "JLT");
      var tag = "VM_" + op.toUpperCase() + "_" + vmCounter();
      return ["@SP", "AM=M-1", "D=M", "A=A-1", "D=M-D", "@" + tag, "D;" + jc,
        "@SP", "A=M-1", "M=0", "@" + tag + "_END", "0;JMP",
        "(" + tag + ")", "@SP", "A=M-1", "M=-1", "(" + tag + "_END)"];
    }
    return lines;
  }
  var _vmCounter = 0;
  function vmCounter() { return ++_vmCounter; }

  function buildVM() {
    var ta = byId("vm-in");
    var out = byId("vm-out");
    var asmPre = byId("vm-asm");
    var stackBox = byId("vm-stack");
    var segBox = byId("vm-seg");
    var regBox = byId("vm-reg");
    if (!ta || !out) return;
    var V = null;

    function initVM() {
      V = { stack: [], local: [], argument: [], thi: [], that: [], temp: new Array(8).fill(0), stat: {}, pointer: [0, 0], ip: 0, prog: [], asm: [] };
    }
    function segVal(name, i) {
      if (name === "local") return V.local[i];
      if (name === "argument") return V.argument[i];
      if (name === "this") return V.thi[i];
      if (name === "that") return V.that[i];
      if (name === "temp") return V.temp[i];
      if (name === "pointer") return V.pointer[i];
      if (name === "static") return V.stat[i];
      return undefined;
    }
    function segSet(name, i, v) {
      if (name === "local") V.local[i] = v;
      else if (name === "argument") V.argument[i] = v;
      else if (name === "this") V.thi[i] = v;
      else if (name === "that") V.that[i] = v;
      else if (name === "temp") V.temp[i] = v;
      else if (name === "pointer") V.pointer[i] = v;
      else if (name === "static") V.stat[i] = v;
    }
    function stepVM() {
      if (!V || V.ip >= V.prog.length) return false;
      var raw = V.prog[V.ip];
      var m = raw.match(/^\s*(push|pop)\s+(\S+)\s+(-?\d+)\s*$/i);
      var mn = raw.trim();
      var op, seg, idx;
      if (m) { op = m[1].toLowerCase(); seg = m[2].toLowerCase(); idx = parseInt(m[3], 10); }
      else { op = mn.toLowerCase(); seg = null; idx = null; }
      var pre = JSON.stringify(V.stack);
      if (op === "push") {
        var val = seg === "constant" ? idx : segVal(seg, idx);
        V.stack.push(val === undefined ? 0 : val);
        V.asm.push("// " + raw + "  →  " + vmAsmLines("push", seg, idx).join("  "));
      } else if (op === "pop") {
        var v = V.stack.pop() || 0;
        segSet(seg, idx, v);
        V.asm.push("// " + raw + "  →  " + vmAsmLines("pop", seg, idx).join("  "));
      } else if (op === "add") { var b = V.stack.pop() || 0, a = V.stack.pop() || 0; V.stack.push(a + b); V.asm.push("// add"); }
      else if (op === "sub") { var b2 = V.stack.pop() || 0, a2 = V.stack.pop() || 0; V.stack.push(a2 - b2); V.asm.push("// sub"); }
      else if (op === "neg") { V.stack.push(-(V.stack.pop() || 0)); V.asm.push("// neg"); }
      else if (op === "not") { V.stack.push(~(V.stack.pop() || 0) & 0xFFFF); V.asm.push("// not"); }
      else if (op === "and") { var bb = V.stack.pop() || 0, aa = V.stack.pop() || 0; V.stack.push(aa & bb); V.asm.push("// and"); }
      else if (op === "or") { var bb2 = V.stack.pop() || 0, aa2 = V.stack.pop() || 0; V.stack.push(aa2 | bb2); V.asm.push("// or"); }
      else if (op === "eq") { var bb3 = V.stack.pop() || 0, aa3 = V.stack.pop() || 0; V.stack.push(aa3 === bb3 ? -1 : 0); V.asm.push("// eq：相同 → -1，否則 0"); }
      else if (op === "gt") { var bb4 = V.stack.pop() || 0, aa4 = V.stack.pop() || 0; V.stack.push(aa4 > bb4 ? -1 : 0); V.asm.push("// gt"); }
      else if (op === "lt") { var bb5 = V.stack.pop() || 0, aa5 = V.stack.pop() || 0; V.stack.push(aa5 < bb5 ? -1 : 0); V.asm.push("// lt"); }
      V.ip++;
      render();
      return V.ip < V.prog.length;
    }
    function load() {
      initVM();
      V.prog = ta.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      _vmCounter = 0;
      render();
    }
    function render() {
      if (!V) return;
      out.textContent = "";
      var i = 0;
      V.prog.forEach(function (ln) {
        var d = el("div", "asmline");
        var a = el("span", "addr", String(i).padStart(2, "0") + (i === V.ip - 1 ? " ▶" : "   "));
        d.append(a, el("span", "", ln));
        if (i === V.ip - 1) d.style.background = "#e0f2fe";
        out.append(d);
        i++;
      });
      if (V.ip >= V.prog.length) out.append(el("div", "sigline sig", "✔ 程式執行完畢"));
      stackBox.innerHTML = "";
      for (var j = 0; j < V.stack.length; j++) {
        var cell = el("div", "seg");
        cell.append(el("span", "label", String(j)));
        cell.append(el("span", "", String(V.stack[j])));
        stackBox.append(cell);
      }
      var sp = el("span", "note");
      sp.textContent = "SP = " + V.stack.length + "（下次 push 寫入的位置）";
      stackBox.append(sp);
      segBox.innerHTML = "";
      ["local", "argument", "this", "that", "temp", "static"].forEach(function (sn) {
        var arr = V[sn === "temp" ? "temp" : sn];
        var cells = [];
        if (sn === "temp") { for (var t = 0; t < 8; t++) { if (V.temp[t]) cells.push(t + ":" + V.temp[t]); } }
        else if (sn === "static") { Object.keys(V.stat).forEach(function (k) { cells.push("@" + k + ":" + V.stat[k]); }); }
        else { for (var t2 = 0; t2 < (Array.isArray(arr) ? arr.length : 0); t2++) { if (arr[t2] !== undefined) cells.push(t2 + ":" + arr[t2]); } }
        if (cells.length) {
          var seg = el("div", "seg");
          seg.append(el("span", "label", sn));
          seg.append(el("span", "", cells.join("　")));
          segBox.append(seg);
        }
      });
      if (!V.pointer[0] && !V.pointer[1] && !segBox.children.length) segBox.append(el("div", "sig sigline", "（暫無段資料——試試 LocalTest 或 TempStatic 範例）"));
      regBox.textContent = "  ";
      asmPre.textContent = V.asm.join("\n");
    }
    var samples = byId("vm-samples");
    if (samples) {
      Object.keys(VM_SAMPLES).forEach(function (k) {
        var b = el("button", "btn small", k);
        b.onclick = function () { ta.value = VM_SAMPLES[k]; load(); };
        samples.append(b);
      });
    }
    byId("vm-reset").onclick = load;
    byId("vm-step").onclick = stepVM;
    byId("vm-run").onclick = function () { var t = setInterval(function () { if (!stepVM()) clearInterval(t); }, 120); };
    ta.addEventListener("input", function () { load(); });
    ta.value = VM_SAMPLES.SimpleAdd;
    load();
  }

  /* ============================= 08 呼叫框架 ============================= */
  function buildFrame() {
    var c = byId("frame");
    if (!c) return;
    var steps = [
      { t: "① 呼叫前", d: "呼叫者為 foo(3, 4) 準備，先把 2 個參數推上堆疊：arg0=3、arg1=4。此時 ARG 還未設。", act: function (S) { S.stack = [3, 4]; } },
      { t: "② call：推回傳位址", d: "call 的第一件事：把回傳位址（指回呼叫者下一條指令）推上堆疊，加記號 R。", act: function (S) { S.stack.push({ v: "R", k: "ret" }); } },
      { t: "③ call：存 LCL / ARG / THIS / THAT", d: "依序把呼叫者目前的 LCL、ARG、THIS、THAT 四個指標值也推上去（共 5 個 saved values）。", act: function (S) {
        S.stack.push({ v: "L", k: "lcl" }, { v: "A", k: "argp" }, { v: "T1", k: "this" }, { v: "T2", k: "that" });
      } },
      { t: "④ 設定新框架", d: "ARG = SP − nArgs − 5（指向 arg0），LCL = SP（指向本函式框架起點）。", act: function (S) {
        S.arg = S.stack.length - 2 - 5;
        S.lcl = S.stack.length;
      } },
      { t: "⑤ function：配置區域變數", d: "function Foo 1 在堆疊上推出 nLocals=1 個 0，作為 local0。", act: function (S) { S.stack.push({ v: 0, k: "loc0" }); } },
      { t: "⑥ 執行函式本體", d: "local0 = arg0 + arg1 = 7。此處可透過「LCL 基底＋索引」存取參數與區域變數。", act: function (S) {
        S.stack.forEach(function (cell, i) { if (cell && cell.k === "loc0") cell.v = 7; });
      } },
      { t: "⑦ return：搬回傳值", d: "把堆疊頂端（回傳值 7）搬到 ARG 所指位置，SP = ARG + 1（等於把參數也收回）。", act: function (S) {
        S.rv = S.stack.pop().v;
        S.sp = S.arg + 1;
      } },
      { t: "⑧ return：回復四個指標", d: "從 LCL 起往回：THAT=base−1、THIS=base−2、ARG=base−3、LCL=base−4；最後 PC 跳到回傳位址。", act: function (S) {
        S.lcl = "原呼叫者 LCL";
        S.arg = "原呼叫者 ARG";
        S.thi = "原 THIS";
        S.that = "原 THAT";
        S.pc = "回傳位址 R";
      } }
    ];
    var idx = -1;
    var S = { stack: [], lcl: 0, arg: 0, thi: 0, that: 0, rv: null, pc: null, sp: null };
    var view = byId("frame-view");
    var desc = byId("frame-desc");
    var ttitle = byId("frame-title");
    var regs = byId("frame-regs");

    function render() {
      var st = S.stack;
      view.innerHTML = "";
      if (!st.length) view.append(el("div", "sig sigline", "堆疊目前是空的"));
      st.forEach(function (cell, i) {
        var box = el("div", "seg");
        var label = cell && cell.k ? cell.k : String(i);
        var val = cell && typeof cell === "object" ? cell.v : cell;
        box.append(el("span", "label", "[" + i + "] " + label));
        box.append(el("span", "", String(val)));
        view.append(box);
      });
      regs.textContent = "SP=" + (S.sp != null ? S.sp : st.length) + "　ARG=" + S.arg + "　LCL=" + S.lcl + "　THIS=" + S.thi + "　THAT=" + S.that + "　PC→" + (S.pc || "略");
    }
    function set(i) {
      idx = Math.max(0, Math.min(i, steps.length - 1));
      S = { stack: [], lcl: 0, arg: 0, thi: 0, that: 0, rv: null, pc: null, sp: null };
      for (var j = 0; j <= idx; j++) steps[j].act(S);
      ttitle.textContent = "Foo（2 參數 1 區域變數）：" + steps[idx].t;
      desc.textContent = steps[idx].d;
      render();
    }
    byId("frame-prev").onclick = function () { set(idx - 1); };
    byId("frame-next").onclick = function () { set(idx + 1); };
    set(0);
  }

  /* ============================= 12 Math.multiply ============================= */
  function buildMult() {
    var c = byId("mult");
    if (!c) return;
    var st = { x: 13, y: 11, iters: [], done: false };
    var view = byId("mult-view");
    var xi = byId("mult-x"), yi = byId("mult-y");

    function init() {
      st.x = Number(xi.value) || 0;
      st.y = Number(yi.value) || 0;
      st.iters = [];
      var ax = st.x, by = st.y, r = 0;
      var guard = 0;
      while (by > 0 && guard++ < 32) {
        if (by & 1) r += ax;
        st.iters.push({ bx: ax, by: by, bit: by & 1, acc: by & 1 ? r - ax : r, r: r });
        ax <<= 1; by >>>= 1;
      }
      st.done = false;
      st.pos = -1;
      st.r = 0;
      render();
    }
    function step() {
      var s = st;
      if (s.done) { s.pos = s.iters.length; render(); return; }
      s.pos++;
      if (s.pos >= s.iters.length) { s.done = true; s.r = s.iters[s.iters.length - 1] ? s.iters[s.iters.length - 1].r : 0; }
      render();
    }
    function render() {
      view.innerHTML = "";
      var i = 0;
      st.iters.forEach(function (it) {
        var d = el("div", "panel sim");
        var state = i < st.pos ? "✔ 已完成" : (i === st.pos ? "◉ 本步" : "— 待執行");
        if (st.done) state = "✔";
        d.append(el("div", "ptitle", "迭代 " + i + "　" + state));
        var r1 = el("div", "sigline");
        r1.append(el("span", "", "乘法器 bx = "), el("b", "", String(it.bx)), el("span", "", "，被乘數 by = "), el("b", "", String(it.by)), el("span", "", "，by 最低位 = " + it.bit));
        d.append(r1);
        var r2 = el("div", "sigline");
        r2.append(el("span", "", it.bit ? "by 最低位為 1 → acc = acc + bx：累加器 → " + it.r : "by 最低位為 0 → 不累加"));
        r2.append(el("span", "", "　|　bx ← bx×2（左移 1 位），by ← by/2（右移 1 位）"));
        view.append(d);
        i++;
      });
      if (!st.iters.length) view.append(el("div", "sig sigline", "輸入正整數 x、y 後按「重新計算」。"));
      var sum = st.done ? st.r : (st.pos >= 0 ? (st.iters[st.pos] ? st.iters[st.pos].r : 0) : 0);
      if (st.done) {
        var ok = el("div", "label");
        ok.textContent = "➜ 結果：" + st.x + " × " + st.y + " = " + st.r;
        ok.style.color = "#16a34a";
        view.append(ok);
      }
    }
    byId("mult-reset").onclick = init;
    byId("mult-step").onclick = step;
    byId("mult-run").onclick = function () {
      var t = setInterval(function () {
        if (st.done) clearInterval(t);
        else step();
      }, 900);
    };
    xi.addEventListener("input", init);
    yi.addEventListener("input", init);
    init();
  }

  /* ============================= 測驗 ============================= */
  var QUIZZES = {
    ch00: [
      { q: "Nand2Tetris 的最終目標是什麼？", type: "c", opts: ["學好 C 語言", "用 Nand 閘與軟體工具從零建構出一台能執行 Tetris 的完整電腦", "只學會用 Verilog 寫電路", "買一台 ARM CPU 來玩"], ans: 1, why: "從單一 Nand 閘開始，一層層蓋出 ALU、記憶體、CPU，再寫出組譯器、VM、編譯器與作業系統，最後跑 Tetris。" },
      { q: "課程分成哪兩大部分？", type: "c", opts: ["硬體篇：00–05；軟體篇：06–12", "作業系統篇與資料庫篇", "前端篇與後端篇", "實驗篇與理論篇"], ans: 0, why: "00–05 是硬體（閘→ALU→記憶→機器語言→CPU），06–12 是軟體（組譯器→VM→編譯器→Jack→OS）。" }
    ],
    ch01: [
      { q: "最少要用幾個 Nand 閘才能做出 Not？", type: "c", opts: ["1 個", "2 個", "3 個", "4 個"], ans: 0, why: "Nand(x,x) = not(x∧x) = ¬x，把兩個輸入接在一起即可。" },
      { q: "And(x,y) 用 Nand 怎麼組？", type: "c", opts: ["Nand(x,y)", "not(Nand(x,y))", "Nand(not x, not y)", "not(x) and not(y)"], ans: 1, why: "Nand 是 Not∘And：先 Nand 再做 Not，就還原成 And。" },
      { q: "Mux 的 sel=1 時，輸出是哪一個輸入？", type: "c", opts: ["a", "b", "取 a 或 b 的最小值", "不確定"], ans: 1, why: "Mux(a,b,sel)：sel=0 → a；sel=1 → b。這是二選一開關。" },
      { q: "Xor（互斥或）至少需要幾個 Nand？", type: "c", opts: ["2 個", "3 個", "4 個", "6 個"], ans: 2, why: "xor = and(a,¬b) or and(¬a,b)，標準 Nand 網路構造需要 4 個。" }
    ],
    ch02: [
      { q: "HalfAdder(1, 1) 的輸出是？", type: "c", opts: ["sum=1, carry=0", "sum=0, carry=1", "sum=1, carry=1", "sum=0, carry=0"], ans: 1, why: "1+1 = 10（二進位）：sum=0、carry=1。" },
      { q: "要得到 x+y，6 個控制位元 zx nx zy ny f no 應為？", type: "c", opts: ["000010", "000100", "010010", "011101"], ans: 0, why: "所有歸零/取反都不做，f=1 輸出相加，no=0 不取反。" },
      { q: "ALU 的 zr 旗標何時為 1？", type: "c", opts: ["out 最高位為 1", "out = 0", "x = y", "載入暫存器時"], ans: 1, why: "zr（zero）在運算結果為零時為 1，CPU 用它判斷「相等／跳轉」。" }
    ],
    ch03: [
      { q: "Bit 電路中 Mux 迴授（把輸出接回輸入）的用途是？", type: "c", opts: ["加快速度", "load=0 時維持原值、load=1 時存入新值", "增加耗電量", "讓兩個輸入短路"], ans: 1, why: "Mux 在 load=1 時選 in、load=0 時選回 DFF 自己的輸出，形成「鎖住」。" },
      { q: "RAM16K 需要幾位元的位址？", type: "c", opts: ["13 位元", "14 位元", "15 位元", "16 位元"], ans: 1, why: "2^14 = 16384 = 16K。" },
      { q: "Register 與 Bit 的關係？", type: "c", opts: ["Register 是 16 個 Bit 平行排列", "Bit 是 16 個 Register", "無關係", "兩者都是暫存器但功能相反"], ans: 0, why: "Register 一次存 16 位元，就是 16 個 Bit 共用同一個 load 訊號。" },
      { q: "PC 收到 reset=1 時 next-out 變成？", type: "c", opts: ["in", "out+1", "0", "維持不變"], ans: 2, why: "reset 優先權最高，把 PC 歸零＝程式從位址 0 重跑。" }
    ],
    ch04: [
      { q: "C 指令的開頭 3 個位元固定是？", type: "c", opts: ["000", "010", "111", "110"], ans: 2, why: "C 指令 = 111 a c1..c6 d1 d2 d3 j1 j2 j3。以 111 開頭讓 CPU 認得它是運算指令而非 A 指令。" },
      { q: "螢幕記憶體映射的起始位址 SCREEN = ？", type: "c", opts: ["0", "1024", "16384", "24576"], ans: 2, why: "SCREEN = 16384；KBD = 24576 是鍵盤。" },
      { q: "組語 “D=A” 對應的機器碼是？", type: "c", opts: ["EC10", "E090", "0002", "FC10"], ans: 0, why: "111 0 0110000 010 000 = 1110 1100 0001 0000 = 0xEC10。" }
    ],
    ch05: [
      { q: "JGT 跳轉的條件是？", type: "c", opts: ["ALU out < 0", "ALU out = 0", "ALU out > 0", "永遠跳"], ans: 2, why: "gt（greater than）＝ ¬(ng ∨ zr)，即 out>0 時 j3 生效。" },
      { q: "writeM（寫入記憶體）何時為 1？", type: "c", opts: ["isC∧d3", "isA", "d2", "j1"], ans: 0, why: "只有 C 指令且目的地含 M（d3=1）才會寫記憶體，防止意外覆寫。" },
      { q: "哪一個暫存器身兼「資料暫存器」與「記憶體位址暫存器」？", type: "c", opts: ["D", "A", "PC", "ALU"], ans: 1, why: "A 暫存器同時是資料暫存器與位址暫存器（addressM 的來源）。" }
    ],
    ch06: [
      { q: "組譯器的 pass1 做什麼？", type: "c", opts: ["直接輸出機器碼", "掃描收集標籤位置，建立符號表", "把執行程式最佳化", "連上虛擬機"], ans: 1, why: "pass1 先算出每個 (LABEL) 所在位址填進符號表，pass2 才能回頭解析 @LOOP 這種符號。" },
      { q: "預定義符號 SP 的固定位址是？", type: "c", opts: ["0", "1", "2", "16"], ans: 0, why: "SP=0、LCL=1、ARG=2、THIS=3、THAT=4，這是 VM 翻譯器共用 R0–R4 的默契。" },
      { q: "使用者自訂變數從哪個位址開始？", type: "c", opts: ["0", "15", "16", "256"], ans: 2, why: "R0–R15 與特殊符號佔用 0–15，變數從 16 開始依序配置。" }
    ],
    ch07: [
      { q: "「push constant 7」依本章翻譯需要幾條 Hack 組語？", type: "c", opts: ["3", "4", "5", "6"], ans: 2, why: "@7 / D=A / @SP / A=M / M=D / @SP / M=M+1（在 vmAsmLines 中是 6 條；常見簡化版為 5 條）。先寫入 SP 指向位置再 SP+1。" },
      { q: "add 執行後，SP 會？", type: "c", opts: ["不變", "+1", "-1", "+2"], ans: 2, why: "add 彈出兩個運算元、壓入一個結果，堆疊少一格 → SP−1。" },
      { q: "哪個段代表全域變數（編譯後大家共享）？", type: "c", opts: ["constant", "static", "temp", "this"], ans: 1, why: "static 段對應 Hack 的 RAM[16..255]，類別層級的變數放這裡。" }
    ],
    ch08: [
      { q: "「call Foo 2」在進入 Foo 前，先推幾個值到堆疊？", type: "c", opts: ["2 個", "3 個", "5 個", "7 個"], ans: 2, why: "依序推回傳位址、LCL、ARG、THIS、THAT（2 個參數已在前面推好），共 5 個 saved values。" },
      { q: "return 時從哪裡取回傳位址？", type: "c", opts: ["LCL−5", "ARG", "SP", "暫存器 R0"], ans: 0, why: "框架最底部依序是 回傳位址/舊LCL/舊ARG/舊THIS/舊THAT，而 LCL−5 正是回傳位址。" },
      { q: "進入函式後 ARG 指向哪？", type: "c", opts: ["第一個參數", "最後一個參數", "回傳位址", "區域變數"], ans: 0, why: "ARG = SP − nArgs − 5，指向第一個參數 arg0。" }
    ],
    ch09: [
      { q: "Jack 的迴圈寫法包含哪兩個關鍵字？", type: "c", opts: ["for / next", "while / do", "while…end / if…else", "loop / repeat"], ans: 2, why: "Jack 沒有 for，迴圈用 while…end，分支用 if…else…end。" },
      { q: "編譯器處理 Jack 的四大階段為何？", type: "c", opts: ["前置→後置→連結→裝載", "詞法/語法分析→產生 VM 碼→（可選）最佳化→產生成組語", "打字→排版→存檔→列印", "僅一步到位"], ans: 1, why: "先做 tokenizer + parser 分析，再產生 VM 指令，最後交給下層工具鏈。" }
    ],
    ch11: [
      { q: "Jack 的 1 個 word（RAM 單元）是幾位元？", type: "c", opts: ["8", "16", "32", "64"], ans: 1, why: "整條 Hack 體系（ALU、暫存器、記憶體）都是 16 位元。" },
      { q: "檔案名與 class 名的關係？", type: "c", opts: ["必須相同", "無關", "class 名要大寫", "檔名較長"], ans: 0, why: "Jack 編譯器要求 Main.jack 裡就是 class Main{}。" }
    ],
    ch12: [
      { q: "Math.multiply 用什麼演算法？", type: "c", opts: ["查表法", "位元掃描 + 累加（重複加法）", "直接呼叫硬體乘法", "蒙地卡羅"], ans: 1, why: "Hack 沒有硬體乘法，Math 用「逐位元看 y，為 1 就把累積 x 左移後相加」。" },
      { q: "Screen 的一段（1 個 word = 16 位元）代表？", type: "c", opts: ["1 個像素", "16 個像素（1 列的一段）", "512 個像素", "一頁螢幕"], ans: 1, why: "螢幕 512×256，每個 word 藏 16 個像素，輸出字元時直接對該行記憶體寫位元。" },
      { q: "Sys.init() 之後第一個被呼叫的模組是？", type: "c", opts: ["Math.init()", "Screen.init()", "Memory.init()", "直接跑 Main"], ans: 0, why: "初始化有嚴格順序：Math.init → Output.init → Screen.init → Keyboard.init → Memory.init → Main.main。" }
    ]
  };

  function buildQuiz(container, items) {
    var quizBox = el("div", "quiz");
    items.forEach(function (item, i) {
      var q = el("div", "qitem");
      var qText = el("div", "q", (i + 1) + ". " + item.q);
      q.append(qText);
      var optsBox = el("div", "opts");
      if (item.type === "c") {
        item.opts.forEach(function (o, k) {
          var d = el("label", "opt");
          d.append(o);
          d.onclick = function () {
            if (q.classList.contains("done")) return;
            q.classList.add("done");
            var correct = k === item.ans;
            optsBox.childNodes.forEach(function (c) {
              if (c === d) c.classList.add(correct ? "right" : "wrong");
              else c.dataset.k = c.dataset.k || "";
            });
            var right = optsBox.childNodes[item.ans];
            if (right) right.classList.add("right");
            if (correct) d.classList.remove("wrong");
            showWhy(q, item);
          };
          optsBox.append(d);
        });
      } else {
        var d2 = el("div", "field");
        var inp = el("input", "fill");
        inp.placeholder = "輸入答案…";
        var chk = el("button", "btn", "檢查");
        chk.onclick = function () {
          if (q.classList.contains("done")) return;
          var v = (inp.value || "").replace(/\s+/g, "").toLowerCase();
          var a = String(item.ans).replace(/\s+/g, "").toLowerCase();
          q.classList.add("done");
          if (v === a) { inp.style.borderColor = "#16a34a"; q.style.borderColor = "#16a34a"; }
          else { inp.style.borderColor = "#dc2626"; inp.value = "答案：" + item.ans; }
          showWhy(q, item);
        };
        d2.append(inp, chk);
        optsBox.append(d2);
      }
      q.append(optsBox);
      var why = el("div", "why", "🔍 " + item.why);
      q.append(why);
      quizBox.append(q);
    });
    container.append(quizBox);
  }
  function showWhy(q, item) {
    var r = q.querySelector(".why");
    if (r) { r.style.display = "block"; r.textContent = "🔍 " + item.why; }
  }

  function buildQuizzes() {
    Object.keys(QUIZZES).forEach(function (k) {
      var c = document.querySelector('[data-quiz="' + k + '"]');
      if (c) buildQuiz(c, QUIZZES[k]);
    });
  }

  /* ============================= 小工具 ============================= */
  function klassTitle(s) {
    var t = el("div", "ptitle");
    t.textContent = s;
    return t;
  }
  function ktable(rows) {
    var t = el("table", "tt");
    rows.forEach(function (r, i) {
      var tr = el("tr");
      r.forEach(function (cell) { tr.append(el(i === 0 ? "th" : "td", "", String(cell))); });
      t.append(tr);
    });
    return t;
  }
  function mkTwoIn(title, an, bn, a, b, set) {
    var div = el("div", "io");
    div.append(el("span", "sig ins", title + "　輸入："));
    var row = el("div", "chiprow");
    var chips = [];
    [an, bn].forEach(function (n) {
      var ch = el("span", "chip", n);
      chips.push(ch);
      row.append(ch);
    });
    div.append(row);
    return { div: div, chips: chips };
  }

  function buildGatePanels() {
    GATE_DEF.forEach(buildGate);
  }
  function buildMultiPanels() {
    MULTI_DEF.forEach(function (cfg) {
      var c = byId(cfg.id);
      if (!c) return;
      multiWidget(c, { id: cfg.id, name: cfg.name, desc: cfg.desc, fields: cfg.fields, outs: cfg.outs, compute: cfg.compute, note: cfg.note });
    });
  }

  function navActive() {
    var links = document.querySelectorAll("nav a");
    var secs = document.querySelectorAll(".chapter[id]");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (l) { l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id); });
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    secs.forEach(function (s) { io.observe(s); });
  }

  function boot() {
    buildGatePanels();
    buildMultiPanels();
    buildAdder();
    buildALU();
    buildRAM8();
    buildPC();
    document.querySelectorAll(".asm-box").forEach(buildAsm);
    buildDecode();
    buildVM();
    buildFrame();
    buildMult();
    buildQuizzes();
    navActive();
  }
  document.addEventListener("DOMContentLoaded", boot);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { assemble: assemble, encodeC: encodeC, asmDecodeC: asmDecodeC, aluCompute: aluCompute, u16: u16, s16: s16, hex16: hex16, vmAsmLines: vmAsmLines };
  }
})();