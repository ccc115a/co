// lib/cu2rv.js：自訂 kernel DSL → riscvgpu 組語（純 ES module、零依賴）。
// compileKernel(src) → { asm }；錯誤一律 throw（含行號，第N行）。
//
// DSL（.ku 檔，見 kernels/*.ku）：
//   lanes 4            通道數（1..8；riscvgpu 預設 4）
//   n 8                總元素數（須被 lanes 整除）
//   mem A @ 0x100      陣列宣告（位址字對齊，4KB 內、不重疊；長度預設 n）
//   mem B @ 0x120 x 8  （可顯式指定長度，須 >= n）
//   param a = 2        純量常數（init/kernel 運算式可用）
//   init:              每通道分區寫入（只可用 i／常數／param，不可讀 mem）
//     A[i] = i + 1
//   kernel:            每通道分區計算（可用 mem 讀寫、暫存變數、barrier）
//     t = a * A[i]
//     C[i] = t + B[i]
//     barrier          （顯式分段；init 後與 kernel 後自動各有一個 barrier）
//
// 運算式：整數 + - *、括號、前置負號；運算元為十進位／0x 常數、i、tid、
// param、暫存變數、A[i]（kernel 限定）。* 的一邊須為常數（硬體無 M 擴充，
// 常數乘以 shift-add 展開；變數*變數、浮點數一律報錯）。
// 語意：i 為 0-based 全域索引；各通道處理連續 n/lanes 個元素。
// 輸出只含 RV32I＋li 偽指令＋tid/ntid/barrier，不用 mul（riscvgpu ALU 無 M 擴充）。
// 驗證段由 lane0 逐項重算 kernel 比對（殘差檢查），a0=錯誤數，a7=10 ecall 結束。

const BASE_REGS = ['t2', 't3', 't4', 's0', 's1']; // 每個 mem 一個基址暫存器（上限 5 個 mem）
const HOME_REGS = ['s2', 's3', 's4', 's5', 's6', 'a1', 'a2', 'a3', 'a4', 'a5']; // param＋暫存變數家（上限 10 個）
const SCRATCH = ['t6', 's7', 's8', 's9', 's10', 's11']; // 運算式求值暫存池
const DMEM_SIZE = 4096;
const IMEM_LIMIT = 200; // 生成指令數上限（riscvgpu IMEM 256 字，留裕度）

function err(lineno, msg) {
  throw new Error(`第${lineno}行：${msg}`);
}

// ---------- 運算式解析（遞迴下降） ----------
// 節點：{k:'num',v} {k:'i'} {k:'tid'} {k:'name',n}（param/暫存）
//       {k:'load',m}（M[i]） {k:'neg',x} {k:'bin',op,x,y}
function parseExpr(s, lineno) {
  let pos = 0;
  const peek = () => s[pos];
  const skip = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
  function parseAdd() {
    let x = parseMul();
    for (;;) {
      skip();
      if (peek() === '+' || peek() === '-') {
        const op = s[pos++];
        const y = parseMul();
        x = { k: 'bin', op, x, y };
      } else return x;
    }
  }
  function parseMul() {
    let x = parseUnary();
    for (;;) {
      skip();
      if (peek() === '*') {
        pos++;
        const y = parseUnary();
        x = { k: 'bin', op: '*', x, y };
      } else return x;
    }
  }
  function parseUnary() {
    skip();
    if (peek() === '-') { pos++; return { k: 'neg', x: parseUnary() }; }
    if (peek() === '+') { pos++; return parseUnary(); }
    return parseAtom();
  }
  function parseAtom() {
    skip();
    if (peek() === '(') {
      pos++;
      const x = parseAdd();
      skip();
      if (peek() !== ')') err(lineno, `運算式括號不配對：${s}`);
      pos++;
      return x;
    }
    let m = /^0[xX][0-9a-fA-F]+/.exec(s.slice(pos));
    if (m) { pos += m[0].length; return { k: 'num', v: Number(m[0]) }; }
    m = /^\d+/.exec(s.slice(pos));
    if (m) {
      if (s.slice(pos + m[0].length, pos + m[0].length + 1) === '.') err(lineno, `不支援浮點數（riscvgpu 無 F 擴充）：${s}`);
      pos += m[0].length;
      return { k: 'num', v: Number(m[0]) };
    }
    m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(pos));
    if (!m) err(lineno, `運算式無法解析：${s}`);
    const name = m[0];
    pos += name.length;
    const save = pos;
    skip();
    if (peek() === '[') {
      pos++;
      skip();
      let idx = '';
      while (pos < s.length && peek() !== ']') idx += s[pos++];
      if (peek() !== ']') err(lineno, `缺少 ]：${s}`);
      pos++;
      if (idx.trim() !== 'i') err(lineno, `陣列索引只支援 [i]：${s}`);
      return { k: 'load', m: name };
    }
    pos = save;
    if (name === 'i') return { k: 'i' };
    if (name === 'tid') return { k: 'tid' };
    return { k: 'name', n: name };
  }
  const x = parseAdd();
  skip();
  if (pos !== s.length) err(lineno, `運算式尾端多出字元：${s}`);
  return x;
}

// 常數折疊：回傳數值；非純常數回傳 null。
function constVal(node, params) {
  switch (node.k) {
    case 'num': return node.v;
    case 'name': return (node.n in params) ? params[node.n] : null;
    case 'neg': { const v = constVal(node.x, params); return v === null ? null : -v; }
    case 'bin': {
      const a = constVal(node.x, params), b = constVal(node.y, params);
      if (a === null || b === null) return null;
      if (node.op === '+') return a + b;
      if (node.op === '-') return a - b;
      return a * b;
    }
    default: return null;
  }
}

function parseKuNum(tok, lineno) {
  const s = String(tok).trim();
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(s) || /^[+-]?\d+$/.test(s)) {
    const v = Number(s);
    if (!Number.isInteger(v)) err(lineno, `數字格式錯誤：${tok}`);
    return v;
  }
  err(lineno, `數字格式錯誤：${tok}`);
}

// ---------- 頂層解析 ----------
export function parseKernel(src) {
  const lines = String(src).split('\n');
  const prog = { lanes: 0, n: 0, mems: [], params: {}, init: [], kernel: [] };
  const memNames = new Set();
  let section = 'head'; // head | init | kernel
  const seen = { lanes: 0, n: 0 };

  lines.forEach((raw, li) => {
    const lineno = li + 1;
    const line = raw.split('#')[0].trim();
    if (line === '') return;
    if (line === 'init:') { section = 'init'; return; }
    if (line === 'kernel:') { section = 'kernel'; return; }
    if (section === 'head') {
      let m = /^lanes\s+(\S+)$/.exec(line);
      if (m) {
        if (seen.lanes) err(lineno, 'lanes 重複定義');
        seen.lanes = 1;
        prog.lanes = parseKuNum(m[1], lineno);
        if (prog.lanes < 1 || prog.lanes > 8) err(lineno, `lanes 須為 1..8：${m[1]}`);
        return;
      }
      m = /^n\s+(\S+)$/.exec(line);
      if (m) {
        if (seen.n) err(lineno, 'n 重複定義');
        seen.n = 1;
        prog.n = parseKuNum(m[1], lineno);
        if (prog.n < 1) err(lineno, `n 須為正整數：${m[1]}`);
        return;
      }
      m = /^mem\s+([A-Za-z_][A-Za-z0-9_]*)\s+@\s*(\S+)(?:\s+x\s+(\S+))?$/.exec(line);
      if (m) {
        if (memNames.has(m[1])) err(lineno, `mem 重複定義：${m[1]}`);
        memNames.add(m[1]);
        const addr = parseKuNum(m[2], lineno);
        const len = m[3] === undefined ? 0 : parseKuNum(m[3], lineno); // 0 表預設 n（待 n 確定後回填）
        if (addr % 4 !== 0) err(lineno, `mem 位址須字對齊：${m[1]}`);
        if (len !== 0 && len < 1) err(lineno, `mem 長度須為正整數：${m[1]}`);
        prog.mems.push({ name: m[1], addr, len, lineno });
        return;
      }
      m = /^param\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (m) {
        if (m[1] in prog.params) err(lineno, `param 重複定義：${m[1]}`);
        if (memNames.has(m[1]) || m[1] === 'i' || m[1] === 'tid') err(lineno, `param 名稱衝突：${m[1]}`);
        const v = parseKuNum(m[2].trim(), lineno);
        if (v < -0x80000000 || v > 0xffffffff) err(lineno, `param 超出 32 位範圍：${m[1]}`);
        prog.params[m[1]] = v | 0;
        return;
      }
      err(lineno, `頂層只接受 lanes／n／mem／param／init:／kernel:：${line}`);
    } else {
      if (line === 'barrier') {
        if (section === 'init') err(lineno, 'init 段不接受 barrier（init 後自動同步）');
        prog.kernel.push({ k: 'barrier', lineno });
        return;
      }
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*i\s*\]\s*=\s*(.+)$/.exec(line);
      if (m) {
        if (!memNames.has(m[1])) err(lineno, `未宣告的 mem：${m[1]}`);
        const expr = parseExpr(m[2].trim(), lineno);
        (section === 'init' ? prog.init : prog.kernel).push({ k: 'store', m: m[1], expr, lineno });
        return;
      }
      const t = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (m === null && t) {
        if (section === 'init') err(lineno, 'init 段只接受 M[i] = 運算式');
        const expr = parseExpr(t[2].trim(), lineno);
        prog.kernel.push({ k: 'tmp', name: t[1], expr, lineno });
        return;
      }
      err(lineno, `無法解析：${line}`);
    }
  });

  if (!seen.lanes) throw new Error('缺少 lanes 定義');
  if (!seen.n) throw new Error('缺少 n 定義');
  if (prog.mems.length === 0) throw new Error('至少宣告一個 mem');
  if (prog.mems.length > BASE_REGS.length) throw new Error(`mem 太多（上限 ${BASE_REGS.length} 個）`);
  if (prog.n % prog.lanes !== 0) throw new Error(`n（${prog.n}）須被 lanes（${prog.lanes}）整除`);
  if (prog.kernel.length === 0) throw new Error('kernel 段為空');
  for (const m of prog.mems) {
    if (m.len === 0) m.len = prog.n;
    if (m.len < prog.n) throw new Error(`第${m.lineno}行：mem ${m.name} 長度（${m.len}）小於 n（${prog.n}）`);
    if (m.addr < 0 || m.addr + m.len * 4 > DMEM_SIZE) throw new Error(`第${m.lineno}行：mem ${m.name} 超出 4KB 資料記憶體`);
  }
  // mem 區間重疊檢查
  const ranges = prog.mems.map(m => [m.addr, m.addr + m.len * 4, m.name]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] < ranges[i - 1][1]) throw new Error(`mem ${ranges[i][2]} 與 mem ${ranges[i - 1][2]} 位址重疊`);
  }
  return prog;
}

// ---------- 語意驗證 ----------
function checkExpr(node, prog, temps, lineno, { allowLoad, phase }) {
  switch (node.k) {
    case 'num': {
      if (!Number.isInteger(node.v) || node.v < -0x80000000 || node.v > 0xffffffff) err(lineno, `常數超出 32 位範圍：${node.v}`);
      return;
    }
    case 'i': case 'tid': return;
    case 'name': {
      if (node.n in prog.params) return;
      if (temps.has(node.n)) return;
      err(lineno, `未定義的變數：${node.n}`);
      return;
    }
    case 'load': {
      if (!allowLoad) err(lineno, `${phase} 段不可讀 mem（只可用 i／常數／param）`);
      if (!prog.mems.some(m => m.name === node.m)) err(lineno, `未宣告的 mem：${node.m}`);
      return;
    }
    case 'neg': checkExpr(node.x, prog, temps, lineno, { allowLoad, phase }); return;
    case 'bin': {
      checkExpr(node.x, prog, temps, lineno, { allowLoad, phase });
      checkExpr(node.y, prog, temps, lineno, { allowLoad, phase });
      if (node.op === '*') {
        const a = constVal(node.x, prog.params), b = constVal(node.y, prog.params);
        if (a === null && b === null) {
          // 兩邊都含變數：除非其中一邊是純量暫存變數可展開？一律拒絕（無 M 擴充）
          err(lineno, '變數相乘需 M 擴充，硬體不支援（* 的一邊須為常數或 param）');
        }
      }
      return;
    }
  }
}

function validate(prog) {
  const homes = new Map(); // param＋暫存變數 → 暫存器
  let hi = 0;
  for (const p of Object.keys(prog.params)) homes.set(p, HOME_REGS[hi++]);
  const temps = new Set();
  for (const s of prog.init) {
    checkExpr(s.expr, prog, temps, s.lineno, { allowLoad: false, phase: 'init' });
  }
  for (const s of prog.kernel) {
    if (s.k === 'barrier') continue;
    if (s.k === 'tmp') {
      if (prog.mems.some(m => m.name === s.name) || s.name in prog.params || s.name === 'i' || s.name === 'tid') {
        err(s.lineno, `暫存變數名稱衝突：${s.name}`);
      }
      checkExpr(s.expr, prog, temps, s.lineno, { allowLoad: true, phase: 'kernel' });
      if (!temps.has(s.name)) {
        if (hi >= HOME_REGS.length) err(s.lineno, `變數太多（param＋暫存上限 ${HOME_REGS.length} 個）`);
        homes.set(s.name, HOME_REGS[hi++]);
        temps.add(s.name);
      }
    } else {
      checkExpr(s.expr, prog, temps, s.lineno, { allowLoad: true, phase: 'kernel' });
    }
  }
  return homes;
}

// ---------- 程式碼產生 ----------
function Emitter() {
  return {
    lines: [],
    emit(s) { this.lines.push(s); },
    insnCount() {
      // 標籤／註解／空行不計
      return this.lines.filter(l => {
        const t = l.trim();
        return t !== '' && !t.startsWith('#') && !t.endsWith(':');
      }).length;
    },
  };
}

// 常數乘法（shift-add 展開，不用 mul）：out = src * c。scratch 為可用暫存名陣列。
function mulConst(em, out, src, c, scratch, lineno) {
  if (c === 0) { em.emit(`        li      ${out}, 0`); return; }
  if (c === 1) { em.emit(`        addi    ${out}, ${src}, 0`); return; }
  if (c < 0) {
    mulConst(em, out, src, -c, scratch, lineno);
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
  if (T === undefined || U === undefined) err(lineno, '常數乘法暫存不足');
  const k0 = bits[0];
  em.emit(k0 === 0 ? `        addi    ${T}, ${src}, 0` : `        slli    ${T}, ${src}, ${k0}`);
  for (const k of bits.slice(1)) {
    em.emit(k === 0 ? `        addi    ${U}, ${src}, 0` : `        slli    ${U}, ${src}, ${k}`);
    em.emit(`        add     ${T}, ${T}, ${U}`);
  }
  em.emit(`        addi    ${out}, ${T}, 0`);
}

// 運算式求值 → 暫存器名。pool 為 scratch 分配器 {alloc(), free(r)}。
// mode：{t:'part', j}（分區展開，M[i] 位移 j*4）或 {t:'scalar'}（M[i] 取 0(ptr)）。
function evalExpr(em, prog, baseOf, homes, pool, node, mode, lineno) {
  switch (node.k) {
    case 'num': {
      const r = pool.alloc();
      em.emit(`        li      ${r}, ${node.v}`);
      return r;
    }
    case 'i': {
      const r = pool.alloc();
      em.emit(`        addi    ${r}, t5, 0`);
      return r;
    }
    case 'tid': {
      const r = pool.alloc();
      em.emit(`        addi    ${r}, t0, 0`);
      return r;
    }
    case 'name': return homes.get(node.n);
    case 'load': {
      const r = pool.alloc();
      if (mode.t === 'part') em.emit(`        lw      ${r}, ${mode.j * 4}(${baseOf(node.m)})`);
      else em.emit(`        lw      ${r}, 0(${baseOf(node.m)})`);
      return r;
    }
    case 'neg': {
      const a = evalExpr(em, prog, baseOf, homes, pool, node.x, mode, lineno);
      if (pool.owned(a)) {
        em.emit(`        sub     ${a}, x0, ${a}`);
        return a;
      }
      const r = pool.alloc();
      em.emit(`        sub     ${r}, x0, ${a}`);
      return r;
    }
    case 'bin': {
      if (node.op === '*') {
        const c = constVal(node.x, prog.params) !== null ? constVal(node.x, prog.params) : null;
        const d = constVal(node.y, prog.params) !== null ? constVal(node.y, prog.params) : null;
        if (c !== null && d !== null) {
          const r = pool.alloc();
          em.emit(`        li      ${r}, ${c * d}`);
          return r;
        }
        // 一邊常數：變數邊求值後 shift-add
        const varSide = c !== null ? node.y : node.x;
        const k = c !== null ? c : d;
        const a = evalExpr(em, prog, baseOf, homes, pool, varSide, mode, lineno);
        if (pool.owned(a)) {
          const extra = pool.peek(2);
          mulConst(em, a, a, k, extra, lineno);
          return a;
        }
        const r = pool.alloc();
        const extra = pool.peek(2, [r]);
        mulConst(em, r, a, k, extra, lineno);
        return r;
      }
      const a = evalExpr(em, prog, baseOf, homes, pool, node.x, mode, lineno);
      const b = evalExpr(em, prog, baseOf, homes, pool, node.y, mode, lineno);
      const op = node.op === '+' ? 'add' : 'sub';
      if (pool.owned(a)) {
        em.emit(`        ${op}     ${a}, ${a}, ${b}`);
        pool.free(b);
        return a;
      }
      if (pool.owned(b) && node.op === '+') {
        em.emit(`        ${op}     ${b}, ${a}, ${b}`);
        return b;
      }
      const r = pool.alloc();
      em.emit(`        ${op}     ${r}, ${a}, ${b}`);
      pool.free(b);
      return r;
    }
  }
}

function makePool() {
  const free = [...SCRATCH];
  const ownedSet = new Set();
  return {
    alloc() {
      if (free.length === 0) throw new Error('運算式太複雜（暫存不足）');
      const r = free.pop();
      ownedSet.add(r);
      return r;
    },
    free(r) {
      if (ownedSet.has(r)) { ownedSet.delete(r); free.push(r); }
    },
    owned(r) { return ownedSet.has(r); },
    // 偷看 n 個未分配暫存（供 mulConst 內部使用，不佔用）
    peek(n, exclude = []) {
      const out = free.filter(r => !exclude.includes(r)).slice(-n);
      return out;
    },
  };
}

export function compileKernel(src) {
  const prog = parseKernel(src);
  const homes = validate(prog);
  const em = Emitter();
  const E = prog.n / prog.lanes; // 每通道元素數
  const baseOf = (m) => BASE_REGS[prog.mems.findIndex(x => x.name === m)];

  em.emit(`# cu2rv 產生（自訂 DSL→riscvgpu 組語）：lanes=${prog.lanes} n=${prog.n}`);
  em.emit(`# 用法：node cli/rvasm.js <Name>.s → <Name>.hex，載入 riscvgpu 即跑`);
  em.emit(`        tid     t0`);
  em.emit(`        ntid    t1`);
  for (const m of prog.mems) em.emit(`        li      ${baseOf(m.name)}, 0x${m.addr.toString(16)}`);
  for (const [p, v] of Object.entries(prog.params)) em.emit(`        li      ${homes.get(p)}, ${v}`);
  // 各通道指標分區：base += tid*(E*4)，各通道寫連續 E 個字（同 prog.s 的 slli+add 撥開）
  em.emit(`        # --- 分區：我的指標 = 基址 + tid*${E * 4} ---`);
  mulConst(em, 't6', 't0', E * 4, ['s11', 's10'], 0);
  for (const m of prog.mems) em.emit(`        add     ${baseOf(m.name)}, ${baseOf(m.name)}, t6`);

  // --- init：分區展開 ---
  if (prog.init.length > 0) em.emit(`        # --- init（各通道寫自己的 ${E} 個元素） ---`);
  for (const s of prog.init) {
    for (let j = 0; j < E; j++) {
      const pool = makePool();
      if (j === 0) {
        const extra = pool.peek(2);
        mulConst(em, 't5', 't0', E, extra, s.lineno);
      } else {
        const extra = pool.peek(2);
        mulConst(em, 't5', 't0', E, extra, s.lineno);
        em.emit(`        addi    t5, t5, ${j}`);
      }
      const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'part', j }, s.lineno);
      em.emit(`        sw      ${r}, ${j * 4}(${baseOf(s.m)})`);
      pool.free(r);
    }
  }
  em.emit(`        barrier`);

  // --- kernel：分區展開（j 在外、敘述在內：暫存變數生命期不出當次 j） ---
  em.emit(`        # --- kernel（各通道算自己的 ${E} 個元素） ---`);
  for (let j = 0; j < E; j++) {
    for (const s of prog.kernel) {
      if (s.k === 'barrier') { if (j === 0) em.emit(`        barrier`); continue; }
      const pool = makePool();
      const extra = pool.peek(2);
      mulConst(em, 't5', 't0', E, extra, s.lineno);
      if (j !== 0) em.emit(`        addi    t5, t5, ${j}`);
      if (s.k === 'tmp') {
        const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'part', j }, s.lineno);
        em.emit(`        addi    ${homes.get(s.name)}, ${r}, 0`);
        pool.free(r);
      } else {
        const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'part', j }, s.lineno);
        em.emit(`        sw      ${r}, ${j * 4}(${baseOf(s.m)})`);
        pool.free(r);
      }
    }
  }
  em.emit(`        barrier`);

  // --- verify：只有 lane0，全 n 逐項重算比對 ---
  em.emit(`        # --- verify（僅 lane0；重算 kernel 比對，a0=錯誤數） ---`);
  em.emit(`        bne     t0, x0, QUIT`);
  em.emit(`        li      a0, 0`);
  // 基址重載（分區階段走訪後基址暫存器仍為原值，此處直接重設為保險）
  for (const m of prog.mems) em.emit(`        li      ${baseOf(m.name)}, 0x${m.addr.toString(16)}`);
  em.emit(`        li      t5, 0`);
  em.emit(`        li      t6, ${prog.n}`);
  em.emit(`VCHK:`);
  for (const s of prog.kernel) {
    if (s.k === 'barrier') continue; // verify 只有 lane0，barrier 會永等：跳過
    const pool = makePool();
    if (s.k === 'tmp') {
      const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'scalar' }, s.lineno);
      em.emit(`        addi    ${homes.get(s.name)}, ${r}, 0`);
      pool.free(r);
    } else {
      const r = evalExpr(em, prog, baseOf, homes, pool, s.expr, { t: 'scalar' }, s.lineno);
      const t = pool.alloc();
      em.emit(`        lw      ${t}, 0(${baseOf(s.m)})`);
      em.emit(`        bne     ${t}, ${r}, BAD`);
      pool.free(t);
      pool.free(r);
    }
  }
  for (const m of prog.mems) {
    // 只有 kernel 用到的 mem 才需走訪；統一推進最簡單且正確
    em.emit(`        addi    ${baseOf(m.name)}, ${baseOf(m.name)}, 4`);
  }
  em.emit(`        addi    t5, t5, 1`);
  em.emit(`        addi    t6, t6, -1`);
  em.emit(`        bne     t6, x0, VCHK`);
  em.emit(`        jal     x0, QUIT`);
  em.emit(`BAD:    addi    a0, a0, 1`);
  em.emit(`        jal     x0, VCHK_NEXT`);
  em.emit(`VCHK_NEXT:`);
  // BAD 之後仍要推進，否則無窮迴圈：重複推進段
  for (const m of prog.mems) {
    em.emit(`        addi    ${baseOf(m.name)}, ${baseOf(m.name)}, 4`);
  }
  em.emit(`        addi    t5, t5, 1`);
  em.emit(`        addi    t6, t6, -1`);
  em.emit(`        bne     t6, x0, VCHK`);
  em.emit(`QUIT:   li      a7, 10`);
  em.emit(`        ecall`);

  const count = em.insnCount();
  if (count > IMEM_LIMIT) {
    throw new Error(`產生指令 ${count} 條，超過 IMEM 上限 ${IMEM_LIMIT}（請縮小 n）`);
  }
  return { asm: em.lines.join('\n') + '\n' };
}
