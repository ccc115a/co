// 電路圖資料＋自動佈局（v4.0）：把單層 CHIP 的 PARTS 轉成可鑽入的階層圖。
//
// 設計取捨（對應 elab/codegen 的分層）：
//   - 只看 AST 單層（`lib` 是 name -> Chip），不跑 elab 全域詳述——
//     自訂貼上少一顆子晶片時仍能畫出本層、把缺件標成「找不到」而非整頁報錯。
//   - 子晶片 pin 定義：內建走 elab 的 `builtinInOut`，使用者晶片走 `lib` 的 AST。
//   - 版面是確定性分層演算法（零依賴、Node/瀏覽器共用）：
//     深度＝上游 writer 最大深度＋1，同層垂直堆疊；IN 在左、OUT 在右。
//
// 本檔純 ESM、無 node import，可被 tools/embed.js 直接綴合進瀏覽器。
// 注意 embed 會剝掉 import 行、剝掉 `export ` 前綴：頂層符號包在 HdlGraph IIFE
// 內避免拼接後污染全域（與 Vm2Rv 同慣例）。
import { builtinOf, builtinInOut, builtinSequential, Builtin } from './elab.js';

export const HdlGraph = (() => {
  // ---- 版面常數 ----
  const BOX_W = 176;
  const PIN_ROW = 18;
  const HEADER_H = 26;
  const BOX_PAD = 8;
  const GAP_X = 96;
  const GAP_Y = 26;
  const LEFT_W = 170;
  const RIGHT_W = 170;
  const TOP_H = 44;
  const BOT_H = 36;

  /** 原語說明（鑽到最底層時的右側面板內容；繁體中文） */
  const PRIMITIVE_INFO = {
    Nand: {
      title: 'Nand（基本邏輯閘）',
      body: '最底層元件，不可再鑽入。輸出＝¬(a ∧ b)。所有組合邏輯最終都由它疊出來。',
      truth: [['a', 'b', 'out'], ['0', '0', '1'], ['0', '1', '1'], ['1', '0', '1'], ['1', '1', '0']],
    },
    DFF: {
      title: 'DFF（資料正反器）',
      body: '最底層時序元件，不可再鑽入。每個時脈週期把 in 鎖存並送到 out（軟體模擬以 tick/tock 兩相實現，見 hdl README）。',
      truth: [['in', 'out（下個週期）'], ['0', '0'], ['1', '1']],
    },
  };

  const BUILTIN_BLURB = {
    ARegister: '內建 16-bit 暫存器（有狀態，葉節點）。',
    DRegister: '內建 16-bit 資料暫存器（有狀態，葉節點）。',
    ROM32K: '內建程式記憶體（組合讀出，葉節點）。',
    Screen: '內建螢幕對映記憶體（有狀態，葉節點）。',
    Keyboard: '內建鍵盤（組合讀出，葉節點）。',
    ROM32: '內建 32-bit 指令記憶體（RV32I 用，葉節點）。',
    RAM32W: '內建 32-bit 資料記憶體（RV32I 用，葉節點）。',
    RF32: '內建 32×32 暫存器檔（RV32I 用，葉節點）。',
  };

  function rangeText(r) {
    if (!r) return '';
    if (r.kind === 'Whole') return '';
    if (r.kind === 'Bit') return `[${r.i}]`;
    return `[${r.lo0}..${r.hi0}]`;
  }

  function rangeBits(r, pinWidth) {
    if (!r || r.kind === 'Whole') return pinWidth;
    if (r.kind === 'Bit') return 1;
    return r.hi0 - r.lo0 + 1;
  }

  function srcText(s) {
    if (s.kind === 'Const') return s.v ? 'true' : 'false';
    return `${s.name}${rangeText(s.range)}`;
  }

  function pinWidthOf(pins, name) {
    const p = pins.find((q) => q.name === name);
    return p ? p.width : 1;
  }

  /** 子晶片的 IN/OUT 定義：{ inPins, outPins }；找不到回 null */
  function childPins(type, lib) {
    const b = builtinOf(type);
    if (b !== null) {
      const [inp, outp] = builtinInOut(b);
      return { inPins: inp, outPins: outp, builtin: b };
    }
    const c = lib[type];
    if (!c) return null;
    return { inPins: c.inPins, outPins: c.outPins, builtin: null };
  }

  /** 使用者晶片是否含狀態（遞迴，迴圈邊回 false 打斷；與 elab 的斷邊邏輯同理） */
  function libHasState(lib, name, visiting) {
    visiting = visiting || [];
    const b = builtinOf(name);
    if (b !== null) return builtinSequential(b);
    if (visiting.indexOf(name) >= 0) return false;
    const c = lib[name];
    if (!c) return false;
    visiting.push(name);
    const r = c.parts.some((p) => libHasState(lib, p.chip, visiting));
    visiting.pop();
    return r;
  }

  function partKind(type, lib) {
    const b = builtinOf(type);
    if (b !== null) return { kind: 'builtin', builtin: b };
    if (lib[type]) return { kind: 'user', builtin: null };
    return { kind: 'missing', builtin: null };
  }

  /** 是否為最底層原語（鑽入終點） */
  function isPrimitive(type) {
    const b = builtinOf(type);
    return b === Builtin.Nand || b === Builtin.Dff;
  }

  function primitiveKey(type) {
    const b = builtinOf(type);
    if (b === Builtin.Nand) return 'Nand';
    if (b === Builtin.Dff) return 'DFF';
    return null;
  }

  /**
   * 建出單層圖資料（只依賴 AST，不做全域 elab）。
   * 回傳 { name, inPins, outPins, parts, wires, missing }
   *   parts[i] = { slot, label, type, kind, builtin, drillable, primitive,
   *                inPins, outPins, conns:[{pin,pinText,src,srcText,dir,n}] }
   *   wires[i] = { name, writers:[{part,pin}], readers:[{part,pin}|{chipIn}|{chipOut}], isIn, isOut }
   */
  function levelOf(lib, chipName) {
    const chip = lib[chipName];
    if (!chip) throw new Error(`找不到晶片 \`${chipName}\``);
    const inNames = new Set(chip.inPins.map((p) => p.name));
    const outNames = new Set(chip.outPins.map((p) => p.name));
    const parts = chip.parts.map((part, slot) => {
      const k = partKind(part.chip, lib);
      const defs = childPins(part.chip, lib);
      const inPins = defs ? defs.inPins : [];
      const outPins = defs ? defs.outPins : [];
      const outSet = new Set(outPins.map((p) => p.name));
      const conns = part.conns.map((c) => {
        const dir = outSet.has(c.pin) ? 'out' : 'in';
        const pw = dir === 'out' ? pinWidthOf(outPins, c.pin) : pinWidthOf(inPins, c.pin);
        return {
          pin: c.pin,
          pinText: `${c.pin}${rangeText(c.pinRange)}`,
          src: c.src,
          srcText: srcText(c.src),
          dir,
          n: rangeBits(c.pinRange, pw),
        };
      });
      return {
        slot,
        label: part.chip,
        type: part.chip,
        kind: k.kind,
        builtin: k.builtin,
        drillable: k.kind === 'user',
        primitive: isPrimitive(part.chip),
        missing: k.kind === 'missing',
        seq: libHasState(lib, part.chip, []),
        inPins,
        outPins,
        conns,
      };
    });

    // wire 索引：輸出連線是 writer，輸入 Sig 連線是 reader
    const wireMap = new Map(); // name -> { name, writers, readers }
    const wireOf = (name) => {
      let w = wireMap.get(name);
      if (!w) {
        w = { name, writers: [], readers: [], isIn: inNames.has(name), isOut: outNames.has(name) };
        wireMap.set(name, w);
      }
      return w;
    };
    parts.forEach((p, pi) => {
      for (const c of p.conns) {
        if (c.dir === 'out') {
          if (c.src.kind === 'Sig') wireOf(c.src.name).writers.push({ part: pi, pin: c.pin });
        } else if (c.src.kind === 'Sig') {
          wireOf(c.src.name).readers.push({ part: pi, pin: c.pin });
        }
      }
    });
    const wires = [...wireMap.values()];
    const missing = parts.filter((p) => p.missing).map((p) => p.type);
    return { name: chip.name, inPins: chip.inPins, outPins: chip.outPins, parts, wires, missing };
  }

  /** 依 wire 依賴算每個 part 的深度（分層 x 用）。
   *  有狀態 part 的輸入在 tick 才取樣，不構成深度依賴（與 elab 斷邊同理），
   *  故時序回授不會讓深度發散；上限迭代收斂。 */
  function depthsOf(level) {
    const writerPartOf = new Map(); // wireName -> [partIdx]
    for (const w of level.wires) writerPartOf.set(w.name, w.writers.map((x) => x.part));
    const depth = new Array(level.parts.length).fill(0);
    for (let it = 0; it < level.parts.length + 2; it++) {
      let changed = false;
      level.parts.forEach((p, pi) => {
        if (p.seq) {
          if (depth[pi] !== 0) { depth[pi] = 0; changed = true; }
          return;
        }
        let d = 0;
        for (const c of p.conns) {
          if (c.dir !== 'in' || c.src.kind !== 'Sig') continue;
          const writers = writerPartOf.get(c.src.name) || [];
          for (const wpi of writers) {
            if (wpi === pi) continue;
            if (depth[wpi] + 1 > d) d = depth[wpi] + 1;
          }
        }
        if (d !== depth[pi]) {
          depth[pi] = d;
          changed = true;
        }
      });
      if (!changed) break;
    }
    return depth;
  }

  function boxH(nIn, nOut) {
    return HEADER_H + Math.max(nIn, nOut, 1) * PIN_ROW + BOX_PAD * 2;
  }

  /**
   * 版面配置：回傳 { width, height, boxes, inPins, outPins, edges }
   *   boxes[i] = { slot,label,type,x,y,w,h,kind,drillable,primitive,missing,
   *                inputs:[{name,n,y}], outputs:[{name,n,y}] }
   *   edges[i] = { wire, n, x1,y1,x2,y2, bus, kind:'wire'|'in'|'out'|'dangling',
   *                fromLabel, toLabel }
   */
  function layoutOf(level) {
    const depth = depthsOf(level);
    const maxDepth = level.parts.length ? Math.max(...depth) : 0;
    const cols = Array.from({ length: maxDepth + 1 }, () => []);
    level.parts.forEach((_, pi) => cols[depth[pi]].push(pi));

    const boxes = new Array(level.parts.length);
    cols.forEach((members, d) => {
      let y = TOP_H;
      const x = LEFT_W + d * (BOX_W + GAP_X);
      for (const pi of members) {
        const p = level.parts[pi];
        const h = boxH(p.inPins.length, p.outPins.length);
        const inputs = p.inPins.map((pin, i) => ({
          name: pin.name,
          width: pin.width,
          y: y + HEADER_H + BOX_PAD + i * PIN_ROW + PIN_ROW / 2,
        }));
        const outputs = p.outPins.map((pin, i) => ({
          name: pin.name,
          width: pin.width,
          y: y + HEADER_H + BOX_PAD + i * PIN_ROW + PIN_ROW / 2,
        }));
        boxes[pi] = {
          slot: p.slot, label: p.label, type: p.type, x, y, w: BOX_W, h,
          kind: p.kind, drillable: p.drillable, primitive: p.primitive, missing: p.missing,
          inputs, outputs,
        };
        y += h + GAP_Y;
      }
    });

    const colBottom = Math.max(
      TOP_H,
      ...boxes.map((b) => (b ? b.y + b.h : TOP_H)),
    );
    const inPins = level.inPins.map((p, i) => ({ name: p.name, width: p.width, x: 16, y: TOP_H + 14 + i * 30 }));
    const outX = LEFT_W + (maxDepth + 1) * (BOX_W + GAP_X);
    const outPins = level.outPins.map((p, i) => ({ name: p.name, width: p.width, x: outX, y: TOP_H + 14 + i * 30 }));
    const pinsBottom = Math.max(
      TOP_H + level.inPins.length * 30,
      TOP_H + level.outPins.length * 30,
    );
    const width = outX + RIGHT_W;
    const height = Math.max(colBottom, pinsBottom) + BOT_H;

    const inPinPos = new Map(inPins.map((p) => [p.name, p]));
    const outPinPos = new Map(outPins.map((p) => [p.name, p]));
    // 每條 wire 的 writer 錨點（取第一個 writer；多重分割寫入時取第一個）
    const writerAnchor = new Map(); // wireName -> {x,y,pin}
    for (const w of level.wires) {
      if (!w.writers.length) continue;
      const wr = w.writers[0];
      const b = boxes[wr.part];
      if (!b) continue;
      const o = b.outputs.find((q) => q.name === wr.pin) || b.outputs[0];
      if (o) writerAnchor.set(w.name, { x: b.x + b.w, y: o.y, pin: wr.pin });
    }

    const edges = [];
    // 輸入邊：每個 Sig 輸入連線一條（常數只留標籤，不拉線）
    level.parts.forEach((p, pi) => {
      const b = boxes[pi];
      for (const c of p.conns) {
        if (c.dir !== 'in' || c.src.kind !== 'Sig') continue;
        const inp = b.inputs.find((q) => q.name === c.pin);
        const y2 = inp ? inp.y : b.y + HEADER_H;
        const x2 = b.x;
        const wn = c.src.name;
        const wa = writerAnchor.get(wn);
        if (wa) {
          edges.push({
            wire: wn, n: c.n, x1: wa.x, y1: wa.y, x2, y2,
            bus: c.n > 1, kind: 'wire',
            fromLabel: wn, toLabel: `${p.label}.${c.pin}`,
          });
        } else if (inPinPos.has(wn)) {
          const s = inPinPos.get(wn);
          edges.push({
            wire: wn, n: c.n, x1: s.x + 96, y1: s.y, x2, y2,
            bus: c.n > 1, kind: 'in',
            fromLabel: `IN ${wn}`, toLabel: `${p.label}.${c.pin}`,
          });
        } else {
          edges.push({
            wire: wn, n: 1, x1: x2 - 40, y1: y2, x2, y2,
            bus: false, kind: 'dangling',
            fromLabel: wn, toLabel: `${p.label}.${c.pin}`,
          });
        }
      }
    });
    // 輸出邊：有 writer 的 OUT wire 從 writer 拉到右側
    for (const w of level.wires) {
      if (!w.isOut) continue;
      const wa = writerAnchor.get(w.name);
      const s = outPinPos.get(w.name);
      if (wa && s) {
        edges.push({
          wire: w.name, n: 1, x1: wa.x, y1: wa.y, x2: s.x, y2: s.y,
          bus: false, kind: 'out',
          fromLabel: w.name, toLabel: `OUT ${w.name}`,
        });
      }
    }
    return { width, height, boxes, inPins, outPins, edges, maxDepth };
  }

  /** 右側面板用的元件說明 */
  function describe(type, lib) {
    const pk = primitiveKey(type);
    if (pk && PRIMITIVE_INFO[pk]) {
      const info = PRIMITIVE_INFO[pk];
      return { kind: 'primitive', key: pk, title: info.title, body: info.body, truth: info.truth };
    }
    const b = builtinOf(type);
    if (b !== null) {
      const [inp, outp] = builtinInOut(b);
      return {
        kind: 'builtin', key: b, title: `${type}（內建，葉節點）`,
        body: BUILTIN_BLURB[b] || '內建晶片，葉節點，不再展開。',
        truth: null, inPins: inp, outPins: outp,
      };
    }
    const c = lib[type];
    if (c) {
      return {
        kind: 'user', key: type, title: `${type}（使用者晶片，可點入）`,
        body: `IN ${c.inPins.map((p) => `${p.name}${p.width > 1 ? `[${p.width}]` : ''}`).join(', ') || '—'}；OUT ${c.outPins.map((p) => `${p.name}${p.width > 1 ? `[${p.width}]` : ''}`).join(', ') || '—'}；內含 ${c.parts.length} 個子元件。`,
        truth: null, inPins: c.inPins, outPins: c.outPins,
      };
    }
    return { kind: 'missing', key: type, title: `${type}（找不到定義）`, body: '語料或貼上原始碼中沒有這顆子晶片的 .hdl，無法展開。', truth: null };
  }

  return { levelOf, depthsOf, layoutOf, describe, isPrimitive, childPins, BOX_W };
})();
