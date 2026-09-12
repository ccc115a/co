// HackHDL → JavaScript 程式碼產生器（對應 _eda/hdl2rs/src/gen.rs）
//
// 一個晶片 → 一個 class：
//   - 局部 wire 是 eval 內的區域變數（Number，0..0xffff）
//   - 每個 part 依拓樸順序求值，輸出透過 setBits 合併到目標 wire
//   - 內建 Nand/DFF/Reg/ROM32K/Screen/Keyboard 直接產生其行為
// 產出的程式完全自足（含 setBits 與內建晶片），可 `new Function` 載入，
// 或存成 ESM 模組（--keep）由 hackrt::tst 驅動。

import { Builtin, builtinSequential } from './elab.js';

const JS_KEYWORDS = new Set([
  'in', 'static', 'true', 'false', 'super', 'this', 'class', 'function', 'var',
  'let', 'const', 'return', 'for', 'while', 'if', 'else', 'do', 'new', 'switch',
  'case', 'break', 'continue', 'default', 'throw', 'try', 'catch', 'finally',
  'typeof', 'instanceof', 'delete', 'void', 'yield', 'await', 'import',
  'export', 'with', 'null', 'enum', 'implements', 'interface', 'package',
  'private', 'protected', 'public', 'extends', 'of', 'async',
]);

/** 非法識別元字元換成 `_`；開頭是數字則前綴 `_` */
export function san(name) {
  let s = '';
  for (const c of name) {
    s += /[A-Za-z0-9_]/.test(c) ? c : '_';
  }
  if (/^[0-9]/.test(s)) s = '_' + s;
  return s;
}

/** pin 名稱（規避 JS 保留字，例：in → in_） */
export function pinSan(name) {
  const s = san(name);
  return JS_KEYWORDS.has(s) ? `${s}_` : s;
}

/** 位元擷取運算式：取 expr 的 [lo, lo+width) */
function sub(expr, lo, n) {
  if (n >= 16) return expr;
  const mask = (1 << n) - 1;
  return `((${expr} >> ${lo}) & 0x${mask.toString(16)})`;
}

/** wire 變數名稱 */
function wname(chip, wire) {
  return `w_${san(chip.wires[wire].name)}`;
}

function chipType(e, clip) {
  if (clip.kind === 'User') return `${san(e.chips[clip.idx].name)}Chip`;
  switch (clip.b) {
    case Builtin.Nand: return 'NandChip';
    case Builtin.Dff: return 'DffChip';
    case Builtin.ARegister:
    case Builtin.DRegister: return 'RegChip';
    case Builtin.Rom32k: return 'Rom32KChip';
    case Builtin.Screen: return 'ScreenChip';
    case Builtin.Keyboard: return 'KeyboardChip';
  }
}

/** part 是否為有狀態（clocked）：eval 輸出取自狀態、輸入在 tick 才取樣 */
function isSeq(e, clip) {
  if (clip.kind === 'Builtin') return builtinSequential(clip.b);
  return e.chips[clip.idx].hasState;
}

/** chip 是否存在「序↔序」回饋迴圈（如 Computer） */
function hasFeedback(e, chip) {
  for (const w of chip.wires) {
    const wrSeq = w.writers.some((wr) => isSeq(e, chip.parts[wr.part].clip));
    const rdSeq = w.readers.some((rd) => isSeq(e, chip.parts[rd].clip));
    if (wrSeq && rdSeq) return true;
  }
  return false;
}

/** part 直接比對的 name 條件；Screen/Keyboard 附上常見別名（SCREEN、KBD） */
function partNameCond(part) {
  let base = `name === "${part.label}"`;
  if (part.clip.kind === 'Builtin' && part.clip.b === Builtin.Screen) {
    base += ` || name === "SCREEN"`;
  }
  if (part.clip.kind === 'Builtin' && part.clip.b === Builtin.Keyboard) {
    base += ` || name === "KBD"`;
  }
  return base;
}

/** part 輸入引數的綁定程式碼（支援多連線 setBits 組合） */
function emitInputs(chip, params, part, prefix, indent) {
  const args = [];
  const lines = [];
  for (let ini = 0; ini < part.inConns.length; ini++) {
    const conns = part.inConns[ini];
    const iv = `${prefix}${ini}`;
    if (conns.length === 0) {
      lines.push(`${indent}let ${iv} = 0x0;`);
    } else if (conns.length === 1) {
      lines.push(`${indent}let ${iv} = ${srcExpr(chip, conns[0].src, params)};`);
    } else {
      lines.push(`${indent}let ${iv} = 0;`);
      for (const c of conns) {
        lines.push(`${indent}${iv} = setBits(${iv}, ${c.pinLo}, ${c.n}, ${srcExpr(chip, c.src, params)});`);
      }
    }
    args.push(iv);
  }
  return { lines, args };
}

/** child 的輸出 pin 名稱（在 __o 上取欄位用） */
function childOutPin(e, part, opi) {
  if (part.clip.kind === 'User') return pinSan(e.chips[part.clip.idx].outPins[opi].name);
  return 'out';
}

/** user chip 是否具有 `address` 輸入（判斷 RAM-like） */
function hasAddress(e, idx) {
  return e.chips[idx].inPins.some((p) => p.name === 'address');
}

/** user chip out 的第一個 pin 的欄位名（探測時回傳的值） */
function chipOut0Field(e, idx) {
  return pinSan(e.chips[idx].outPins[0].name);
}

/** probe/set 時，對 user chip 產生「某種模式」的輸入引數 */
function probeArgs(e, idx, mode) {
  return e.chips[idx].inPins.map((p) => {
    if (p.name === 'address') return 'i';
    if (p.name === 'in' && mode === 'Set') return 'val';
    if (p.name === 'load' && mode === 'Set') return '1';
    return '0';
  });
}

/** 把 SrcIr 轉成目前語境的運算式 */
function srcExpr(chip, src, inParams) {
  switch (src.kind) {
    case 'Const': return `0x${src.v.toString(16)}`;
    case 'Wire': return wname(chip, src.w);
    case 'WireSlice': return sub(wname(chip, src.wire), src.lo, src.n);
    case 'ChipIn': return sub(inParams[src.pin], src.lo, src.n);
  }
}

/** 需要哪些內建晶片 class 定義 */
function usedBuiltins(e) {
  return e.chips.flatMap((c) => c.parts.map((p) => (p.clip.kind === 'Builtin' ? p.clip.b : null)))
    .filter((b) => b !== null);
}

/** 產生 gen 內容（JS 原始碼字串） */
export function generateJs(e, { asModule = false } = {}) {
  const src = [];
  src.push('// 由 hackjs/hdl2js 自動產生，請勿手動編輯');
  src.push('// ---- 共用工具 ----');
  src.push('function setBits(w, lo, n, val) {');
  src.push('  const mask = n >= 16 ? 0xffff : ((1 << n) - 1);');
  src.push('  return (w & (~(mask << lo) & 0xffff)) | ((val & mask) << lo);');
  src.push('}');
  src.push('');

  src.push('// ---- 內建 Nand ----');
  src.push('class NandChip {');
  src.push('  eval(a, b) { return { out: !(a !== 0 && b !== 0) ? 1 : 0 }; }');
  src.push('  tick() {} tock() {}');
  src.push('}');
  src.push('');

  const ub = usedBuiltins(e);
  if (ub.includes(Builtin.Dff)) {
    src.push('// ---- 內建 DFF（master/slave 兩階段）----');
    src.push('class DffChip {');
    src.push('  constructor() { this.latch = 0; this.q = 0; }');
    src.push('  eval() { return { out: this.q }; }');
    src.push('  sample(in_) { this.latch = in_ & 1; }');
    src.push('  tock() { this.q = this.latch; }');
    src.push('  probeWhole() { return this.latch; }');
    src.push('  probeBit(i) { return (this.latch >> i) & 1; }');
    src.push('}');
    src.push('');
  }
  if (ub.some((b) => b === Builtin.ARegister || b === Builtin.DRegister)) {
    src.push('// ---- 內建 ARegister / DRegister（16-bit register）----');
    src.push('class RegChip {');
    src.push('  constructor() { this.latch = 0; this.q = 0; }');
    src.push('  eval(in_, load) { return { out: this.q }; }');
    src.push('  sample(in_, load) { if (load !== 0) this.latch = in_; }');
    src.push('  tock() { this.q = this.latch; }');
    src.push('  probeWhole() { return this.latch; }');
    src.push('  probeBit(i) { return (this.latch >> i) & 1; }');
    src.push('}');
    src.push('');
  }
  if (ub.includes(Builtin.Rom32k)) {
    src.push('// ---- 內建 ROM32K（程式記憶體，地址空間 32768）----');
    src.push('class Rom32KChip {');
    src.push('  constructor() { this.mem = new Uint16Array(32768); }');
    src.push('  eval(address) { return { out: address < 32768 ? this.mem[address] : 0 }; }');
    src.push('  tick() {} tock() {}');
    src.push('  load(src) {');
    src.push('    const readers = typeof globalThis !== "undefined" ? (globalThis.HACKJS_FS || {}) : {};');
    src.push('    if (typeof src === "string" && !src.includes("\\n")) {');
    src.push('      if (readers.read) {');
    src.push('        const s = readers.read(src);');
    src.push('        if (s !== null && s !== undefined) src = s;');
    src.push('      }');
    src.push('    }');
    src.push('    if (typeof src !== "string" || src.trim() === "") return false;');
    src.push('    let idx = 0;');
    src.push('    for (const line of String(src).split("\\n")) {');
    src.push('      const t = line.trim();');
    src.push('      if (t === "") continue;');
    src.push('      const bin = t.split(/\\s+/)[0];');
    src.push('      const v = parseInt(bin, 2);');
    src.push('      if (Number.isNaN(v)) return false;');
    src.push('      if (idx >= 32768) break;');
    src.push('      this.mem[idx] = v & 0xffff;');
    src.push('      idx += 1;');
    src.push('    }');
    src.push('    return true;');
    src.push('  }');
    src.push('}');
    src.push('');
  }
  if (ub.includes(Builtin.Screen)) {
    src.push('// ---- 內建 Screen（8192 個 word 的螢幕對映）----');
    src.push('class ScreenChip {');
    src.push('  constructor() { this.mem = new Uint16Array(8192); }');
    src.push('  eval(in_, load, address) { return { out: address < 8192 ? this.mem[address] : 0 }; }');
    src.push('  sample(in_, load, address) { if (load !== 0 && address < 8192) this.mem[address] = in_; }');
    src.push('  tock() {}');
    src.push('}');
    src.push('');
  }
  if (ub.includes(Builtin.Keyboard)) {
    src.push('// ---- 內建 Keyboard（記憶體對映鍵盤；值由 set Keyword N 設定）----');
    src.push('class KeyboardChip {');
    src.push('  constructor() { this.key = 0; }');
    src.push('  eval() { return { out: this.key }; }');
    src.push('  setKey(v) { this.key = v & 0xffff; }');
    src.push('  probe() { return this.key; }');
    src.push('  tick() {} tock() {}');
    src.push('}');
    src.push('');
  }

  for (const chip of e.chips) {
    genChip(e, chip, src);
  }
  if (asModule) {
    const topChip = e.chips[e.top];
    src.push(`export { ${san(topChip.name)}Chip };`);
    src.push('');
  }
  return src.join('\n');
}

const RAM_FAMILY = new Set(['RAM8', 'RAM64', 'RAM512', 'RAM4K', 'RAM16K']);
const RAM_SIZE = { RAM8: 8, RAM64: 64, RAM512: 512, RAM4K: 4096, RAM16K: 16384 };

/** 是否為教材標準 RAM 結構（DMux8Way + 8×Register/RAM* + Mux8Way16；位址→cell 對映）：
    這種晶片融合成原生 Uint16Array，語意與 gate 版完全等價，但 eval/sample 從 O(N) 變 O(1)。 */
function isNativeRamChip(e, chip) {
  if (!RAM_FAMILY.has(chip.name)) return false;
  if (!chip.hasState) return false;
  const parts = chip.parts;
  if (parts.length !== 10) return false;
  const types = {};
  for (const p of parts) {
    const cn = p.clip.kind === 'User' ? e.chips[p.clip.idx].name : String(p.clip.b);
    types[cn] = (types[cn] ?? 0) + 1;
  }
  const keys = Object.keys(types);
  if (keys.length !== 3) return false;
  const one = keys.filter((k) => types[k] === 1);
  if (one.length !== 2) return false;
  if (!(one.includes('DMux8Way') && one.includes('Mux8Way16'))) return false;
  const eight = keys.filter((k) => types[k] === 8);
  if (eight.length !== 1) return false;
  const kid = eight[0];
  return kid === 'Register' || RAM_FAMILY.has(kid);
}

/** 原生 RAM chip 生成：Uint16Array cells + 兩相寫入緩衝（sample 記、tock 提交） */
function genNativeRamChip(chip, src) {
  const cn = san(chip.name);
  const size = RAM_SIZE[chip.name] ?? 0;
  src.push(`// ---- ${chip.name}（原生 cell 陣列加速）----`);
  src.push(`class ${cn}Chip {`);
  src.push(`  constructor() { this.mem = new Uint16Array(${size}); this._b = 0; this._ba = 0; this._bl = false; }`);
  src.push('  eval(in_, load, address) {');
  src.push(`    const a = address & 0xffff;`);
  src.push(`    return { out: a < ${size} ? this.mem[a] : 0 };`);
  src.push('  }');
  src.push('  sample(in_, load, address) {');
  src.push(`    this._bl = load !== 0; this._b = in_ & 0xffff; this._ba = address & 0xffff;`);
  src.push('  }');
  src.push('  tock() {');
  src.push(`    if (this._bl && this._ba < ${size}) this.mem[this._ba] = this._b;`);
  src.push('    this._bl = false;');
  src.push('  }');
  src.push('  probe_whole() { return null; }');
  src.push('  probe_indexed(name, i) {');
  src.push(`    const a = i & 0xffff;`);
  src.push(`    return a < ${size} ? this.mem[a] : 0;`);
  src.push('  }');
  src.push('  set_probe(name, i, v) {');
  src.push(`    const a = i & 0xffff;`);
  src.push(`    if (a < ${size}) { this.mem[a] = v & 0xffff; return true; }`);
  src.push('    return false;');
  src.push('  }');
  src.push('  load() { return false; }');
  src.push('}');
  src.push('');
}

function genChip(e, chip, src) {
  if (isNativeRamChip(e, chip)) {
    genNativeRamChip(chip, src);
    return;
  }
  const cn = san(chip.name);
  const params = chip.inPins.map((p) => pinSan(p.name));

  src.push(`// ---- ${chip.name} ----`);
  src.push(`class ${cn}Chip {`);
  src.push('  constructor() {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const part = chip.parts[slot];
    src.push(`    this._p${slot} = new ${chipType(e, part.clip)}();`);
  }
  src.push('  }');

  // ---- eval：獲取關聯性輸出（輸出自狀態，與輸入無關）----
  src.push(`  eval(${params.join(', ')}) {`);
  emitCascade(e, chip, params, '    ', src);
  src.push('    return {');
  for (const op of chip.outPins) {
    src.push(`      ${pinSan(op.name)}: ${wname(chip, chip.wires.findIndex((w) => w.name === op.name))},`);
  }
  src.push('    };');
  src.push('  }');

  // ---- sample：tick 邊緣，先重算落定的 wire，再遞迴取樣有狀態 children ----
  src.push(`  sample(${params.join(', ')}) {`);
  emitCascade(e, chip, params, '    ', src);
  if (hasFeedback(e, chip)) {
    src.push('    // 回饋迴圈：以最終 wire 再完整評估一輪（eval 為純函式）');
    emitPartsEval(e, chip, params, '    ', src);
  }
  if (chip.hasState) {
    src.push('    // 遞迴取樣有狀態 children');
    for (const slot of chip.evalOrder) {
      const part = chip.parts[slot];
      if (!isSeq(e, part.clip)) continue;
      src.push('    {');
      const { lines, args } = emitInputs(chip, params, part, '__c', '      ');
      for (const l of lines) src.push(l);
      src.push(`      this._p${slot}.sample(${args.join(', ')});`);
      src.push('    }');
    }
  }
  src.push('  }');

  // ---- tock：提交所有子晶片狀態 ----
  src.push('  tock() {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    src.push(`    this._p${slot}.tock();`);
  }
  src.push('  }');

  // ---- probe_whole ----
  src.push('  probe_whole(name) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const part = chip.parts[slot];
    src.push(`    // part ${slot}: ${part.label} (${chipType(e, part.clip)})`);
    src.push(`    if (${partNameCond(part)}) {`);
    const clip = part.clip;
    if (clip.kind === 'Builtin' && (clip.b === Builtin.Dff || clip.b === Builtin.ARegister || clip.b === Builtin.DRegister)) {
      src.push(`      return this._p${slot}.probeWhole();`);
    } else if (clip.kind === 'Builtin' && clip.b === Builtin.Keyboard) {
      src.push(`      return this._p${slot}.probe();`);
    } else if (clip.kind === 'User' && !hasAddress(e, clip.idx)) {
      const args = probeArgs(e, clip.idx, 'Whole');
      src.push(`      return this._p${slot}.eval(${args.join(', ')})[${JSON.stringify(chipOut0Field(e, clip.idx))}];`);
    } else {
      src.push('      return null;');
    }
    src.push('    }');
  }
  src.push('    // 遞迴 user parts');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'User') {
      src.push(`    { const v = this._p${slot}.probe_whole(name); if (v !== null) return v; }`);
    }
  }
  src.push('    return null;');
  src.push('  }');

  // ---- probe_indexed ----
  src.push('  probe_indexed(name, i) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const part = chip.parts[slot];
    const clip = part.clip;
    src.push(`    // part ${slot}: ${part.label} (${chipType(e, part.clip)})`);
    src.push(`    if (${partNameCond(part)}) {`);
    if (clip.kind === 'Builtin' && (clip.b === Builtin.Dff || clip.b === Builtin.ARegister || clip.b === Builtin.DRegister)) {
      src.push(`      return this._p${slot}.probeWhole();`);
    } else if (clip.kind === 'Builtin' && clip.b === Builtin.Keyboard) {
      src.push(`      return this._p${slot}.probe();`);
    } else if (clip.kind === 'Builtin' && clip.b === Builtin.Screen) {
      src.push(`      return this._p${slot}.eval(0, 0, i).out;`);
    } else if (clip.kind === 'Builtin' && clip.b === Builtin.Rom32k) {
      src.push(`      return this._p${slot}.eval(i).out;`);
    } else if (clip.kind === 'User' && hasAddress(e, clip.idx)) {
      const args = probeArgs(e, clip.idx, 'Cell');
      src.push(`      return this._p${slot}.eval(${args.join(', ')})[${JSON.stringify(chipOut0Field(e, clip.idx))}];`);
    } else if (clip.kind === 'User') {
      const args = probeArgs(e, clip.idx, 'Whole');
      src.push(`      return this._p${slot}.eval(${args.join(', ')})[${JSON.stringify(chipOut0Field(e, clip.idx))}];`);
    } else {
      src.push('      return null;');
    }
    src.push('    }');
  }
  src.push('    // 遞迴 user parts');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'User') {
      src.push(`    { const v = this._p${slot}.probe_indexed(name, i); if (v !== null) return v; }`);
    }
  }
  src.push('    return null;');
  src.push('  }');

  // ---- set_whole ----
  src.push('  set_whole(name, val) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'Builtin' && chip.parts[slot].clip.b === Builtin.Keyboard) {
      src.push(`    if (${partNameCond(chip.parts[slot])}) { this._p${slot}.setKey(val); return true; }`);
    }
  }
  src.push('    // 遞迴 user parts');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'User') {
      src.push(`    if (this._p${slot}.set_whole(name, val)) return true;`);
    }
  }
  src.push('    return false;');
  src.push('  }');

  // ---- set_probe ----
  src.push('  set_probe(name, i, val) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const part = chip.parts[slot];
    const clip = part.clip;
    src.push(`    // part ${slot}: ${part.label} (${chipType(e, part.clip)})`);
    src.push(`    if (${partNameCond(part)}) {`);
    if (clip.kind === 'Builtin' && clip.b === Builtin.Screen) {
      src.push(`      this._p${slot}.sample(val, 1, i);`);
      src.push(`      this._p${slot}.tock();`);
      src.push('      return true;');
    } else if (clip.kind === 'User' && hasAddress(e, clip.idx)) {
      const args = probeArgs(e, clip.idx, 'Set');
      src.push(`      this._p${slot}.sample(${args.join(', ')});`);
      src.push(`      this._p${slot}.tock();`);
      src.push('      return true;');
    } else {
      src.push('      return false;');
    }
    src.push('    }');
  }
  src.push('    // 遞迴 user parts');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    if (chip.parts[slot].clip.kind === 'User') {
      src.push(`    if (this._p${slot}.set_probe(name, i, val)) return true;`);
    }
  }
  src.push('    return false;');
  src.push('  }');

  // ---- load_program ----
  src.push('  load_program(p) {');
  for (let slot = 0; slot < chip.parts.length; slot++) {
    const clip = chip.parts[slot].clip;
    if (clip.kind === 'Builtin' && clip.b === Builtin.Rom32k) {
      src.push(`    if (this._p${slot}.load(p)) return true;`);
    } else if (clip.kind === 'User') {
      src.push(`    if (this._p${slot}.load_program(p)) return true;`);
    }
  }
  src.push('    return false;');
  src.push('  }');

  src.push('}');
  src.push('');
}

/** 產生 eval/sample 共用的「先算 wire 再算 part」程式碼 */
function emitCascade(e, chip, params, indent, src) {
  emitWireDecls(chip, indent, src);
  emitPartsEval(e, chip, params, indent, src);
}

/** 每個 wire 的 `let w_xxx = 0;` 宣告 */
function emitWireDecls(chip, indent, src) {
  for (const w of chip.wires) {
    src.push(`${indent}let ${wname(chip, chip.wires.indexOf(w))} = 0;`);
  }
}

/** 依 eval_order 逐一評估 part，把輸出合併進 wire */
function emitPartsEval(e, chip, params, indent, src) {
  for (const slot of chip.evalOrder) {
    const part = chip.parts[slot];
    const ty = chipType(e, part.clip);
    src.push(`${indent}{ // part ${slot}: ${part.label} (${ty})`);
    const inner = indent + '  ';
    if (part.clip.kind === 'Builtin' && part.clip.b === Builtin.Dff) {
      src.push(`${inner}const __o = this._p${slot}.eval();`);
    } else {
      const { lines, args } = emitInputs(chip, params, part, '__i', inner);
      for (const l of lines) src.push(l);
      src.push(`${inner}const __o = this._p${slot}.eval(${args.join(', ')});`);
    }
    emitOutMerges(e, chip, part, inner, src);
    src.push(`${indent}}`);
  }
}

/** 把 part 的輸出合併到 wire */
function emitOutMerges(e, chip, part, indent, src) {
  for (let opi = 0; opi < part.outWires.length; opi++) {
    const childOut = childOutPin(e, part, opi);
    for (const ow of part.outWires[opi]) {
      const w = wname(chip, ow.wire);
      const s = sub(`__o.${childOut}`, ow.pinLo, ow.n);
      src.push(`${indent}${w} = setBits(${w}, ${ow.destLo}, ${ow.n}, ${s});`);
    }
  }
}

/** top 晶片 class 名稱（供 CLI 編譯後取用） */
export function topClassExpr(e) {
  return `${san(e.chips[e.top].name)}Chip`;
}