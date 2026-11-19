// Jack → VM 編譯器（對應 _eda/jack2vm，oracle＝11/c/jack2vm.c，byte 相容）

const KEYWORDS = [
  'class', 'method', 'function', 'constructor', 'int', 'boolean',
  'char', 'void', 'var', 'static', 'field', 'let', 'do', 'if',
  'else', 'while', 'return', 'true', 'false', 'null', 'this',
];

const TOK = {
  KEYWORD: 'KEYWORD', SYM: 'SYM', NUM: 'NUM', STR: 'STR', ID: 'ID', EOF: 'EOF',
};

function Lex(src) {
  this.tokens = [];
  this.idx = 0;
  tokenize(this, src);
}

// 去掉註解（// 與 /* */），與 C 版一致：先整份處理再 tokenize
function removeComments(source) {
  let out = '';
  let i = 0;
  let inMulti = false;
  while (i < source.length) {
    if (inMulti) {
      if (source[i] === '*' && source[i + 1] === '/') {
        inMulti = false;
        i += 2;
      } else {
        i += 1;
      }
    } else if (source[i] === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (source[i] === '/' && source[i + 1] === '*') {
      inMulti = true;
      i += 2;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

function tokenize(lex, clean) {
  const symbols = '{}()[].,;+-*/&|<>=~';
  let p = 0;
  while (p < clean.length) {
    const c = clean[p];
    if (/\s/.test(c)) { p += 1; continue; }
    const t = { type: null, value: '', int_val: 0 };
    if (symbols.includes(c)) {
      t.type = TOK.SYM;
      t.value = c;
      p += 1;
    } else if (c === '"') {
      t.type = TOK.STR;
      p += 1;
      let v = '';
      while (p < clean.length && clean[p] !== '"') v += clean[p++];
      t.value = v;
      if (clean[p] === '"') p += 1;
    } else if (/\d/.test(c)) {
      t.type = TOK.NUM;
      let v = '';
      while (p < clean.length && /\d/.test(clean[p])) v += clean[p++];
      t.value = v;
      t.int_val = parseInt(v, 10);
    } else if (/[a-zA-Z_]/.test(c)) {
      let v = '';
      while (p < clean.length && /[a-zA-Z0-9_]/.test(clean[p])) v += clean[p++];
      t.value = v;
      t.type = KEYWORDS.includes(v) ? TOK.KEYWORD : TOK.ID;
    } else {
      p += 1; // 忽略未知字元
      continue;
    }
    lex.tokens.push(t);
  }
  lex.tokens.push({ type: TOK.EOF, value: '', int_val: 0 });
}

Lex.prototype.advance = function () {
  if (this.idx < this.tokens.length) return this.tokens[this.idx++];
  return this.tokens[this.tokens.length - 1];
};
Lex.prototype.peek = function () {
  if (this.idx < this.tokens.length) return this.tokens[this.idx];
  return this.tokens[this.tokens.length - 1];
};

const SK = { STATIC: 0, FIELD: 1, ARG: 2, VAR: 3 };
const KIND_MAP = ['static', 'this', 'argument', 'local'];

function SymbolTable() {
  this.classSymbols = [];
  this.subroutineSymbols = [];
  this.indexStatic = 0;
  this.indexField = 0;
  SymbolTable.prototype.startSubroutine.call(this);
}
SymbolTable.prototype.startSubroutine = function () {
  this.subroutineSymbols = [];
  this.indexArg = 0;
  this.indexVar = 0;
};
SymbolTable.prototype.define = function (name, type, kind) {
  const s = { name, type, kind, index: 0 };
  if (kind === SK.STATIC || kind === SK.FIELD) {
    s.index = kind === SK.STATIC ? this.indexStatic++ : this.indexField++;
    this.classSymbols.push(s);
  } else {
    s.index = kind === SK.ARG ? this.indexArg++ : this.indexVar++;
    this.subroutineSymbols.push(s);
  }
};
SymbolTable.prototype.varCount = function (kind) {
  const list = kind === SK.STATIC || kind === SK.FIELD ? this.classSymbols : this.subroutineSymbols;
  return list.filter((s) => s.kind === kind).length;
};
SymbolTable.prototype.lookup = function (name) {
  return this.subroutineSymbols.find((s) => s.name === name)
    || this.classSymbols.find((s) => s.name === name)
    || null;
};

const ERROR = (msg) => {
  throw new Error(`Compiler Error: ${msg}`);
};

/** 編譯單一 class 原始碼 → vm 指令行陣列（byte 相容 11/c/jack2vm.c） */
export function compileJack(src) {
  const lex = new Lex(removeComments(src));
  const symbols = new SymbolTable();
  const out = [];
  const state = { currentClass: '', labelCounter: 0 };

  const t = {};
  t.require = (type, value) => {
    const tok = lex.advance();
    if (tok.type !== type || (value !== null && tok.value !== value)) {
      ERROR(`Expected '${value ?? 'token'}', but got '${tok.value}'`);
    }
    return tok;
  };
  const isTok = (type, value) => {
    const tok = lex.peek();
    return tok.type === type && (value === null || tok.value === value);
  };
  const isKw = (kw) => isTok(TOK.KEYWORD, kw);
  const isSym = (c) => isTok(TOK.SYM, c);
  const isAnySym = (syms) => {
    const tok = lex.peek();
    return tok.type === TOK.SYM && syms.includes(tok.value[0]);
  };
  const isType = () => isTok(TOK.ID, null) || isKw('int') || isKw('char') || isKw('boolean');
  const isAnyKw = (...kws) => kws.some((k) => isKw(k));

  const W = {
    push: (seg, i) => out.push(`push ${seg} ${i}`),
    pop: (seg, i) => out.push(`pop ${seg} ${i}`),
    arith: (c) => out.push(c),
    label: (l) => out.push(`label ${l}`),
    goto: (l) => out.push(`goto ${l}`),
    ifgoto: (l) => out.push(`if-goto ${l}`),
    call: (n, a) => out.push(`call ${n} ${a}`),
    func: (n, l) => out.push(`function ${n} ${l}`),
    ret: () => out.push('return'),
  };

  const pushVar = (name) => {
    const s = symbols.lookup(name);
    if (!s) ERROR(`Undefined variable: ${name}`);
    W.push(KIND_MAP[s.kind], s.index);
  };
  const popVar = (name) => {
    const s = symbols.lookup(name);
    if (!s) ERROR(`Undefined variable: ${name}`);
    W.pop(KIND_MAP[s.kind], s.index);
  };

  const compileExpression = () => {
    compileTerm();
    while (isAnySym('+-*/&|<>=.')) {
      const op = lex.advance();
      compileTerm();
      switch (op.value[0]) {
        case '+': W.arith('add'); break;
        case '-': W.arith('sub'); break;
        case '*': W.call('Math.multiply', 2); break;
        case '/': W.call('Math.divide', 2); break;
        case '&': W.arith('and'); break;
        case '|': W.arith('or'); break;
        case '<': W.arith('lt'); break;
        case '>': W.arith('gt'); break;
        case '=': W.arith('eq'); break;
      }
    }
  };

  const compileTerm = () => {
    const t0 = lex.peek();
    if (t0.type === TOK.NUM) {
      W.push('constant', t0.int_val);
      lex.advance();
    } else if (t0.type === TOK.STR) {
      const len = t0.value.length;
      W.push('constant', len);
      W.call('String.new', 1);
      for (let i = 0; i < len; i++) {
        W.push('constant', t0.value.charCodeAt(i));
        W.call('String.appendChar', 2);
      }
      lex.advance();
    } else if (t0.type === TOK.KEYWORD) {
      if (t0.value === 'true') {
        W.push('constant', 0);
        W.arith('not');
      } else if (t0.value === 'false' || t0.value === 'null') {
        W.push('constant', 0);
      } else if (t0.value === 'this') {
        W.push('pointer', 0);
      }
      lex.advance();
    } else if (isSym('(')) {
      lex.advance();
      compileExpression();
      t.require(TOK.SYM, ')');
    } else if (isAnySym('-~')) {
      const op = t0.value[0];
      lex.advance();
      compileTerm();
      if (op === '-') W.arith('neg');
      else W.arith('not');
    } else if (t0.type === TOK.ID) {
      const name = t0.value;
      lex.advance();
      if (isSym('[')) {
        pushVar(name);
        lex.advance();
        compileExpression();
        t.require(TOK.SYM, ']');
        W.arith('add');
        W.pop('pointer', 1);
        W.push('that', 0);
      } else if (isSym('(') || isSym('.')) {
        let funcName;
        let nArgs = 0;
        if (isSym('.')) {
          lex.advance();
          const subName = t.require(TOK.ID, null);
          const s = symbols.lookup(name);
          if (s) {
            pushVar(name);
            funcName = `${s.type}.${subName.value}`;
            nArgs = 1;
          } else {
            funcName = `${name}.${subName.value}`;
          }
        } else {
          W.push('pointer', 0);
          funcName = `${state.currentClass}.${name}`;
          nArgs = 1;
        }
        t.require(TOK.SYM, '(');
        nArgs += compileExpressionList();
        t.require(TOK.SYM, ')');
        W.call(funcName, nArgs);
      } else {
        pushVar(name);
      }
    } else {
      ERROR('Invalid term');
    }
  };

  const compileExpressionList = () => {
    let count = 0;
    if (!isSym(')')) {
      compileExpression();
      count = 1;
      while (isSym(',')) {
        lex.advance();
        compileExpression();
        count += 1;
      }
    }
    return count;
  };

  const compileReturn = () => {
    lex.advance(); // 'return'
    if (!isSym(';')) {
      compileExpression();
    } else {
      W.push('constant', 0);
    }
    t.require(TOK.SYM, ';');
    W.ret();
  };

  const compileDo = () => {
    lex.advance(); // 'do'
    compileTerm();
    W.pop('temp', 0);
    t.require(TOK.SYM, ';');
  };

  const compileLet = () => {
    lex.advance(); // 'let'
    const varName = t.require(TOK.ID, null);
    let isArray = false;
    if (isSym('[')) {
      isArray = true;
      pushVar(varName.value);
      lex.advance();
      compileExpression();
      t.require(TOK.SYM, ']');
      W.arith('add');
    }
    t.require(TOK.SYM, '=');
    compileExpression();
    t.require(TOK.SYM, ';');
    if (isArray) {
      W.pop('temp', 1);
      W.pop('pointer', 1);
      W.push('temp', 1);
      W.pop('that', 0);
    } else {
      popVar(varName.value);
    }
  };

  const compileWhile = () => {
    const top = `WHILE_EXP${state.labelCounter++}`;
    const end = `WHILE_END${state.labelCounter++}`;
    W.label(top);
    lex.advance(); // 'while'
    t.require(TOK.SYM, '(');
    compileExpression();
    t.require(TOK.SYM, ')');
    W.arith('not');
    W.ifgoto(end);
    t.require(TOK.SYM, '{');
    compileStatements();
    t.require(TOK.SYM, '}');
    W.goto(top);
    W.label(end);
  };

  const compileIf = () => {
    const lElse = `IF_FALSE${state.labelCounter++}`;
    const lEnd = `IF_END${state.labelCounter++}`;
    lex.advance(); // 'if'
    t.require(TOK.SYM, '(');
    compileExpression();
    t.require(TOK.SYM, ')');
    W.arith('not');
    W.ifgoto(lElse);
    t.require(TOK.SYM, '{');
    compileStatements();
    t.require(TOK.SYM, '}');
    const hasElse = isKw('else');
    if (hasElse) W.goto(lEnd);
    W.label(lElse);
    if (hasElse) {
      lex.advance(); // 'else'
      t.require(TOK.SYM, '{');
      compileStatements();
      t.require(TOK.SYM, '}');
      W.label(lEnd);
    }
  };

  const compileStatements = () => {
    for (;;) {
      const tok = lex.peek();
      if (tok.type !== TOK.KEYWORD) break;
      if (tok.value === 'let') compileLet();
      else if (tok.value === 'if') compileIf();
      else if (tok.value === 'while') compileWhile();
      else if (tok.value === 'do') compileDo();
      else if (tok.value === 'return') compileReturn();
      else break;
    }
  };

  const compileVarDec = () => {
    lex.advance(); // 'var'
    const type = lex.advance();
    do {
      const name = t.require(TOK.ID, null);
      symbols.define(name.value, type.value, SK.VAR);
    } while (isSym(',') && (lex.advance(), true));
    t.require(TOK.SYM, ';');
  };

  const compileParameterList = () => {
    if (isType()) {
      do {
        const type = lex.advance();
        const name = t.require(TOK.ID, null);
        symbols.define(name.value, type.value, SK.ARG);
      } while (isSym(',') && (lex.advance(), true));
    }
  };

  const compileSubroutine = () => {
    const kind = lex.advance(); // constructor | function | method
    lex.advance(); // 回傳類型
    const name = t.require(TOK.ID, null);

    symbols.startSubroutine();
    if (kind.value === 'method') {
      symbols.define('this', state.currentClass, SK.ARG);
    }
    t.require(TOK.SYM, '(');
    compileParameterList();
    t.require(TOK.SYM, ')');

    t.require(TOK.SYM, '{');
    while (isKw('var')) compileVarDec();

    const funcName = `${state.currentClass}.${name.value}`;
    const nLocals = symbols.varCount(SK.VAR);
    W.func(funcName, nLocals);

    if (kind.value === 'constructor') {
      const nFields = symbols.varCount(SK.FIELD);
      W.push('constant', nFields);
      W.call('Memory.alloc', 1);
      W.pop('pointer', 0);
    } else if (kind.value === 'method') {
      W.push('argument', 0);
      W.pop('pointer', 0);
    }

    compileStatements();
    t.require(TOK.SYM, '}');
  };

  const compileClassVarDec = () => {
    const kindTok = lex.advance(); // static | field
    const kind = kindTok.value === 'static' ? SK.STATIC : SK.FIELD;
    const type = lex.advance();
    do {
      const name = t.require(TOK.ID, null);
      symbols.define(name.value, type.value, kind);
    } while (isSym(',') && (lex.advance(), true));
    t.require(TOK.SYM, ';');
  };

  const compileClass = () => {
    t.require(TOK.KEYWORD, 'class');
    const className = t.require(TOK.ID, null);
    state.currentClass = className.value;
    t.require(TOK.SYM, '{');
    while (isAnyKw('static', 'field')) compileClassVarDec();
    while (isAnyKw('constructor', 'function', 'method')) compileSubroutine();
    t.require(TOK.SYM, '}');
  };

  compileClass();
  return out;
}