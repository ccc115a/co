// 詳述（elaboration）：把 parse 好的晶片圖解析成可 codegen 的 IR
// （對應 _eda/hackhdl/src/elab.rs）
import fs from 'node:fs';
import path from 'node:path';
import { parseHdl } from './parser.js';

/** 內建晶片（原始語義，不是手寫 HDL） */
export const Builtin = {
  Nand: 'Nand',
  Dff: 'DFF',
  ARegister: 'ARegister',
  DRegister: 'DRegister',
  Rom32k: 'ROM32K',
  Screen: 'Screen',
  Keyboard: 'Keyboard',
};

/** HDL 裡寫的內建晶片名 → Builtin 常數 */
const BUILTIN_NAME = {
  Nand: 'Nand',
  DFF: 'Dff',
  ARegister: 'ARegister',
  DRegister: 'DRegister',
  ROM32K: 'Rom32k',
  Screen: 'Screen',
  Keyboard: 'Keyboard',
};

export function builtinOf(name) {
  const key = BUILTIN_NAME[name];
  return key !== undefined ? Builtin[key] : null;
}

export function builtinInOut(b) {
  switch (b) {
    case Builtin.Nand:
      return [
        [{ name: 'a', width: 1 }, { name: 'b', width: 1 }],
        [{ name: 'out', width: 1 }],
      ];
    case Builtin.Dff:
      return [[{ name: 'in', width: 1 }], [{ name: 'out', width: 1 }]];
    case Builtin.ARegister:
    case Builtin.DRegister:
      return [
        [{ name: 'in', width: 16 }, { name: 'load', width: 1 }],
        [{ name: 'out', width: 16 }],
      ];
    case Builtin.Rom32k:
      return [[{ name: 'address', width: 15 }], [{ name: 'out', width: 16 }]];
    case Builtin.Screen:
      return [
        [{ name: 'in', width: 16 }, { name: 'load', width: 1 }, { name: 'address', width: 13 }],
        [{ name: 'out', width: 16 }],
      ];
    case Builtin.Keyboard:
      return [[], [{ name: 'out', width: 16 }]];
  }
}

/** 是否為有狀態（clocked）晶片 */
export function builtinSequential(b) {
  return b === Builtin.Dff || b === Builtin.ARegister || b === Builtin.DRegister || b === Builtin.Screen;
}

export class ElabError extends Error {
  constructor(msg) { super(msg); this.msg = msg; }
}

export function mask(n) {
  return n >= 16 ? 0xffff : (1 << n) - 1;
}

/** pin 側的位元數：Whole 用 pin 寬度 pw，Bit/Slice 用 range 本身 */
function pinRangeBits(range, pw) {
  return range.kind === 'Whole' ? pw : range.bits();
}

/** 子晶片是使用者晶片還是內建：{ kind:'User', idx } | { kind:'Builtin', b } */
export function partChipName(clip) {
  if (clip.kind === 'User') return '?';
  return clip.b;
}

export class ElabPart {
  constructor(label, clip, inConns, outWires) {
    this.label = label;     // 實例標籤
    this.clip = clip;       // PartClip
    this.inConns = inConns; // 每個輸入 pin 的連線清單
    this.outWires = outWires; // 每個輸出 pin 的 fan-out 清單
  }
}

export class PinConnIr {
  constructor(pinLo, n, src) {
    this.pinLo = pinLo;
    this.n = n;
    this.src = src;
  }
}
// SrcIr: { kind:'Const', v } | { kind:'Wire', w } | { kind:'WireSlice', wire, lo, n } | { kind:'ChipIn', pin, lo, n }

export class OutWireIr {
  constructor(pinLo, n, wire, destLo) {
    this.pinLo = pinLo;
    this.n = n;
    this.wire = wire;
    this.destLo = destLo;
  }
}

export class WireWriter {
  constructor(part, pin, srcLo, n, destLo) {
    this.part = part;
    this.pin = pin;
    this.srcLo = srcLo;
    this.n = n;
    this.destLo = destLo;
  }
}

export class Wire {
  constructor(name, width, outPin, writers, readers) {
    this.name = name;
    this.width = width;
    this.outPin = outPin; // 若這條 wire 是 chip 的 OUT pin，記錄其 pin index
    this.writers = writers;
    this.readers = readers;
  }
}

export class ElabChip {
  constructor(name, inPins, outPins, parts, evalOrder, wires, hasState) {
    this.name = name;
    this.inPins = inPins;
    this.outPins = outPins;
    this.parts = parts;     // ElabPart[]（以 slot 索引）
    this.evalOrder = evalOrder; // slot 排列
    this.wires = wires;
    this.hasState = hasState;
  }
}

export class Elab {
  constructor(chips, names, top) {
    this.chips = chips;
    this.names = names; // chipName -> idx
    this.top = top;
  }
}

/** 遞迴收集 dir 下的所有 .hdl（含子目錄，Lexical 排序，結果確定） */
function collectHdl(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new ElabError(`無法讀取 ${dir}: ${e.message}`);
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('.')) continue;
      out.push(...collectHdl(p));
    } else if (ent.name.endsWith('.hdl')) {
      out.push(p);
    }
  }
  return out;
}

/** 解析一個目錄（含子目錄）下所有 .hdl 成 library（name -> Chip） */
export function loadLibrary(dir) {
  const lib = {};
  for (const p of collectHdl(dir)) {
    const name = path.basename(p, '.hdl');
    let src;
    try {
      src = fs.readFileSync(p, 'utf8');
    } catch (e) {
      throw new ElabError(`讀取 ${p}: ${e.message}`);
    }
    let chip;
    try {
      chip = parseHdl(src);
    } catch (e) {
      throw new ElabError(`${p}: ${e.message}`);
    }
    lib[name] = chip;
  }
  return lib;
}

/** 結合多個目錄的 library（後面的覆蓋前面的） */
export function mergeLibs(a, b) {
  return { ...a, ...b };
}

/** 結合任意數量的 library（後面的覆蓋前面的） */
export function mergeLibsList(libs) {
  return Object.assign({}, ...libs);
}

/** 詳述：以 top 為入口解析整個晶片圖 */
export function elab(lib, top) {
  const r = new Resolver(lib);
  const topIdx = r.resolve(top);
  return new Elab(r.chips, r.names, topIdx);
}

class Resolver {
  constructor(lib) {
    this.lib = lib;
    this.chips = [];
    this.names = {};
    this.visiting = [];
  }
  resolve(name) {
    if (name in this.names) return this.names[name];
    if (this.visiting.includes(name)) {
      throw new ElabError(`晶片參考迴圈：${name} -> ${this.visiting[0]}`);
    }
    const ast = this.lib[name];
    if (!ast) {
      throw new ElabError(`找不到晶片 \`${name}\`（沒有對應 .hdl，也不是內建晶片）`);
    }
    this.visiting.push(name);
    const chip = this.elabChip(ast);
    this.visiting.pop();
    const idx = this.chips.length;
    this.chips.push(chip);
    this.names[name] = idx;
    return idx;
  }

  elabChip(ast) {
    const context = `晶片 ${ast.name}`;
    const inPins = ast.inPins;
    const outPins = ast.outPins;

    // 子晶片解析（先遞迴解析所有 part，取得 pin 定義）
    const children = [];
    for (const part of ast.parts) {
      const b = builtinOf(part.chip);
      let clip, inp, outp;
      if (b !== null) {
        clip = { kind: 'Builtin', b };
        [inp, outp] = builtinInOut(b);
      } else {
        const idx = this.resolve(part.chip);
        clip = { kind: 'User', idx };
        const c = this.chips[idx];
        inp = c.inPins;
        outp = c.outPins;
      }
      children.push({ clip, inPins: inp, outPins: outp });
    }

    const inIdx = new Map(inPins.map((p, i) => [p.name, i]));
    const outIdx = new Map(outPins.map((p, i) => [p.name, i]));

    // Pass A：收集每個 wire 的所有驅動者（可為多個不重疊的分割寫入）
    const wires = [];
    const wireByName = new Map();
    const wireRanges = new Map(); // name -> [{lo,n}]
    for (let pi = 0; pi < ast.parts.length; pi++) {
      const part = ast.parts[pi];
      const chip = children[pi];
      for (const conn of part.conns) {
        const outPinI = chip.outPins.findIndex((p) => p.name === conn.pin);
        if (outPinI >= 0) {
          // 輸出連線：`child.pin[pin_range] = wire[src_range]`
          if (conn.src.kind !== 'Sig') {
            throw new ElabError(`${context}: 晶片輸出 \`${part.chip}.${conn.pin}\` 不能接到常數`);
          }
          const name = conn.src.name;
          const range = conn.src.range;
          const pw = chip.outPins[outPinI].width;
          const n = pinRangeBits(conn.pinRange, pw);
          const srcLo = conn.pinRange.lo();
          const destLo = range.lo();
          const destN = range.bits() === 1 && range.kind === 'Whole' ? n : range.bits();
          if (destN !== n) {
            throw new ElabError(
              `${context}: 輸出連線 \`${part.chip}.${conn.pin}\`= 寬度不合（來源 ${n} 位元 vs 目標 ${destN} 位元）`
            );
          }
          const ranges = wireRanges.get(name) ?? [];
          for (const [dlo, dn] of ranges) {
            if (destLo < dlo + dn && dlo < destLo + n) {
              throw new ElabError(
                `${context}: wire \`${name}\` 上的 ${destLo}..${destLo + n} 位元被重複驅動`
              );
            }
          }
          ranges.push([destLo, n]);
          wireRanges.set(name, ranges);
          if (inIdx.has(name)) {
            throw new ElabError(`${context}: wire \`${name}\` 與 IN pin 同名`);
          }
          let w = wireByName.get(name);
          if (w === undefined) {
            w = wires.length;
            wires.push(new Wire(name, 0, outIdx.has(name) ? outIdx.get(name) : null, [], []));
            wireByName.set(name, w);
          }
          wires[w].writers.push(new WireWriter(pi, outPinI, srcLo, n, destLo));
        }
        // 輸入 pin：留到 Pass B 處理
      }
    }

    // 計算 wire 寬度並驗證 OUT pin 完整覆蓋
    for (const [name, ranges] of wireRanges) {
      const w = wireByName.get(name);
      wires[w].width = Math.max(...ranges.map(([lo, n]) => lo + n));
    }
    for (const w of wires) {
      if (w.outPin !== null) {
        if (w.width !== outPins[w.outPin].width) {
          throw new ElabError(
            `${context}: OUT pin \`${w.name}\` 寬度 ${outPins[w.outPin].width}，但只被驅動到 ${w.width} 位元`
          );
        }
        const covered = new Array(w.width).fill(false);
        for (const wr of w.writers) {
          for (let b = wr.destLo; b < wr.destLo + wr.n; b++) covered[b] = true;
        }
        if (covered.some((c) => !c)) {
          throw new ElabError(`${context}: OUT pin \`${w.name}\` 沒有被完整驅動`);
        }
      }
    }

    // Pass B：輸入 pin 連線解析 + 輸出 pin fan-out 記錄
    const parts = [];
    let hasState = false;
    for (let pi = 0; pi < ast.parts.length; pi++) {
      const part = ast.parts[pi];
      const chip = children[pi];
      if (chip.clip.kind === 'Builtin') hasState ||= builtinSequential(chip.clip.b);
      else hasState ||= this.chips[chip.clip.idx].hasState;
      const inConns = Array.from({ length: chip.inPins.length }, () => []);
      const outWires = Array.from({ length: chip.outPins.length }, () => []);
      for (const conn of part.conns) {
        const outPinI = chip.outPins.findIndex((p) => p.name === conn.pin);
        if (outPinI >= 0) {
          const pw = chip.outPins[outPinI].width;
          if (conn.src.kind !== 'Sig') continue;
          const n = pinRangeBits(conn.pinRange, pw);
          const pinLo = conn.pinRange.lo();
          const destLo = conn.src.range.lo();
          const w = wireByName.get(conn.src.name);
          outWires[outPinI].push(new OutWireIr(pinLo, n, w, destLo));
          continue;
        }
        // 輸入 pin
        const ini = chip.inPins.findIndex((p) => p.name === conn.pin);
        if (ini < 0) {
          throw new ElabError(
            `${context}: \`${part.chip}\` 沒有 \`${part.chip}.${conn.pin}\` 這個 pin（child=${partChipName(chip.clip)}）`
          );
        }
        const pw = chip.inPins[ini].width;
        const n = pinRangeBits(conn.pinRange, pw);
        const pinLo = conn.pinRange.lo();
        let src;
        if (conn.src.kind === 'Const') {
          src = { kind: 'Const', v: conn.src.v ? mask(n) : 0 };
        } else {
          const { name, range } = conn.src;
          let rngBits;
          if (range.kind === 'Whole') {
            if (inIdx.has(name)) rngBits = inPins[inIdx.get(name)].width;
            else if (wireByName.has(name)) rngBits = wires[wireByName.get(name)].width;
            else throw new ElabError(`${context}: \`${part.chip}\` 參考了未定義的訊號 \`${name}\``);
          } else if (range.kind === 'Bit') {
            const w = wireByName.has(name) ? wireByName.get(name) : inIdx.has(name) ? -1 : null;
            if (w === null) throw new ElabError(`${context}: 未定義的訊號 \`${name}\``);
            rngBits = 1;
          } else {
            rngBits = range.bits();
          }
          if (rngBits !== n) {
            throw new ElabError(
              `${context}: \`${part.chip}.${conn.pin}=\` 寬度不合（pin ${n} 位元 vs 訊號 ${rngBits} 位元）`
            );
          }
          if (wireByName.has(name)) {
            const w = wireByName.get(name);
            wires[w].readers.push(pi);
            if (range.kind === 'Whole') src = { kind: 'Wire', w };
            else src = { kind: 'WireSlice', wire: w, lo: range.lo(), n: rngBits };
          } else if (inIdx.has(name)) {
            const ipin = inIdx.get(name);
            src = { kind: 'ChipIn', pin: ipin, lo: range.lo(), n: rngBits };
          } else {
            throw new ElabError(`${context}: 未定義的訊號 \`${name}\``);
          }
        }
        inConns[ini].push(new PinConnIr(pinLo, n, src));
      }
      // 驗證每個輸入 pin 的連線完整覆蓋
      for (let ini = 0; ini < inConns.length; ini++) {
        const pw = chip.inPins[ini].width;
        const covered = new Array(pw).fill(false);
        for (const c of inConns[ini]) {
          for (let b = c.pinLo; b < c.pinLo + c.n; b++) {
            if (covered[b]) {
              throw new ElabError(
                `${context}: \`${part.chip}\` 的 pin \`${chip.inPins[ini].name}\` 位元 ${b} 重複驅動`
              );
            }
            covered[b] = true;
          }
        }
        if (covered.some((c) => !c)) {
          throw new ElabError(
            `${context}: \`${part.chip}\` 的 pin \`${chip.inPins[ini].name}\` 連線未完整覆蓋寬度 ${pw}`
          );
        }
      }
      parts.push(new ElabPart(part.chip, chip.clip, inConns, outWires));
    }

    // 驗證 chip 每個 OUT pin 都有驅動
    for (const op of outPins) {
      const w = wireByName.get(op.name);
      if (w === undefined) throw new ElabError(`${context}: OUT pin \`${op.name}\` 沒有被驅動`);
      if (wires[w].outPin === null) {
        throw new ElabError(`${context}: OUT pin \`${op.name}\` 的 wire 型別錯誤`);
      }
    }

    // 拓樸排序（前向參考允許）
    const n = parts.length;
    const partSeq = parts.map((p) => {
      if (p.clip.kind === 'Builtin') return builtinSequential(p.clip.b);
      return this.chips[p.clip.idx].hasState;
    });
    const adj = Array.from({ length: n }, () => []);
    const indeg = new Array(n).fill(0);
    for (const w of wires) {
      if (w.writers.length === 0) {
        throw new ElabError(`${context}: wire \`${w.name}\` 沒有驅動者`);
      }
      for (const rd of w.readers) {
        if (partSeq[rd]) continue; // 有狀態 part 的輸入在 tick 才取樣
        for (const wr of w.writers) {
          if (rd === wr.part) {
            throw new ElabError(
              `${context}: wire \`${w.name}\` 同時被 part ${rd} 寫入與讀取（組合迴圈）`
            );
          }
          adj[wr.part].push(rd);
          indeg[rd] += 1;
        }
      }
    }
    // Kahn，同層維持原順序
    const order = [];
    const ready = [];
    for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i);
    let k = 0;
    while (k < ready.length) {
      const u = ready[k];
      k += 1;
      order.push(u);
      for (const v of adj[u]) {
        indeg[v] -= 1;
        if (indeg[v] === 0) ready.push(v);
      }
    }
    if (order.length !== n) {
      throw new ElabError(`${context}: parts 存在組合迴圈（${n - order.length}-part 未被排序）`);
    }

    return new ElabChip(ast.name, inPins, outPins, parts, order, wires, hasState);
  }
}