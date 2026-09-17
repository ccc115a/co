// lib/cu2rv.js：自訂高階 kernel 語言 → riscvgpu 組語（純 ES module、零依賴）。
// compileKernel(src) → { asm }；錯誤一律 throw（含行號，第N行）。
//
// 語言（.ku 檔，見 kernels/*.ku）：C-like 大括號、顯式 int、分號結尾、# 註解。
//
//   lanes 4;                 通道數（1..8；riscvgpu 預設 4）
//   n 16;                    總元素數（grid-stride loop，不必被 lanes 整除）
//   mem x[16] = i + 1;       陣列（自動配置，0x100 起；初始式只可用 i／常數／param）
//   mem y[16] @ 0x140;       @ 手動覆寫位址（字對齊、堆疊區外、不重疊）
//   param a: int = 2;        純量常數
//   func axpy(a: int, xi: int, yi: int) -> int {   真實 call/ret（下述 ABI）
//     t: int = a * xi;
//     return t + yi;
//   }
//   kernel saxpy {           單一 kernel（SPMD，每通道跑同一份）
//     for (i: int = tid; i < n; i += ntid) {
//       z[i] = axpy(a, x[i], y[i]);
//     }
//     barrier();
//   }
//   expect {                 lane0 逐項檢查（a0=錯誤數，a7=10 結束）
//     z[i] = 2 * (i + 1) + 10 * (i + 1);
//   }
//
// 敘述：v: int = e; ｜ v = e; ｜ A[e] = e; ｜ f(args); ｜ print(e);
//       if (c) {} else {} ｜ for (i: int = a; i < b; i += s) {} ｜
//       while (c) {} ｜ break; ｜ continue; ｜ return e; ｜ barrier();
// 運算式：整數 + - * / % & | ^ << >>、比較 == != < <= > >=、一元 - ~ !、
//   常數／i／迴圈變數／tid／ntid／n／param／區域變數／A[e]／f(args)。
//   * 的一邊須為常數（硬體無 M 擴充，shift-add 展開）；/ % 只吃 2 的冪次常數；
//   變數相乘、浮點數一律報錯。&&／|| 請用巢狀 if。
// ABI（教學用）：a0–a3 傳參、a0 回傳；每通道私有堆疊 sp = 0x1000 - tid*128；
//   callee 存 ra＋自己寫入的 s-regs；caller spill 活著的 pool／a-home 暫存。
// print(e) 以 ecall(a7=1) 逐字印十進位（IDE／rvemu 可見；硬體上 ecall 會停機，
//   僅供除錯）。輸出只用 RV32I＋li＋tid/ntid/barrier，不用 M 擴充。

const BASE_REGS = ['t2', 't3', 't4', 's0', 's1']; // 每個 mem 一個基址（上限 5 個）
const HOME_REGS = ['s2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
  'a1', 'a2', 'a3', 'a4', 'a5']; // 具名變數家（上限 15 個並存）
const HARD_SCRATCH = ['t5', 't6', 'a6', 'a7']; // 運算式暫存（a7 只在 ecall 空窗期用）
const DMEM_DATA_END = 0xC00; // 資料區上限；0xC00..0xFFF 為 8 通道私有堆疊（各 128B）
const STACK_TOP = 0x1000;
const STACK_SHIFT = 7; // 每通道 128B = 1<<7
const IMEM_LIMIT = 200;

const RESERVED = new Set(['tid', 'ntid', 'n', 'int', 'if', 'else', 'for', 'while',
  'break', 'continue', 'return', 'barrier', 'print', 'lanes', 'mem', 'param',
  'func', 'kernel', 'expect']);

function err(line, msg) {
  throw new Error(`第${line}行：${msg}`);
}

// ---------- lexer ----------
function lex(src) {
  const toks = [];
  let i = 0, line = 1;
  const push = (t, v) => toks.push({ t, v, line });
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '"') err(line, '不支援字串常數');
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '<<', '>>', '+=', '-=', '->'].includes(two)) {
      push('sym', two); i += 2; continue;
    }
    if ('+-*/%&|^~!<>='.includes(c)) { push('sym', c); i++; continue; }
    if ('(){}[];,:@'.includes(c)) { push('sym', c); i++; continue; }
    let m = /^0[xX][0-9a-fA-F]+/.exec(src.slice(i));
    if (m) { push('num', Number(m[0])); i += m[0].length; continue; }
    m = /^\d+/.exec(src.slice(i));
    if (m) {
      if (src[i + m[0].length] === '.' && /\d/.test(src[i + m[0].length + 1] || '')) {
        err(line, `不支援浮點數（riscvgpu 無 F 擴充）：${m[0]}...`);
      }
      push('num', Number(m[0])); i += m[0].length; continue;
    }
    m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (m) { push('id', m[0]); i += m[0].length; continue; }
    if (c === '.') err(line, '不支援浮點數（riscvgpu 無 F 擴充）');
    err(line, `無法解析的字元：${c}`);
  }
  push('eof', '');
  return toks;
}

// ---------- parser ----------
function parseKu(src) {
  const toks = lex(src);
  let pos = 0;
  const peek = (k = 0) => toks[pos + k];
  const next = () => toks[pos++];
  const at = (t, v) => peek().t === t && (v === undefined || peek().v === v);
  const eat = (t, v) => {
    const tk = peek();
    if (tk.t !== t || (v !== undefined && tk.v !== v)) {
      err(tk.line, `語法錯誤：此處須為「${v !== undefined ? v : t}」，實為「${tk.v}」`);
    }
    pos++;
    return tk;
  };
  const eatId = (what) => {
    const tk = peek();
    if (tk.t !== 'id') err(tk.line, `語法錯誤：此處須為${what}`);
    pos++;
    return tk;
  };

  function parseExpr() { return parseEq(); }
  function parseEq() {
    let x = parseRel();
    while (at('sym') && (peek().v === '==' || peek().v === '!=')) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseRel(), line: x.line };
    }
    return x;
  }
  function parseRel() {
    let x = parseShift();
    while (at('sym') && ['<', '<=', '>', '>='].includes(peek().v)) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseShift(), line: x.line };
    }
    return x;
  }
  function parseShift() {
    let x = parseAdd();
    while (at('sym') && (peek().v === '<<' || peek().v === '>>')) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseAdd(), line: x.line };
    }
    return x;
  }
  function parseAdd() {
    let x = parseMul();
    while (at('sym') && (peek().v === '+' || peek().v === '-' || peek().v === '&' || peek().v === '|' || peek().v === '^')) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseMul(), line: x.line };
    }
    return x;
  }
  function parseMul() {
    let x = parseUnary();
    while (at('sym') && (peek().v === '*' || peek().v === '/' || peek().v === '%')) {
      const op = next().v;
      x = { k: 'bin', op, x, y: parseUnary(), line: x.line };
    }
    return x;
  }
  function parseUnary() {
    const tk = peek();
    if (tk.t === 'sym' && (tk.v === '-' || tk.v === '~' || tk.v === '!')) {
      next();
      return { k: 'un', op: tk.v, x: parseUnary(), line: tk.line };
    }
    return parsePostfix();
  }
  function parsePostfix() {
    const tk = peek();
    if (tk.t === 'num') { next(); return { k: 'num', v: tk.v, line: tk.line }; }
    if (tk.t === 'id' && (tk.v === 'tid' || tk.v === 'ntid' || tk.v === 'n')) {
      next(); return { k: 'sys', n: tk.v, line: tk.line };
    }
    if (tk.t === 'id') {
      next();
      if (at('sym', '(')) {
        next();
        const args = [];
        if (!at('sym', ')')) {
          args.push(parseExpr());
          while (at('sym', ',')) { next(); args.push(parseExpr()); }
        }
        eat('sym', ')');
        return { k: 'call', f: tk.v, args, line: tk.line };
      }
      if (at('sym', '[')) {
        next();
        const idx = parseExpr();
        eat('sym', ']');
        return { k: 'load', m: tk.v, idx, line: tk.line };
      }
      return { k: 'name', n: tk.v, line: tk.line };
    }
    if (at('sym', '(')) {
      next();
      const x = parseExpr();
      eat('sym', ')');
      return x;
    }
    err(tk.line, `運算式無法解析（多出「${tk.v}」）`);
  }

  function parseBlock() {
    eat('sym', '{');
    const stmts = [];
    while (!at('sym', '}')) {
      if (at('eof')) err(peek().line, '缺少 }');
      stmts.push(parseStmt());
    }
    eat('sym', '}');
    return stmts;
  }

  function parseStmt() {
    const tk = peek();
    if (tk.t !== 'id') err(tk.line, `敘述須以關鍵字或變數開頭（多出「${tk.v}」）`);
    const kw = tk.v;
    if (kw === 'return') {
      next();
      const x = parseExpr();
      eat('sym', ';');
      return { k: 'return', x, line: tk.line };
    }
    if (kw === 'if') {
      next();
      eat('sym', '(');
      const c = parseExpr();
      eat('sym', ')');
      const t = parseBlock();
      let e = null;
      if (at('id', 'else')) { next(); e = parseBlock(); }
      return { k: 'if', c, t, e, line: tk.line };
    }
    if (kw === 'while') {
      next();
      eat('sym', '(');
      const c = parseExpr();
      eat('sym', ')');
      const b = parseBlock();
      return { k: 'while', c, b, line: tk.line };
    }
    if (kw === 'for') {
      next();
      eat('sym', '(');
      const vn = eatId('迴圈變數').v;
      eat('sym', ':');
      const ty = eatId('型別').v;
      if (ty !== 'int') err(tk.line, `只支援 int 型別：${ty}`);
      eat('sym', '=');
      const init = parseExpr();
      eat('sym', ';');
      const cond = parseExpr();
      eat('sym', ';');
      const sv = eatId('迴圈變數').v;
      if (sv !== vn) err(tk.line, `for 步進變數須與迴圈變數一致：${vn}／${sv}`);
      const sop = eat('sym').v;
      if (sop !== '+=' && sop !== '-=') err(tk.line, `for 步進只支援 +=／-=：${sop}`);
      const step = parseExpr();
      eat('sym', ')');
      const b = parseBlock();
      return { k: 'for', vn, init, cond, sop, step, b, line: tk.line };
    }
    if (kw === 'break' || kw === 'continue') {
      next();
      eat('sym', ';');
      return { k: kw, line: tk.line };
    }
    if (kw === 'barrier' || kw === 'print') {
      next();
      eat('sym', '(');
      const args = [];
      if (kw === 'print') args.push(parseExpr());
      eat('sym', ')');
      eat('sym', ';');
      return { k: kw, args, line: tk.line };
    }
    next();
    if (at('sym', ':')) {
      next();
      const ty = eatId('型別').v;
      if (ty !== 'int') err(tk.line, `只支援 int 型別：${ty}`);
      eat('sym', '=');
      const x = parseExpr();
      eat('sym', ';');
      return { k: 'decl', n: kw, x, line: tk.line };
    }
    if (at('sym', '=')) {
      next();
      const x = parseExpr();
      eat('sym', ';');
      return { k: 'assign', n: kw, x, line: tk.line };
    }
    if (at('sym', '[')) {
      next();
      const idx = parseExpr();
      eat('sym', ']');
      eat('sym', '=');
      const x = parseExpr();
      eat('sym', ';');
      return { k: 'store', m: kw, idx, x, line: tk.line };
    }
    if (at('sym', '(')) {
      next();
      const args = [];
      if (!at('sym', ')')) {
        args.push(parseExpr());
        while (at('sym', ',')) { next(); args.push(parseExpr()); }
      }
      eat('sym', ')');
      eat('sym', ';');
      return { k: 'callstmt', f: kw, args, line: tk.line };
    }
    err(tk.line, `無法解析的敘述：${kw} …`);
  }

  // constExpr：支援一元負號的常數運算式（param 值、mem 位址用）
  function parseConstExpr() {
    const x = parseExpr();
    return x;
  }

  const prog = { lanes: 0, n: 0, mems: [], params: [], funcs: [], kernel: null, expect: null };
  const seenHead = {};
  const memNames = new Set();
  const paramNames = new Set();
  const funcNames = new Set();
  while (!at('eof')) {
    const tk = peek();
    if (tk.t !== 'id') err(tk.line, `頂層須為 lanes／n／mem／param／func／kernel／expect（多出「${tk.v}」）`);
    if (tk.v === 'lanes' || tk.v === 'n') {
      if (seenHead[tk.v]) err(tk.line, `${tk.v} 重複定義`);
      seenHead[tk.v] = true;
      next();
      const v = eat('num');
      if (!Number.isInteger(v.v) || v.v < 1) err(tk.line, `${tk.v} 須為正整數`);
      prog[tk.v] = v.v;
      eat('sym', ';');
      continue;
    }
    if (tk.v === 'mem') {
      next();
      const name = eatId('陣列名').v;
      if (memNames.has(name)) err(tk.line, `mem 重複定義：${name}`);
      if (RESERVED.has(name)) err(tk.line, `mem 名稱保留：${name}`);
      memNames.add(name);
      eat('sym', '[');
      const len = parseConstExpr();
      eat('sym', ']');
      let addr = null;
      if (at('sym', '@')) {
        next();
        addr = parseConstExpr();
      }
      let init = null;
      if (at('sym', '=')) {
        next();
        init = parseExpr();
      }
      eat('sym', ';');
      prog.mems.push({ name, len, addr, init, line: tk.line });
      continue;
    }
    if (tk.v === 'param') {
      next();
      const name = eatId('參數名').v;
      if (paramNames.has(name) || memNames.has(name)) err(tk.line, `param 名稱衝突：${name}`);
      if (RESERVED.has(name)) err(tk.line, `param 名稱保留：${name}`);
      paramNames.add(name);
      eat('sym', ':');
      const ty = eatId('型別').v;
      if (ty !== 'int') err(tk.line, `只支援 int 型別：${ty}`);
      eat('sym', '=');
      const v = parseConstExpr();
      eat('sym', ';');
      prog.params.push({ name, v, line: tk.line });
      continue;
    }
    if (tk.v === 'func') {
      next();
      const name = eatId('函式名').v;
      if (funcNames.has(name)) err(tk.line, `func 重複定義：${name}`);
      if (RESERVED.has(name)) err(tk.line, `func 名稱保留：${name}`);
      funcNames.add(name);
      eat('sym', '(');
      const fparams = [];
      if (!at('sym', ')')) {
        for (;;) {
          const pn = eatId('參數名').v;
          if (RESERVED.has(pn)) err(tk.line, `參數名稱保留：${pn}`);
          eat('sym', ':');
          const ty = eatId('型別').v;
          if (ty !== 'int') err(tk.line, `只支援 int 型別：${ty}`);
          fparams.push(pn);
          if (at('sym', ',')) { next(); continue; }
          break;
        }
      }
      eat('sym', ')');
      eat('sym', '->');
      const rt = eatId('回傳型別').v;
      if (rt !== 'int') err(tk.line, `只支援 int 回傳：${rt}`);
      const body = parseBlock();
      if (fparams.length > 4) err(tk.line, `參數太多（上限 4 個）：${name}`);
      if (new Set(fparams).size !== fparams.length) err(tk.line, `參數重名：${name}`);
      prog.funcs.push({ name, fparams, body, line: tk.line });
      continue;
    }
    if (tk.v === 'kernel') {
      if (prog.kernel) err(tk.line, '只支援一個 kernel');
      next();
      const name = eatId('kernel 名').v;
      const body = parseBlock();
      prog.kernel = { name, body, line: tk.line };
      continue;
    }
    if (tk.v === 'expect') {
      if (prog.expect) err(tk.line, '只支援一個 expect 段');
      next();
      const body = parseBlock();
      prog.expect = { body, line: tk.line };
      continue;
    }
    err(tk.line, `頂層關鍵字錯誤：${tk.v}`);
  }
  if (!seenHead.lanes) throw new Error('缺少 lanes 定義');
  if (!seenHead.n) throw new Error('缺少 n 定義');
  if (prog.lanes < 1 || prog.lanes > 8) throw new Error(`lanes 須為 1..8：${prog.lanes}`);
  if (prog.mems.length === 0) throw new Error('至少宣告一個 mem');
  if (prog.mems.length > BASE_REGS.length) throw new Error(`mem 太多（上限 ${BASE_REGS.length} 個）`);
  if (!prog.kernel) throw new Error('缺少 kernel 段');
  return prog;
}

// 常數折疊：純常數回傳數值，否則 null。env：{params, n}。
function constVal(node, env) {
  switch (node.k) {
    case 'num': return node.v;
    case 'sys': return node.n === 'n' ? env.n : null;
    case 'name': return (node.n in env.params) ? env.params[node.n] : null;
    case 'un': {
      const v = constVal(node.x, env);
      if (v === null) return null;
      if (node.op === '-') return -v;
      if (node.op === '~') return ~v;
      return v === 0 ? 1 : 0;
    }
    case 'bin': {
      const a = constVal(node.x, env), b = constVal(node.y, env);
      if (a === null || b === null) return null;
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
        case '<': return a < b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        default: return null;
      }
    }
    default: return null;
  }
}

function isPow2(v) {
  return Number.isInteger(v) && v > 0 && (v & (v - 1)) === 0;
}
function log2int(v) {
  let k = 0;
  while ((1 << k) < v) k++;
  return k;
}

// ---------- 語意驗證＋記憶體配置 ----------
// 回傳 {mems[{name,len,addr,init}], paramRegs{name:reg}, funcMap, env}
function check(prog) {
  const env = { n: prog.n, params: {} };
  // param 值（常數運算式，可引用先前的 param）
  for (const p of prog.params) {
    const v = constVal(p.v, env);
    if (v === null || !Number.isInteger(v)) err(p.line, `param 須為常數運算式：${p.name}`);
    if (v < -0x80000000 || v > 0xffffffff) err(p.line, `param 超出 32 位範圍：${p.name}`);
    env.params[p.name] = v | 0;
  }
  const mems = prog.mems.map((m) => {
    const len = constVal(m.len, env);
    if (len === null || !Number.isInteger(len) || len < 1) err(m.line, `mem 長度須為正整數常數：${m.name}`);
    let addr = null;
    if (m.addr !== null) {
      const a = constVal(m.addr, env);
      if (a === null || !Number.isInteger(a) || a < 0) err(m.line, `mem 位址須為非負整數常數：${m.name}`);
      if (a % 4 !== 0) err(m.line, `mem 位址須字對齊：${m.name}`);
      addr = a;
    }
    return { name: m.name, len, addr, init: m.init, line: m.line };
  });
  let cursor = 0x100;
  for (const m of mems) {
    if (m.addr === null) {
      m.addr = cursor;
      cursor += m.len * 4;
    }
  }
  for (const m of mems) {
    if (m.addr + m.len * 4 > DMEM_DATA_END) {
      err(m.line, `mem ${m.name} 超出資料區（0x100..0x${DMEM_DATA_END.toString(16)}，上方為堆疊保留）`);
    }
  }
  const ranges = mems.map(m => [m.addr, m.addr + m.len * 4, m.name]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] < ranges[i - 1][1]) {
      err(prog.mems.find(m => m.name === ranges[i][2]).line, `mem ${ranges[i][2]} 與 mem ${ranges[i - 1][2]} 位址重疊`);
    }
  }
  const memSet = new Set(mems.map(m => m.name));
  const funcMap = new Map(prog.funcs.map(f => [f.name, f]));

  // home 預配（只計並存量；codegen 重建相同配置）
  const freeHomes = [...HOME_REGS];
  const active = new Map();
  const scopeStack = [[]];
  const allocHome = (name, line) => {
    if (RESERVED.has(name)) err(line, `名稱保留：${name}`);
    const cur = scopeStack[scopeStack.length - 1];
    if (cur.some((e) => e.name === name)) err(line, `變數重複定義：${name}`);
    if (freeHomes.length === 0) err(line, `變數太多（上限 ${HOME_REGS.length} 個並存具名變數）`);
    const reg = freeHomes.shift();
    cur.push({ name, prev: active.has(name) ? active.get(name) : undefined });
    active.set(name, reg);
    return reg;
  };
  const pushScope = () => scopeStack.push([]);
  const freeScope = () => {
    for (const { name, prev } of scopeStack.pop()) {
      freeHomes.unshift(active.get(name));
      if (prev === undefined) active.delete(name);
      else active.set(name, prev);
    }
  };

  function checkExpr(node, o) {
    switch (node.k) {
      case 'num':
        if (!Number.isInteger(node.v) || node.v < -0x80000000 || node.v > 0xffffffff) {
          err(node.line, `常數超出 32 位範圍：${node.v}`);
        }
        return;
      case 'sys': return;
      case 'name':
        if (o.allowI && node.n === 'i') return;
        if (!(node.n in env.params) && !active.has(node.n)) err(node.line, `未定義的變數：${node.n}`);
        return;
      case 'load':
        if (!o.allowLoad) err(node.line, `${o.pure}段不可讀 mem`);
        if (!memSet.has(node.m)) err(node.line, `未宣告的 mem：${node.m}`);
        checkExpr(node.idx, o);
        return;
      case 'un':
        checkExpr(node.x, o);
        return;
      case 'bin': {
        checkExpr(node.x, o);
        checkExpr(node.y, o);
        if (node.op === '*') {
          const a = constVal(node.x, env), b = constVal(node.y, env);
          if (a === null && b === null) {
            err(node.line, '變數相乘需 M 擴充，硬體不支援（* 的一邊須為常數或 param）');
          }
        }
        if (node.op === '/' || node.op === '%') {
          const d = constVal(node.y, env);
          if (d === null || !isPow2(d)) {
            err(node.line, '整數除法只支援 2 的冪次常數除數（硬體無除法器）');
          }
        }
        if (node.op === '&&' || node.op === '||') err(node.line, '不支援 &&／||，請用巢狀 if');
        return;
      }
      case 'call': {
        if (!o.allowCall) err(node.line, `${o.pure}段不可呼叫函式`);
        const f = funcMap.get(node.f);
        if (!f) err(node.line, `未定義的函式：${node.f}`);
        if (node.args.length !== f.fparams.length) {
          err(node.line, `${node.f} 參數數量錯誤（要 ${f.fparams.length} 個，得 ${node.args.length} 個）`);
        }
        for (const a of node.args) checkExpr(a, o);
        return;
      }
    }
  }

  function checkStmts(stmts, s) {
    for (const st of stmts) checkStmt(st, s);
  }
  function checkStmt(st, s) {
    switch (st.k) {
      case 'decl':
        if (memSet.has(st.n) || funcMap.has(st.n)) err(st.line, `名稱衝突：${st.n}`);
        allocHome(st.n, st.line);
        checkExpr(st.x, { allowLoad: true, allowCall: true });
        return;
      case 'assign':
        if (!(st.n in env.params) && !active.has(st.n)) err(st.line, `未定義的變數：${st.n}`);
        checkExpr(st.x, { allowLoad: true, allowCall: true });
        return;
      case 'store':
        if (!memSet.has(st.m)) err(st.line, `未宣告的 mem：${st.m}`);
        checkExpr(st.idx, { allowLoad: true, allowCall: true });
        checkExpr(st.x, { allowLoad: true, allowCall: true });
        return;
      case 'callstmt': {
        const f = funcMap.get(st.f);
        if (!f) err(st.line, `未定義的函式：${st.f}`);
        if (st.args.length !== f.fparams.length) {
          err(st.line, `${st.f} 參數數量錯誤（要 ${f.fparams.length} 個，得 ${st.args.length} 個）`);
        }
        for (const a of st.args) checkExpr(a, { allowLoad: true, allowCall: true });
        return;
      }
      case 'print':
        checkExpr(st.args[0], { allowLoad: true, allowCall: true });
        return;
      case 'barrier':
        if (s.inExpect) err(st.line, 'expect 段不可用 barrier（僅 lane0 執行，會永等）');
        return;
      case 'return':
        if (!s.inFunc) err(st.line, 'return 只可出現在 func 內');
        checkExpr(st.x, { allowLoad: true, allowCall: true });
        s.hasReturn = true;
        return;
      case 'break': case 'continue':
        if (s.loopDepth === 0) err(st.line, `${st.k} 只可出現在迴圈內`);
        return;
      case 'if':
        checkExpr(st.c, { allowLoad: true, allowCall: true });
        pushScope(); checkStmts(st.t, s); freeScope();
        if (st.e) { pushScope(); checkStmts(st.e, s); freeScope(); }
        return;
      case 'while':
        checkExpr(st.c, { allowLoad: true, allowCall: true });
        s.loopDepth++;
        pushScope(); checkStmts(st.b, s); freeScope();
        s.loopDepth--;
        return;
      case 'for': {
        checkExpr(st.init, { allowLoad: true, allowCall: true });
        s.loopDepth++;
        pushScope();
        if (memSet.has(st.vn) || funcMap.has(st.vn)) {
          err(st.line, `迴圈變數名稱衝突：${st.vn}`);
        }
        // 允許遮蔽外層 param／變數（標準 shadowing；mem／func 名仍禁）
        allocHome(st.vn, st.line);
        checkExpr(st.cond, { allowLoad: true, allowCall: true });
        checkExpr(st.step, { allowLoad: true, allowCall: true });
        checkStmts(st.b, s);
        freeScope();
        s.loopDepth--;
        return;
      }
    }
  }

  pushScope();
  const paramRegs = {};
  for (const p of prog.params) paramRegs[p.name] = allocHome(p.name, p.line);
  for (const f of prog.funcs) {
    pushScope();
    const s = { inFunc: true, loopDepth: 0, hasReturn: false, inExpect: false };
    for (const pn of f.fparams) allocHome(pn, f.line);
    checkStmts(f.body, s);
    if (!s.hasReturn) err(f.line, `func 缺少 return：${f.name}`);
    freeScope();
  }
  pushScope();
  checkStmts(prog.kernel.body, { inFunc: false, loopDepth: 0, hasReturn: false, inExpect: false });
  freeScope();
  for (const m of mems) {
    if (!m.init) continue;
    checkExpr(m.init, { allowLoad: false, allowCall: false, pure: 'init', allowI: true });
  }
  if (prog.expect) {
    for (const st of prog.expect.body) {
      if (st.k !== 'store') err(st.line, 'expect 段只接受 M[idx] = 運算式');
      if (!memSet.has(st.m)) err(st.line, `未宣告的 mem：${st.m}`);
      const idxIsI = st.idx.k === 'name' && st.idx.n === 'i';
      if (!idxIsI) {
        const c = constVal(st.idx, env);
        if (c === null || !Number.isInteger(c) || c < 0) err(st.line, 'expect 索引須為 i 或非負常數');
      }
      checkExpr(st.idx, { allowLoad: false, allowCall: false, pure: 'expect', allowI: idxIsI });
      checkExpr(st.x, { allowLoad: true, allowCall: true, pure: 'expect', allowI: idxIsI });
    }
  }
  freeScope();
  return { mems, paramRegs, funcMap, env };
}

// ---------- 程式碼產生 ----------
function Emitter() {
  return {
    lines: [],
    emit(s) { this.lines.push(s); },
    insnCount() {
      return this.lines.filter((l) => {
        const t = l.trim();
        return t !== '' && !t.startsWith('#') && !t.endsWith(':');
      }).length;
    },
  };
}

let labelSeq = 0;
function freshLabel(p) {
  return `${p}${labelSeq++}`;
}

// 常數乘法（shift-add，不用 mul）：out = src * c。scratch 為 2 個空閒 hard 暫存。
function mulConst(em, out, src, c, scratch, line) {
  if (c === 0) { em.emit(`        li      ${out}, 0`); return; }
  if (c === 1) { em.emit(`        addi    ${out}, ${src}, 0`); return; }
  if (c < 0) {
    mulConst(em, out, src, -c, scratch, line);
    em.emit(`        sub     ${out}, x0, ${out}`);
    return;
  }
  const bits = [];
  for (let k = 0; k < 32; k++) if ((c >>> 0) & (1 << k)) bits.push(k);
  if (bits.length === 1) {
    const k = bits[0];
    if (k === 0) em.emit(`        addi    ${out}, ${src}, 0`);
    else em.emit(`        slli    ${out}, ${src}, ${k}`);
    return;
  }
  const [T, U] = scratch;
  if (T === undefined || U === undefined) err(line, '運算式太複雜，請拆成多個敘述');
  const k0 = bits[0];
  em.emit(k0 === 0 ? `        addi    ${T}, ${src}, 0` : `        slli    ${T}, ${src}, ${k0}`);
  for (const k of bits.slice(1)) {
    em.emit(k === 0 ? `        addi    ${U}, ${src}, 0` : `        slli    ${U}, ${src}, ${k}`);
    em.emit(`        add     ${T}, ${T}, ${U}`);
  }
  em.emit(`        addi    ${out}, ${T}, 0`);
}

function makePool() {
  const free = [...HARD_SCRATCH];
  const ownedSet = new Set();
  return {
    alloc(line) {
      if (free.length === 0) err(line, '運算式太複雜，請拆成多個敘述');
      const r = free.pop();
      ownedSet.add(r);
      return r;
    },
    free(r) {
      if (ownedSet.has(r)) { ownedSet.delete(r); free.push(r); }
    },
    owned(r) { return ownedSet.has(r); },
    ownedList() { return [...ownedSet]; },
    peekExcept(line, exclude) {
      const out = free.filter((r) => !exclude.includes(r)).slice(-2);
      return out;
    },
  };
}

export function compileKernel(src) {
  labelSeq = 0;
  const prog = parseKu(src);
  const ck = check(prog);
  const em = Emitter();
  const baseOf = (m) => BASE_REGS[ck.mems.findIndex((x) => x.name === m)];

  // home 分配（與 check 相同順序，配置一致）
  const freeHomes = [...HOME_REGS];
  const active = new Map();
  const scopeStack = [[]];
  for (const p of prog.params) {
    const want = ck.paramRegs[p.name];
    const at = freeHomes.indexOf(want);
    freeHomes.splice(at, 1);
    active.set(p.name, want);
    scopeStack[0].push(p.name);
  }
  const allocHome = (name, line) => {
    const cur = scopeStack[scopeStack.length - 1];
    if (cur.some((e) => e.name === name)) err(line, `變數重複定義：${name}`);
    if (freeHomes.length === 0) err(line, `變數太多（上限 ${HOME_REGS.length} 個並存具名變數）`);
    const reg = freeHomes.shift();
    cur.push({ name, prev: active.has(name) ? active.get(name) : undefined });
    active.set(name, reg);
    return reg;
  };
  const homeOf = (name, line) => {
    if (name in ck.env.params) return ck.paramRegs[name];
    if (!active.has(name)) err(line, `未定義的變數：${name}`);
    return active.get(name);
  };
  const pushScope = () => scopeStack.push([]);
  const freeScope = () => {
    for (const { name, prev } of scopeStack.pop()) {
      freeHomes.unshift(active.get(name));
      if (prev === undefined) active.delete(name);
      else active.set(name, prev);
    }
  };
  const ctx = {
    env: ck.env,
    funcMap: ck.funcMap,
    baseOf,
    homeOf,
    hasHome: (name) => (name in ck.env.params) || active.has(name),
    liveAHomes: () => {
      const out = [];
      for (const r of active.values()) if (/^a[1-5]$/.test(r) && !out.includes(r)) out.push(r);
      return out;
    },
    loopStack: [],
    needPrint: false,
    curWrites: null, // func 本體寫入的 s-reg 追蹤（genFunc 設定）
    noteWrite: (r) => {
      if (ctx.curWrites && /^s\d+$/.test(r) && !BASE_REGS.includes(r)) ctx.curWrites.add(r);
    },
  };

  // 索引位址：{base, off}（常數短位移）或 {reg}（pool 所有）
  function indexAddr(pool, mem, idxNode, mode) {
    const line = idxNode.line;
    const c = constVal(idxNode, ctx.env);
    const base = baseOf(mem);
    if (c !== null) {
      const off = c * 4;
      if (off >= -2048 && off <= 2047) return { base, off };
    }
    const iv = evalExpr(pool, idxNode, mode);
    const addr = pool.alloc(line);
    em.emit(`        slli    ${addr}, ${iv}, 2`);
    em.emit(`        add     ${addr}, ${base}, ${addr}`);
    pool.free(iv);
    return { reg: addr };
  }
  function emitLoad(pool, mem, idxNode, mode) {
    const a = indexAddr(pool, mem, idxNode, mode);
    const r = pool.alloc(idxNode.line);
    if (a.reg) {
      em.emit(`        lw      ${r}, 0(${a.reg})`);
      pool.free(a.reg);
    } else {
      em.emit(`        lw      ${r}, ${a.off}(${a.base})`);
    }
    return r;
  }
  function emitStore(pool, mem, idxNode, valReg, mode) {
    const a = indexAddr(pool, mem, idxNode, mode);
    if (a.reg) {
      em.emit(`        sw      ${valReg}, 0(${a.reg})`);
      pool.free(a.reg);
    } else {
      em.emit(`        sw      ${valReg}, ${a.off}(${a.base})`);
    }
    pool.free(valReg);
  }

  // 運算式求值 → 暫存器名（pool 所有；具名 home 直接回傳不佔用）
  function evalExpr(pool, node, mode) {
    const line = node.line;
    switch (node.k) {
      case 'num': {
        const r = pool.alloc(line);
        em.emit(`        li      ${r}, ${node.v}`);
        return r;
      }
      case 'sys': {
        const r = pool.alloc(line);
        if (node.n === 'tid') em.emit(`        addi    ${r}, t0, 0`);
        else if (node.n === 'ntid') em.emit(`        addi    ${r}, t1, 0`);
        else em.emit(`        li      ${r}, ${ctx.env.n}`);
        return r;
      }
      case 'name': {
        if (node.n === 'i' && !ctx.hasHome('i') && mode.idx) {
          const r = pool.alloc(line);
          em.emit(`        addi    ${r}, ${mode.idx}, 0`);
          return r;
        }
        return homeOf(node.n, line);
      }
      case 'load':
        return emitLoad(pool, node.m, node.idx, mode);
      case 'un': {
        const a = evalExpr(pool, node.x, mode);
        if (node.op === '-') {
          if (pool.owned(a)) { em.emit(`        sub     ${a}, x0, ${a}`); return a; }
          const r = pool.alloc(line);
          em.emit(`        sub     ${r}, x0, ${a}`);
          return r;
        }
        if (node.op === '~') {
          if (pool.owned(a)) { em.emit(`        xori    ${a}, ${a}, -1`); return a; }
          const r = pool.alloc(line);
          em.emit(`        xori    ${r}, ${a}, -1`);
          return r;
        }
        if (pool.owned(a)) { em.emit(`        sltiu   ${a}, ${a}, 1`); return a; }
        const r2 = pool.alloc(line);
        em.emit(`        sltiu   ${r2}, ${a}, 1`);
        return r2;
      }
      case 'bin': {
        const op = node.op;
        if (['==', '!=', '<', '<=', '>', '>='].includes(op)) {
          return evalCmp(pool, node, mode);
        }
        if (op === '*') {
          const c = constVal(node.x, ctx.env);
          const d = constVal(node.y, ctx.env);
          if (c !== null && d !== null) {
            const r = pool.alloc(line);
            em.emit(`        li      ${r}, ${c * d}`);
            return r;
          }
          const varSide = c !== null ? node.y : node.x;
          const k = c !== null ? c : d;
          const a = evalExpr(pool, varSide, mode);
          if (pool.owned(a)) {
            mulConst(em, a, a, k, pool.peekExcept(line, []), line);
            return a;
          }
          const r = pool.alloc(line);
          mulConst(em, r, a, k, pool.peekExcept(line, [r]), line);
          return r;
        }
        if (op === '/' || op === '%') {
          const d = constVal(node.y, ctx.env);
          const k = log2int(d);
          const a = evalExpr(pool, node.x, mode);
          const out = pool.owned(a) ? a : pool.alloc(line);
          if (out !== a) em.emit(`        addi    ${out}, ${a}, 0`);
          if (op === '/') {
            // 向零取整除法（2^k）：負數先加偏置
            const adj = pool.alloc(line);
            em.emit(`        srai    ${adj}, ${out}, 31`);
            em.emit(`        andi    ${adj}, ${adj}, ${d - 1}`);
            em.emit(`        add     ${out}, ${out}, ${adj}`);
            em.emit(`        srai    ${out}, ${out}, ${k}`);
            pool.free(adj);
          } else {
            // r = x - trunc(x/d)*d
            const q = pool.alloc(line);
            const adj = pool.alloc(line);
            em.emit(`        srai    ${adj}, ${out}, 31`);
            em.emit(`        andi    ${adj}, ${adj}, ${d - 1}`);
            em.emit(`        add     ${q}, ${out}, ${adj}`);
            em.emit(`        srai    ${q}, ${q}, ${k}`);
            em.emit(`        slli    ${adj}, ${q}, ${k}`);
            em.emit(`        sub     ${out}, ${out}, ${adj}`);
            pool.free(q);
            pool.free(adj);
          }
          return out;
        }
        if (op === '<<' || op === '>>') {
          const a = evalExpr(pool, node.x, mode);
          const b = evalExpr(pool, node.y, mode);
          const mn = op === '<<' ? 'sll' : 'sra';
          if (pool.owned(a)) {
            em.emit(`        ${mn}     ${a}, ${a}, ${b}`);
            pool.free(b);
            return a;
          }
          const r = pool.alloc(line);
          em.emit(`        ${mn}     ${r}, ${a}, ${b}`);
          pool.free(b);
          return r;
        }
        // + - & | ^
        const a = evalExpr(pool, node.x, mode);
        const b = evalExpr(pool, node.y, mode);
        const mn = op === '+' ? 'add' : op === '-' ? 'sub' : op === '&' ? 'and' : op === '|' ? 'or' : 'xor';
        if (pool.owned(a)) {
          em.emit(`        ${mn}     ${a}, ${a}, ${b}`);
          pool.free(b);
          return a;
        }
        if (pool.owned(b)) {
          em.emit(`        ${mn}     ${b}, ${a}, ${b}`);
          return b;
        }
        const r = pool.alloc(line);
        em.emit(`        ${mn}     ${r}, ${a}, ${b}`);
        pool.free(b);
        return r;
      }
      case 'call':
        return evalCall(pool, node.f, node.args, mode, line, true);
    }
  }

  function evalCmp(pool, node, mode) {
    const line = node.line;
    const op = node.op;
    const a = evalExpr(pool, node.x, mode);
    const b = evalExpr(pool, node.y, mode);
    const out = pool.owned(a) ? a : (pool.owned(b) && (op === '==' || op === '!=') ? b : pool.alloc(line));
    const freeA = pool.owned(a) && out !== a;
    const freeB = pool.owned(b) && out !== b;
    const done = (r) => {
      if (freeA) pool.free(a);
      if (freeB) pool.free(b);
      return r;
    };
    switch (op) {
      case '<':
        em.emit(`        slt     ${out}, ${a}, ${b}`);
        return done(out);
      case '>':
        em.emit(`        slt     ${out}, ${b}, ${a}`);
        return done(out);
      case '<=':
        em.emit(`        slt     ${out}, ${b}, ${a}`);
        em.emit(`        xori    ${out}, ${out}, 1`);
        return done(out);
      case '>=':
        em.emit(`        slt     ${out}, ${a}, ${b}`);
        em.emit(`        xori    ${out}, ${out}, 1`);
        return done(out);
      case '==':
        em.emit(`        xor     ${out}, ${a}, ${b}`);
        em.emit(`        sltiu   ${out}, ${out}, 1`);
        return done(out);
      default:
        em.emit(`        xor     ${out}, ${a}, ${b}`);
        em.emit(`        sltu    ${out}, x0, ${out}`);
        return done(out);
    }
  }

  // 函式呼叫（含 caller spill）。wantValue=false 時不留值。
  function evalCall(pool, fname, args, mode, line, wantValue = true) {
    const f = ctx.funcMap.get(fname);
    if (!f) err(line, `未定義的函式：${fname}`);
    if (args.length > 4) err(line, '呼叫參數太多（上限 4 個）');
    const argRegs = args.map((a) => evalExpr(pool, a, mode));
    let dest = null;
    if (wantValue) dest = pool.alloc(line);
    const spill = [];
    for (const r of pool.ownedList()) spill.push(r);
    for (const r of ctx.liveAHomes()) if (!spill.includes(r)) spill.push(r);
    if (spill.length > 0) em.emit(`        addi    sp, sp, -${spill.length * 4}`);
    spill.forEach((r, i) => em.emit(`        sw      ${r}, ${i * 4}(sp)`));
    argRegs.forEach((r, i) => {
      em.emit(`        addi    a${i}, ${r}, 0`);
      pool.free(r);
    });
    em.emit(`        jal     ra, F_${fname}`);
    spill.forEach((r, i) => em.emit(`        lw      ${r}, ${i * 4}(sp)`));
    if (spill.length > 0) em.emit(`        addi    sp, sp, ${spill.length * 4}`);
    if (wantValue) em.emit(`        addi    ${dest}, a0, 0`);
    return dest;
  }

  // ---- 敘述 codegen ----
  function genStmts(stmts, mode) {
    for (const s of stmts) genStmt(s, mode);
  }
  function genStmt(s, mode) {
    const line = s.line;
    switch (s.k) {
      case 'decl': {
        const home = allocHome(s.n, line);
        const pool = makePool();
        const r = evalExpr(pool, s.x, mode);
        em.emit(`        addi    ${home}, ${r}, 0`);
        ctx.noteWrite(home);
        pool.free(r);
        return;
      }
      case 'assign': {
        const home = homeOf(s.n, line);
        const pool = makePool();
        const r = evalExpr(pool, s.x, mode);
        if (r !== home) em.emit(`        addi    ${home}, ${r}, 0`);
        ctx.noteWrite(home);
        pool.free(r);
        return;
      }
      case 'store': {
        const pool = makePool();
        const r = evalExpr(pool, s.x, mode);
        emitStore(pool, s.m, s.idx, r, mode);
        return;
      }
      case 'callstmt': {
        const pool = makePool();
        evalCall(pool, s.f, s.args, mode, line, false);
        return;
      }
      case 'print': {
        const pool = makePool();
        const r = evalExpr(pool, s.args[0], mode);
        const spill = [];
        for (const q of pool.ownedList()) spill.push(q);
        for (const q of ctx.liveAHomes()) if (!spill.includes(q)) spill.push(q);
        if (spill.length > 0) em.emit(`        addi    sp, sp, -${spill.length * 4}`);
        spill.forEach((q, i) => em.emit(`        sw      ${q}, ${i * 4}(sp)`));
        em.emit(`        addi    a0, ${r}, 0`);
        pool.free(r);
        em.emit(`        jal     ra, F___print_int`);
        spill.forEach((q, i) => em.emit(`        lw      ${q}, ${i * 4}(sp)`));
        if (spill.length > 0) em.emit(`        addi    sp, sp, ${spill.length * 4}`);
        ctx.needPrint = true;
        return;
      }
      case 'barrier':
        if (mode.t === 'expect') err(line, 'expect 段不可用 barrier（僅 lane0 執行，會永等）');
        em.emit(`        barrier`);
        return;
      case 'return': {
        const pool = makePool();
        const r = evalExpr(pool, s.x, mode);
        em.emit(`        addi    a0, ${r}, 0`);
        pool.free(r);
        em.emit(`        jal     x0, ${mode.retLabel}`);
        return;
      }
      case 'break': {
        if (ctx.loopStack.length === 0) err(line, 'break 只可出現在迴圈內');
        em.emit(`        jal     x0, ${ctx.loopStack[ctx.loopStack.length - 1].brk}`);
        return;
      }
      case 'continue': {
        if (ctx.loopStack.length === 0) err(line, 'continue 只可出現在迴圈內');
        em.emit(`        jal     x0, ${ctx.loopStack[ctx.loopStack.length - 1].cont}`);
        return;
      }
      case 'if': {
        const pool = makePool();
        const c = evalExpr(pool, s.c, mode);
        const elseL = freshLabel('ELSE');
        const endL = freshLabel('ENDIF');
        em.emit(`        beq     ${c}, x0, ${s.e ? elseL : endL}`);
        pool.free(c);
        pushScope();
        genStmts(s.t, mode);
        freeScope();
        if (s.e) {
          em.emit(`        jal     x0, ${endL}`);
          em.emit(`${elseL}:`);
          pushScope();
          genStmts(s.e, mode);
          freeScope();
          em.emit(`${endL}:`);
        } else {
          em.emit(`${endL}:`);
        }
        return;
      }
      case 'while': {
        const topL = freshLabel('WHILE');
        const endL = freshLabel('WEND');
        ctx.loopStack.push({ brk: endL, cont: topL });
        em.emit(`${topL}:`);
        {
          const pool = makePool();
          const c = evalExpr(pool, s.c, mode);
          em.emit(`        beq     ${c}, x0, ${endL}`);
          pool.free(c);
        }
        pushScope();
        genStmts(s.b, mode);
        freeScope();
        em.emit(`        jal     x0, ${topL}`);
        em.emit(`${endL}:`);
        ctx.loopStack.pop();
        return;
      }
      case 'for': {
        pushScope();
        const home = allocHome(s.vn, line);
        {
          const pool = makePool();
          const r = evalExpr(pool, s.init, mode);
          em.emit(`        addi    ${home}, ${r}, 0`);
          ctx.noteWrite(home);
          pool.free(r);
        }
        const topL = freshLabel('FOR');
        const stepL = freshLabel('FSTEP');
        const endL = freshLabel('FEND');
        ctx.loopStack.push({ brk: endL, cont: stepL });
        em.emit(`${topL}:`);
        {
          const pool = makePool();
          const c = evalExpr(pool, s.cond, mode);
          em.emit(`        beq     ${c}, x0, ${endL}`);
          pool.free(c);
        }
        genStmts(s.b, mode);
        em.emit(`${stepL}:`);
        {
          const pool = makePool();
          const st = evalExpr(pool, s.step, mode);
          em.emit(s.sop === '+=' ? `        add     ${home}, ${home}, ${st}` : `        sub     ${home}, ${home}, ${st}`);
          ctx.noteWrite(home);
          pool.free(st);
        }
        em.emit(`        jal     x0, ${topL}`);
        em.emit(`${endL}:`);
        ctx.loopStack.pop();
        freeScope();
        return;
      }
    }
  }

  // ---- 函式本體（含 frame） ----
  function genFunc(f) {
    const sub = Emitter();
    const saveLines = em.lines;
    em.lines = sub.lines;
    const writes = new Set();
    ctx.curWrites = writes;
    pushScope();
    f.fparams.forEach((pn, i) => {
      const home = allocHome(pn, f.line);
      em.emit(`        addi    ${home}, a${i}, 0`);
      ctx.noteWrite(home);
    });
    const retL = freshLabel(`RET_${f.name}_`);
    genStmts(f.body, { t: 'vec', retLabel: retL, idx: null });
    em.emit(`${retL}:`);
    freeScope();
    ctx.curWrites = null;
    em.lines = saveLines;
    const saveList = [...writes].sort();
    const frame = 4 * (1 + saveList.length);
    em.emit(`F_${f.name}:`);
    em.emit(`        addi    sp, sp, -${frame}`);
    em.emit(`        sw      ra, ${frame - 4}(sp)`);
    saveList.forEach((r, i) => em.emit(`        sw      ${r}, ${i * 4}(sp)`));
    for (const l of sub.lines) em.emit(l);
    saveList.forEach((r, i) => em.emit(`        lw      ${r}, ${i * 4}(sp)`));
    em.emit(`        lw      ra, ${frame - 4}(sp)`);
    em.emit(`        addi    sp, sp, ${frame}`);
    em.emit(`        jalr    x0, 0(ra)`);
  }

  // ---- __print_int：a0 = 整數，UART 逐字印十進位（leaf，只用 t5/t6/a6＋自存 s2/s3） ----
  function genPrintInt() {
    em.emit(`F___print_int:`);
    em.emit(`        addi    sp, sp, -12`);
    em.emit(`        sw      ra, 8(sp)`);
    em.emit(`        sw      s2, 4(sp)`);
    em.emit(`        sw      s3, 0(sp)`);
    em.emit(`        bge     a0, x0, PPI_POS`);
    em.emit(`        addi    sp, sp, -4`);
    em.emit(`        sw      a0, 0(sp)`);
    em.emit(`        li      a0, 45`);
    em.emit(`        li      a7, 1`);
    em.emit(`        ecall`);
    em.emit(`        lw      a0, 0(sp)`);
    em.emit(`        addi    sp, sp, 4`);
    em.emit(`PPI_POS:`);
    em.emit(`        li      s2, 10`);
    em.emit(`        bltu    a0, s2, PPI_DIG`);
    em.emit(`        li      s3, 0`);
    em.emit(`        li      t5, 31`);
    em.emit(`        li      a6, 0`);
    em.emit(`PPIDIV:`);
    em.emit(`        blt     t5, x0, PPIDIVEND`);
    em.emit(`        slli    a6, a6, 1`);
    em.emit(`        srl     t6, a0, t5`);
    em.emit(`        andi    t6, t6, 1`);
    em.emit(`        or      a6, a6, t6`);
    em.emit(`        slli    s3, s3, 1`);
    em.emit(`        bltu    a6, s2, PPIDIVSK`);
    em.emit(`        sub     a6, a6, s2`);
    em.emit(`        ori     s3, s3, 1`);
    em.emit(`PPIDIVSK:`);
    em.emit(`        addi    t5, t5, -1`);
    em.emit(`        jal     x0, PPIDIV`);
    em.emit(`PPIDIVEND:`);
    em.emit(`        addi    sp, sp, -4`);
    em.emit(`        sw      a6, 0(sp)`);
    em.emit(`        addi    a0, s3, 0`);
    em.emit(`        jal     ra, F___print_int`);
    em.emit(`        lw      a6, 0(sp)`);
    em.emit(`        addi    sp, sp, 4`);
    em.emit(`        addi    a0, a6, 0`);
    em.emit(`PPI_DIG:`);
    em.emit(`        addi    a0, a0, 48`);
    em.emit(`        li      a7, 1`);
    em.emit(`        ecall`);
    em.emit(`PPI_END:`);
    em.emit(`        lw      s3, 0(sp)`);
    em.emit(`        lw      s2, 4(sp)`);
    em.emit(`        lw      ra, 8(sp)`);
    em.emit(`        addi    sp, sp, 12`);
    em.emit(`        jalr    x0, 0(ra)`);
  }

  // ---- 主程式 ----
  em.emit(`# cu2rv 產生（高階 DSL→riscvgpu 組語）：lanes=${prog.lanes} n=${prog.n}`);
  em.emit(`# 用法：node cli/rvasm.js <Name>.s → <Name>.hex，載入 riscvgpu 即跑`);
  em.emit(`        tid     t0`);
  em.emit(`        ntid    t1`);
  em.emit(`        li      sp, 0x${STACK_TOP.toString(16)}`);
  em.emit(`        slli    t6, t0, ${STACK_SHIFT}`);
  em.emit(`        sub     sp, sp, t6`);
  for (const m of ck.mems) em.emit(`        li      ${baseOf(m.name)}, 0x${m.addr.toString(16)}`);
  pushScope(); // param scope（全域存活至結尾）
  for (const p of prog.params) {
    em.emit(`        li      ${ck.paramRegs[p.name]}, ${ck.env.params[p.name]}`);
  }

  // --- init：grid-stride 寫入（各通道不重疊） ---
  const initIdx = allocHome('@init_i', prog.kernel.line);
  for (const m of ck.mems) {
    if (!m.init) continue;
    em.emit(`        # --- init ${m.name}[0..${m.len}) ---`);
    const topL = freshLabel('INIT');
    const endL = freshLabel('INITEND');
    em.emit(`        addi    ${initIdx}, t0, 0`);
    em.emit(`${topL}:`);
    {
      const pool = makePool();
      const c = pool.alloc(m.line);
      em.emit(`        sltiu   ${c}, ${initIdx}, ${m.len}`);
      em.emit(`        beq     ${c}, x0, ${endL}`);
      pool.free(c);
    }
    {
      const pool = makePool();
      const r = evalExpr(pool, m.init, { t: 'init', idx: initIdx });
      emitStore(pool, m.name, { k: 'name', n: 'i', line: m.line }, r, { t: 'init', idx: initIdx });
    }
    em.emit(`        add     ${initIdx}, ${initIdx}, t1`);
    em.emit(`        jal     x0, ${topL}`);
    em.emit(`${endL}:`);
  }
  em.emit(`        barrier`);

  // --- kernel ---
  em.emit(`        # --- kernel ${prog.kernel.name} ---`);
  genStmts(prog.kernel.body, { t: 'vec', retLabel: null, idx: null });
  em.emit(`        barrier`);

  // --- expect：僅 lane0 ---
  if (prog.expect) {
    em.emit(`        # --- expect（僅 lane0，a0=錯誤數） ---`);
    em.emit(`        bne     t0, x0, QUIT`);
    em.emit(`        li      a0, 0`);
    for (const m of ck.mems) em.emit(`        li      ${baseOf(m.name)}, 0x${m.addr.toString(16)}`);
    let ei = 0;
    for (const s of prog.expect.body) {
      const idxIsI = s.idx.k === 'name' && s.idx.n === 'i';
      if (idxIsI) {
        const mem = ck.mems.find((x) => x.name === s.m);
        const idxH = allocHome(`@exp${ei}`, s.line);
        const topL = freshLabel(`EXP${ei}_`);
        const nxtL = freshLabel(`EXP${ei}N_`);
        const badL = freshLabel(`EXPBAD${ei}_`);
        em.emit(`        li      ${idxH}, 0`);
        em.emit(`${topL}:`);
        {
          const pool = makePool();
          const c = pool.alloc(s.line);
          em.emit(`        sltiu   ${c}, ${idxH}, ${mem.len}`);
          em.emit(`        beq     ${c}, x0, ${nxtL}`);
          pool.free(c);
        }
        {
          const pool = makePool();
          const r = evalExpr(pool, s.x, { t: 'expect', idx: idxH });
          const t = pool.alloc(s.line);
          const base = baseOf(s.m);
          em.emit(`        slli    ${t}, ${idxH}, 2`);
          em.emit(`        add     ${t}, ${base}, ${t}`);
          em.emit(`        lw      ${t}, 0(${t})`);
          em.emit(`        bne     ${t}, ${r}, ${badL}`);
          pool.free(t);
          pool.free(r);
        }
        em.emit(`        addi    ${idxH}, ${idxH}, 1`);
        em.emit(`        jal     x0, ${topL}`);
        em.emit(`${badL}:`);
        em.emit(`        addi    a0, a0, 1`);
        em.emit(`        addi    ${idxH}, ${idxH}, 1`);
        em.emit(`        jal     x0, ${topL}`);
        em.emit(`${nxtL}:`);
        freeScopeOne(`@exp${ei}`);
      } else {
        const badL = freshLabel(`EXPBAD${ei}_`);
        const nxtL = freshLabel(`EXP${ei}N_`);
        const c = constVal(s.idx, ck.env);
        const pool = makePool();
        const r = evalExpr(pool, s.x, { t: 'expect', idx: null });
        const t = pool.alloc(s.line);
        const base = baseOf(s.m);
        const off = c * 4;
        if (off >= -2048 && off <= 2047) {
          em.emit(`        lw      ${t}, ${off}(${base})`);
        } else {
          em.emit(`        li      ${t}, ${off}`);
          em.emit(`        add     ${t}, ${base}, ${t}`);
          em.emit(`        lw      ${t}, 0(${t})`);
        }
        em.emit(`        bne     ${t}, ${r}, ${badL}`);
        em.emit(`        jal     x0, ${nxtL}`);
        em.emit(`${badL}:`);
        em.emit(`        addi    a0, a0, 1`);
        em.emit(`${nxtL}:`);
        pool.free(t);
        pool.free(r);
      }
      ei++;
    }
  }
  em.emit(`QUIT:   li      a7, 10`);
  em.emit(`        ecall`);

  // ---- 函式區（主流程之後，jal 到達） ----
  for (const f of prog.funcs) genFunc(f);
  if (ctx.needPrint) genPrintInt();

  freeScope(); // param scope

  const count = em.insnCount();
  if (count > IMEM_LIMIT) {
    throw new Error(`產生指令 ${count} 條，超過 IMEM 上限 ${IMEM_LIMIT}（請縮小 n 或拆 kernel）`);
  }
  return { asm: em.lines.join('\n') + '\n' };

  function freeScopeOne(name) {
    const names = scopeStack[scopeStack.length - 1];
    const at = names.map((e) => e.name).lastIndexOf(name);
    if (at >= 0) {
      const [{ prev }] = names.splice(at, 1);
      freeHomes.unshift(active.get(name));
      if (prev === undefined) active.delete(name);
      else active.set(name, prev);
    }
  }
}
