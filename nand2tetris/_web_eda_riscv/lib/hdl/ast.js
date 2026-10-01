// HackHDL 的 AST 與解析結果（對應 _eda/hackhdl/src/ast.rs）
//
// 支援的語法子集：
//   CHIP Name {
//       IN  a, b[16], c;
//       OUT out[16], zr, ng;
//       PARTS:
//       SubChip (a=a, b[0]=true, b[1..15]=false, out[0..7]=w, out[15]=x, out=out);
//   }

/** 連到 pin 的位置：整條 / 單 bit / 範圍切片 */
export class Range {
  /** { kind:'Whole' } | { kind:'Bit', i } | { kind:'Slice', lo, hi } */
  constructor(kind, ...args) {
    this.kind = kind;
    if (kind === 'Bit') this.i = args[0];
    if (kind === 'Slice') { this.lo0 = args[0]; this.hi0 = args[1]; }
  }
  static whole() { return new Range('Whole'); }
  static bit(i) { return new Range('Bit', i); }
  static slice(lo, hi) { return new Range('Slice', lo, hi); }
  bits() {
    switch (this.kind) {
      case 'Whole': return 1;
      case 'Bit': return 1;
      case 'Slice': return this.hi0 - this.lo0 + 1;
    }
  }
  lo() {
    switch (this.kind) {
      case 'Whole': return 0;
      case 'Bit': return this.i;
      case 'Slice': return this.lo0;
    }
  }
  equals(o) {
    return this.kind === o.kind
      && (this.kind !== 'Bit' || this.i === o.i)
      && (this.kind !== 'Slice' || (this.lo0 === o.lo0 && this.hi0 === o.hi0));
  }
}

/** 連線的右側（訊號源）：常數，或 wire / chip IN pin 的整條或切片 */
export class Expr {
  /** { kind:'Const', v } | { kind:'Sig', name, range } */
  constructor(kind, ...args) {
    this.kind = kind;
    if (kind === 'Const') this.v = args[0];
    if (kind === 'Sig') [this.name, this.range] = args;
  }
  static const(v) { return new Expr('Const', v); }
  static sig(name, range) { return new Expr('Sig', name, range); }
  equals(o) {
    if (this.kind !== o.kind) return false;
    if (this.kind === 'Const') return this.v === o.v;
    return this.name === o.name && this.range.equals(o.range);
  }
}

/** 一條 `pin=expr` 連線 */
export class PinConn {
  constructor(pin, pinRange, src) {
    this.pin = pin;
    this.pinRange = pinRange;
    this.src = src;
  }
}

/** 一個子晶片實例（子晶片名稱 == 實例標籤） */
export class Part {
  constructor(chip, conns) {
    this.chip = chip; // 例如 ARegister、Mux16
    this.conns = conns;
  }
}

/** 一個晶片 */
export class Chip {
  constructor(name, inPins, outPins, parts) {
    this.name = name;
    this.inPins = inPins;   // [{name, width}]
    this.outPins = outPins;
    this.parts = parts;
  }
  pinWidth(name) {
    return this.inPins
      .concat(this.outPins)
      .find((p) => p.name === name)?.width;
  }
}

/** 帶行列資訊的語法錯誤 */
export class ParseError extends Error {
  constructor(line, col, msg) {
    super(`${line}:${col}: ${msg}`);
    this.line = line;
    this.col = col;
    this.msg = msg;
  }
}