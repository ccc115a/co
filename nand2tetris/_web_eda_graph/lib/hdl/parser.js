// HackHDL 的 lexer + recursive descent parser（對應 _eda/hackhdl/src/parser.rs）
import { Chip, Expr, ParseError, PinConn, Part, Range } from './ast.js';

const Tok = {
  Ident: (s) => ({ t: 'Ident', s }),
  Num: (n) => ({ t: 'Num', n }),
  LBrace: { t: 'LBrace' },
  RBrace: { t: 'RBrace' },
  LBracket: { t: 'LBracket' },
  RBracket: { t: 'RBracket' },
  DotDot: { t: 'DotDot' },
  Assign: { t: 'Assign' },
  Comma: { t: 'Comma' },
  Semi: { t: 'Semi' },
  Colon: { t: 'Colon' },
  LParen: { t: 'LParen' },
  RParen: { t: 'RParen' },
};

function tokText(t) {
  if (!t) return 'EOF';
  switch (t.t) {
    case 'Ident': return t.s;
    case 'Num': return String(t.n);
    default: return t.t;
  }
}

function lex(src) {
  const toks = []; // token + line + col
  let i = 0;
  let line = 1;
  let col = 1;
  function bump(c) {
    i += 1;
    if (c === '\n') {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && i + 1 < src.length && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') bump(src[i]);
      continue;
    }
    if (c === '/' && i + 1 < src.length && src[i + 1] === '*') {
      const [l, c0] = [line, col];
      bump(src[i]);
      bump(src[i]);
      let closed = false;
      while (i < src.length) {
        if (src[i] === '*' && i + 1 < src.length && src[i + 1] === '/') {
          bump(src[i]);
          bump(src[i]);
          closed = true;
          break;
        }
        bump(src[i]);
      }
      if (!closed) throw new ParseError(l, c0, "註解沒有關閉 /* */");
      continue;
    }
    if (/\s/.test(c)) { bump(c); continue; }
    const single = { '{': Tok.LBrace, '}': Tok.RBrace, '[': Tok.LBracket, ']': Tok.RBracket, '=': Tok.Assign, ',': Tok.Comma, ';': Tok.Semi, ':': Tok.Colon, '(': Tok.LParen, ')': Tok.RParen };
    if (c in single) {
      toks.push([single[c], line, col]);
      bump(c);
      continue;
    }
    if (c === '.') {
      const [l, c0] = [line, col];
      if (i + 1 < src.length && src[i + 1] === '.') {
        toks.push([Tok.DotDot, line, col]);
        bump(c);
        bump(src[i]);
        continue;
      }
      throw new ParseError(l, c0, "單一個 . 不是合法 token");
    }
    if (/[0-9]/.test(c)) {
      const [l, c0] = [line, col];
      let s = '';
      while (i < src.length && /[0-9]/.test(src[i])) { s += src[i]; bump(src[i]); }
      const n = parseInt(s, 10);
      if (!Number.isFinite(n) || n > 0xffff) {
        throw new ParseError(l, c0, `數字 \`${s}\` 超出 16 bit 範圍`);
      }
      toks.push([Tok.Num(n), l, c0]);
      continue;
    }
    if (/[A-Za-z0-9_]/.test(c) || c === '-') {
      const [l, c0] = [line, col];
      let s = '';
      while (i < src.length && (/[A-Za-z0-9_]/.test(src[i]) || src[i] === '-')) { s += src[i]; bump(src[i]); }
      toks.push([Tok.Ident(s), l, c0]);
      continue;
    }
    throw new ParseError(line, col, `無法解析的字元 \`${c}\``);
  }
  return toks;
}

export class Parser {
  constructor(src) {
    this.toks = lex(src);
    this.pos = 0;
  }
  peek() { return this.toks[this.pos]; }
  next() {
    const t = this.toks[this.pos];
    if (t !== undefined) this.pos += 1;
    return t;
  }
  err(msg) {
    const t = this.toks[this.pos];
    const l = t ? t[1] : 1;
    const c = t ? t[2] : 1;
    return new ParseError(l, c, msg);
  }
  expectIdent(what) {
    const t = this.next();
    if (t && t[0].t === 'Ident') return t[0].s;
    return this.err(`預期 ${what}，但看到 ${tokText(t ? t[0] : null)}（${t ? t[1] : 0}:${t ? t[2] : 0}）`);
  }
  expect(kind, what) {
    const t = this.next();
    if (t && t[0].t === kind) return;
    return this.err(`預期 ${what}，但看到 ${tokText(t ? t[0] : null)}`);
  }

  parseChip() {
    const kw = this.expectIdent('CHIP');
    if (kw !== 'CHIP') return this.err(`預期 CHIP，但看到 \`${kw}\``);
    const name = this.expectIdent('晶片名稱');
    this.expect('LBrace', '{');
    let inPins = [];
    let outPins = [];
    for (;;) {
      const t = this.peek();
      if (!t) return this.err('遇到檔案結尾，缺少 }');
      const k = t[0];
      if (k.t === 'Ident' && k.s === 'IN') {
        this.next();
        inPins = this.parsePins();
      } else if (k.t === 'Ident' && k.s === 'OUT') {
        this.next();
        outPins = this.parsePins();
      } else if (k.t === 'Ident' && k.s === 'PARTS') {
        this.next();
        this.expect('Colon', ':');
        const parts = [];
        while (!(!this.peek() || this.peek()[0].t === 'RBrace')) {
          parts.push(this.parsePart());
        }
        this.expect('RBrace', '}');
        return new Chip(name, inPins, outPins, parts);
      } else if (k.t === 'RBrace') {
        this.next();
        return new Chip(name, inPins, outPins, []);
      } else {
        return this.err(`在 IN/OUT/PARTS 區段看到 \`${tokText(k)}\``);
      }
    }
  }

  parsePins() {
    const pins = [];
    for (;;) {
      const name = this.expectIdent('pin 名稱');
      let width = 1;
      const p = this.peek();
      if (p && p[0].t === 'LBracket') {
        this.next();
        const t = this.next();
        if (!t || t[0].t !== 'Num') return this.err('預期 bus 寬度數字');
        width = t[0].n;
        this.expect('RBracket', ']');
      }
      pins.push({ name, width });
      const q = this.peek();
      if (q && q[0].t === 'Comma') {
        this.next();
      } else if (q && q[0].t === 'Semi') {
        this.next();
        return pins;
      } else {
        return this.err('pin 清單要用 , 分隔、以 ; 結尾');
      }
    }
  }

  parsePart() {
    const chip = this.expectIdent('子晶片名稱');
    this.expect('LParen', '(');
    const conns = [];
    for (;;) {
      const [pin, pinRange] = this.parsePinRef();
      this.expect('Assign', '=');
      const src = this.parseExpr();
      conns.push(new PinConn(pin, pinRange, src));
      const p = this.peek();
      if (p && p[0].t === 'Comma') {
        this.next();
      } else {
        break;
      }
    }
    this.expect('RParen', ')');
    this.expect('Semi', ';');
    return new Part(chip, conns);
  }

  parsePinRef() {
    const name = this.expectIdent('pin 名稱');
    const range = this.parseOptRange();
    return [name, range];
  }

  parseOptRange() {
    const p = this.peek();
    if (!p || p[0].t !== 'LBracket') return Range.whole();
    this.next();
    const t = this.next();
    if (!t || t[0].t !== 'Num') return this.err('預期索引數字');
    const a = t[0].n;
    const q = this.peek();
    if (q && q[0].t === 'DotDot') {
      this.next();
      const u = this.next();
      if (!u || u[0].t !== 'Num') return this.err('預期範圍上限數字');
      const b = u[0].n;
      if (b < a) return this.err(`範圍 ${a}..${b} 的上限小於下限`);
      this.expect('RBracket', ']');
      return Range.slice(a, b);
    }
    this.expect('RBracket', ']');
    return Range.bit(a);
  }

  parseExpr() {
    const t = this.next();
    if (!t) return this.err('預期訊號源，但遇到檔案結尾');
    const k = t[0];
    if (k.t === 'Ident' && k.s === 'true') return Expr.const(true);
    if (k.t === 'Ident' && k.s === 'false') return Expr.const(false);
    if (k.t === 'Ident') {
      const range = this.parseOptRange();
      return Expr.sig(k.s, range);
    }
    return this.err(`訊號源不能是 \`${tokText(k)}\``);
  }
}

/** 解析 .hdl 原始碼 */
export function parseHdl(src) {
  return new Parser(src).parseChip();
}