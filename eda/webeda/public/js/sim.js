// 閘階層（gate-level）Verilog 網列模擬器：吃 yosys write_json 輸出的
// 已映射網列（proc; flatten; memory_map; async2sync; techmap; simplemap 之後），
// 以事件驅動方式模擬，輸出每一步的訊號歷史（供波形檢視）與 VCD。
// 三值邏輯：0, 1, 2(=x)。

export const X = 2;

function not3(a) { return a === X ? X : 1 - a; }
function and3(a, b) { return (a === 0 || b === 0) ? 0 : (a === X || b === X) ? X : 1; }
function or3(a, b) { return (a === 1 || b === 1) ? 1 : (a === X || b === X) ? X : 0; }
function xor3(a, b) { return (a === X || b === X) ? X : a ^ b; }

// 把 yosys JSON 的 bits 陣列展開成每個 bit 一個項目：
//   數字 → { net: id }；字串（長度 1 或多）→ { const: 0|1|2 }
function resolveBits(bits) {
  const out = [];
  for (const el of bits) {
    if (typeof el === 'number') out.push({ net: el });
    else if (typeof el === 'string') {
      for (const ch of el) out.push({ const: ch === '0' ? 0 : ch === '1' ? 1 : X });
    } else out.push({ const: X });
  }
  return out;
}

function readBit(src, val) {
  return src.net !== undefined ? val[src.net] : src.const;
}

// 組合邏輯 cell 的求值器；回傳 null 表示不是組合邏輯
function makeEvaluator(type, conns, resolve) {
  const get = (name) => resolve(conns[name] || []);
  const one = (name) => {
    const r = get(name);
    if (r.length !== 1) throw new Error(`${type} 的 ${name} 寬度不是 1`);
    return r[0];
  };
  const outs = (name) => resolve(conns[name] || []);
  switch (type) {
    case '$_BUF_': { const A = one('A'), Y = outs('Y');
      return { in: ['A'], run: (v) => [[Y[0].net, readBit(A, v)]] }; }
    case '$_NOT_': { const A = one('A'), Y = outs('Y');
      return { in: ['A'], run: (v) => [[Y[0].net, not3(readBit(A, v))]] }; }
    case '$_AND_': case '$_NAND_': case '$_OR_': case '$_NOR_':
    case '$_XOR_': case '$_XNOR_': case '$_ANDNOT_': case '$_ORNOT_': {
      const A = one('A'), B = one('B'), Y = outs('Y');
      return { in: ['A', 'B'], run: (v) => {
        const a = readBit(A, v), b = readBit(B, v);
        let r;
        if (type === '$_AND_' || type === '$_NAND_' || type === '$_ANDNOT_') r = and3(a, type === '$_ANDNOT_' ? not3(b) : b);
        else if (type === '$_OR_' || type === '$_NOR_' || type === '$_ORNOT_') r = or3(a, type === '$_ORNOT_' ? not3(b) : b);
        else r = xor3(a, b);
        if (type === '$_NAND_' || type === '$_NOR_' || type === '$_XNOR_') r = not3(r);
        return [[Y[0].net, r]];
      } };
    }
    case '$_MUX_': case '$_NMUX_': { const A = one('A'), B = one('B'), S = one('S'), Y = outs('Y');
      return { in: ['A', 'B', 'S'], run: (v) => {
        const s = readBit(S, v), a = readBit(A, v), b = readBit(B, v);
        let r = s === X ? (a === b ? a : X) : (s ? b : a);
        if (type === '$_NMUX_') r = not3(r);
        return [[Y[0].net, r]];
      } }; }
    case '$_AOI3_': case '$_OAI3_': { const A = one('A'), B = one('B'), C = one('C'), Y = outs('Y');
      return { in: ['A', 'B', 'C'], run: (v) => {
        const a = readBit(A, v), b = readBit(B, v), c = readBit(C, v);
        return [[Y[0].net, type === '$_AOI3_' ? not3(or3(and3(a, b), c)) : not3(and3(or3(a, b), c))]];
      } }; }
    case '$_AOI4_': case '$_OAI4_': { const A = one('A'), B = one('B'), C = one('C'), D = one('D'), Y = outs('Y');
      return { in: ['A', 'B', 'C', 'D'], run: (v) => {
        const a = readBit(A, v), b = readBit(B, v), c = readBit(C, v), d = readBit(D, v);
        return [[Y[0].net, type === '$_AOI4_' ? not3(or3(and3(a, b), and3(c, d))) : not3(and3(or3(a, b), or3(c, d)))]];
      } }; }
    case '$_TBUF_': { const A = one('A'), E = one('E'), Y = outs('Y');
      return { in: ['A', 'E'], run: (v) => [[Y[0].net, readBit(E, v) ? readBit(A, v) : X]] }; }
    default: return null;
  }
}

// 正反器語意；回傳 { kind:'ff'|'ff+sr', clk, clkPol, q, next(v,q) }，
// 或 { kind:'latch'|'sr', q, run(v) }（連續動作），或 null
function makeFlop(type, conns, resolve) {
  const get = (name) => resolve(conns[name] || []);
  const one = (name) => {
    const r = get(name);
    if (r.length !== 1) throw new Error(`${type} 的 ${name} 寬度不是 1`);
    return r[0];
  };
  const starts = (p) => type.startsWith(p);
  const is = (t) => type === t;
  if (is('$_DFF_P_') || is('$_DFF_N_')) {
    const C = one('C'), D = one('D'), Q = one('Q');
    return { kind: 'ff', clk: C.net, clkPol: type[6] === 'P', q: Q.net, in: ['D'], next: (v) => [[Q.net, readBit(D, v)]] };
  }
  if (starts('$_DFFE_')) { // $_DFFE_PP_
    const C = one('C'), D = one('D'), E = one('E'), Q = one('Q');
    const clkPol = type[7] === 'P', enPol = type[8] === 'P';
    return { kind: 'ff', clk: C.net, clkPol, q: Q.net, in: ['D', 'E'], next: (v, q) => {
      const e = readBit(E, v);
      const en = e === X ? X : e === (enPol ? 1 : 0);
      return [[Q.net, en === X ? X : en ? readBit(D, v) : q]];
    } };
  }
  if (starts('$_DFFSR_')) { // $_DFFSR_PPP_（S/R 非同步）
    const C = one('C'), D = one('D'), S = one('S'), R = one('R'), Q = one('Q');
    const clkPol = type[8] === 'P', sPol = type[9] === 'P', rPol = type[10] === 'P';
    return { kind: 'ff+sr', clk: C.net, clkPol, q: Q.net, s: S.net, sPol, r: R.net, rPol, in: ['D', 'S', 'R'],
      next: (v) => {
        const s = readBit(S, v) === (sPol ? 1 : 0), r = readBit(R, v) === (rPol ? 1 : 0);
        return [[Q.net, s ? 1 : r ? 0 : readBit(D, v)]];
      } };
  }
  if (starts('$_SDFFE_')) { // $_SDFFE_PP0P_（同步重置，重置優先）
    const C = one('C'), D = one('D'), R = one('R'), E = one('E'), Q = one('Q');
    const clkPol = type[8] === 'P', rPol = type[9] === 'P', rstVal = type[10] === '1' ? 1 : 0, enPol = type[11] === 'P';
    return { kind: 'ff', clk: C.net, clkPol, q: Q.net, in: ['D', 'R', 'E'], next: (v, q) => {
      if (readBit(R, v) === (rPol ? 1 : 0)) return [[Q.net, rstVal]];
      const e = readBit(E, v);
      const en = e === X ? X : e === (enPol ? 1 : 0);
      return [[Q.net, en === X ? X : en ? readBit(D, v) : q]];
    } };
  }
  if (starts('$_SDFFCE_')) { // $_SDFFCE_PP0P_（使能優先於同步重置）
    const C = one('C'), D = one('D'), R = one('R'), E = one('E'), Q = one('Q');
    const clkPol = type[9] === 'P', rPol = type[10] === 'P', rstVal = type[11] === '1' ? 1 : 0, enPol = type[12] === 'P';
    return { kind: 'ff', clk: C.net, clkPol, q: Q.net, in: ['D', 'R', 'E'], next: (v, q) => {
      const e = readBit(E, v);
      const en = e === X ? X : e === (enPol ? 1 : 0);
      if (en !== 1) return [[Q.net, q]];
      if (readBit(R, v) === (rPol ? 1 : 0)) return [[Q.net, rstVal]];
      return [[Q.net, readBit(D, v)]];
    } };
  }
  if (starts('$_SDFF_')) { // $_SDFF_PP0_（同步重置）
    const C = one('C'), D = one('D'), R = one('R'), Q = one('Q');
    const clkPol = type[7] === 'P', rPol = type[8] === 'P', rstVal = type[9] === '1' ? 1 : 0;
    return { kind: 'ff', clk: C.net, clkPol, q: Q.net, in: ['D', 'R'], next: (v) => {
      const r = readBit(R, v) === (rPol ? 1 : 0);
      return [[Q.net, r ? rstVal : readBit(D, v)]];
    } };
  }
  if (starts('$_DLATCH_')) { // $_DLATCH_P_（透明閂）
    const D = one('D'), E = one('E'), Q = one('Q');
    const ePol = type[9] === 'P';
    return { kind: 'latch', q: Q.net, in: ['D', 'E'], run: (v) => {
      const e = readBit(E, v);
      const en = e === X ? X : e === (ePol ? 1 : 0);
      return en === 1 ? [[Q.net, readBit(D, v)]] : [];
    } };
  }
  if (starts('$_SR_')) { // $_SR_PP_（非同步 set/reset，R 優先）
    const S = one('S'), R = one('R'), Q = one('Q');
    const sPol = type[5] === 'P', rPol = type[6] === 'P';
    return { kind: 'sr', q: Q.net, in: ['S', 'R'], run: (v) => {
      const s = readBit(S, v) === (sPol ? 1 : 0), r = readBit(R, v) === (rPol ? 1 : 0);
      return (s || r) ? [[Q.net, r ? 0 : 1]] : [];
    } };
  }
  return null;
}

export function runSimulation(netlistJson, opts) {
  const { top, steps = 100, stimuli = {}, showInternal = true, initFFs = 'x' } = opts;
  const warnings = [];

  const modNames = Object.keys(netlistJson.modules || {});
  if (!modNames.length) throw new Error('網列中沒有任何模組');
  let mod = netlistJson.modules[top];
  if (!mod) {
    mod = netlistJson.modules[modNames[0]];
    warnings.push(`找不到模組 ${top}，改用 ${modNames[0]}`);
  } else if (modNames.length > 1) {
    warnings.push(`網列含多個模組（${modNames.join(', ')}），僅模擬 ${top}`);
  }

  // ---- 收集 nets ----
  let maxNet = 0;
  const collect = (bits) => { for (const b of bits) if (typeof b === 'number' && b > maxNet) maxNet = b; };
  for (const p of Object.values(mod.ports || {})) collect(p.bits);
  for (const c of Object.values(mod.cells || {})) for (const bits of Object.values(c.connections)) collect(bits);
  const numNets = maxNet + 1;
  const val = new Uint8Array(numNets).fill(initFFs === 'zero' ? 0 : X);
  const prevClk = new Uint8Array(numNets).fill(X);

  const resolve = (bits) => resolveBits(bits);
  const ports = mod.ports || {};
  const inputPorts = [];
  for (const [name, p] of Object.entries(ports)) {
    if (p.direction === 'input') inputPorts.push({ name, rbits: resolve(p.bits) });
  }

  // ---- 建立 cells ----
  const combCells = [];   // { name, ev:{in,run}, inNets }
  const ffCells = [];     // 時脈驅動
  const asyncCells = [];  // latch / sr（連續動作，併入組合收斂迴圈）
  const skipped = new Set(['$scopeinfo', '$assert', '$assume', '$cover', '$specify2', '$specify3', '$specrule']);
  const OUTPUT_PORTS = new Set(['Y', 'Q']);

  for (const [cname, c] of Object.entries(mod.cells || {})) {
    if (skipped.has(c.type)) continue;
    const inNets = [];
    for (const [port, bits] of Object.entries(c.connections)) {
      if (OUTPUT_PORTS.has(port)) continue;
      for (const b of resolve(bits)) if (b.net !== undefined) inNets.push(b.net);
    }
    try {
      const ev = makeEvaluator(c.type, c.connections, resolve);
      if (ev) { combCells.push({ name: cname, ev, inNets }); continue; }
      const ff = makeFlop(c.type, c.connections, resolve);
      if (ff) {
        if (ff.kind === 'latch' || ff.kind === 'sr') asyncCells.push({ name: cname, ...ff });
        else ffCells.push({ name: cname, ...ff });
        continue;
      }
    } catch (e) {
      warnings.push(`cell ${cname}（${c.type}）建立失敗: ${e.message}`);
      continue;
    }
    warnings.push(`不支援的 cell 類型 ${c.type}（cell: ${cname}），其輸出將為 x`);
  }

  // 讀取者索引：net → 依賴它的 cell
  const readerMap = Array.from({ length: numNets }, () => []);
  for (const cell of [...combCells, ...asyncCells]) {
    for (const n of new Set(cell.inNets)) readerMap[n].push(cell);
  }

  // ---- 事件驅動收斂 ----
  const worklist = [];
  const inWork = new Set();
  const pushCell = (cell) => { if (cell && !inWork.has(cell)) { inWork.add(cell); worklist.push(cell); } };
  const pushReaders = (net) => { for (const cell of readerMap[net]) pushCell(cell); };

  function settle() {
    let budget = combCells.length * 40 + asyncCells.length * 40 + 20000;
    while (worklist.length) {
      if (budget-- <= 0) {
        warnings.push('組合邏輯收斂失敗（可能有組合迴圈或規模過大），結果可能不正確');
        break;
      }
      const cell = worklist.pop();
      inWork.delete(cell);
      let changes;
      try { changes = cell.ev.run(val); }
      catch (e) { warnings.push(`cell ${cell.name} 求值失敗: ${e.message}`); continue; }
      for (const [net, nv] of changes) {
        if (net === undefined || val[net] === nv) continue;
        val[net] = nv;
        pushReaders(net);
      }
    }
    worklist.length = 0; inWork.clear();
  }

  // ---- 激勵 ----
  function applyStimulus(step) {
    for (const port of inputPorts) {
      const st = stimuli[port.name];
      if (!st) continue;
      const width = port.rbits.length;
      let bitVals;
      if (st.mode === 'clock') {
        const half = Math.max(1, st.half | 0);
        bitVals = [Math.floor(step / half) % 2];
      } else if (st.mode === 'seq') {
        const seq = st.seq && st.seq.length ? st.seq : [0];
        const sv = BigInt(seq[Math.min(step, seq.length - 1)] || 0);
        bitVals = [];
        for (let i = 0; i < width; i++) bitVals.push(Number((sv >> BigInt(i)) & 1n));
      } else { // const
        const v = BigInt(st.value ?? 0);
        bitVals = [];
        for (let i = 0; i < width; i++) bitVals.push(Number((v >> BigInt(i)) & 1n));
      }
      port.rbits.forEach((src, i) => {
        if (src.net === undefined) return;
        const nv = i < bitVals.length ? bitVals[i] : 0;
        if (val[src.net] !== nv) { val[src.net] = nv; pushReaders(src.net); }
      });
    }
  }

  // ---- 時脈邊緣 → 更新正反器 ----
  function clockEdges() {
    let any = false;
    const edgeCells = [];
    for (const cell of ffCells) {
      const cur = val[cell.clk], prev = prevClk[cell.clk];
      const active = cell.clkPol ? (prev === 0 && cur === 1) : (prev === 1 && cur === 0);
      if (active) edgeCells.push(cell);
    }
    const clkNets = new Set(ffCells.map(c => c.clk));
    for (const n of clkNets) prevClk[n] = val[n];
    for (const cell of edgeCells) {
      for (const [net, nv] of cell.next(val, val[cell.q])) {
        if (net === undefined || val[net] === nv) continue;
        val[net] = nv;
        any = true;
        pushReaders(net);
      }
    }
    return any;
  }

  // $_DFFSR_ 的非同步 S/R：隨時生效
  function asyncSrPoll() {
    for (const cell of ffCells) {
      if (cell.kind !== 'ff+sr') continue;
      const s = val[cell.s] === (cell.sPol ? 1 : 0), r = val[cell.r] === (cell.rPol ? 1 : 0);
      const target = s ? 1 : r ? 0 : null;
      if (target !== null && val[cell.q] !== target) {
        val[cell.q] = target;
        pushReaders(cell.q);
      }
    }
  }

  // ---- 觀察訊號 ----
  const signals = [];
  const seenNets = new Set();
  function addSignal(name, rbits, isPort, direction) {
    if (!rbits.length || rbits.length > 64) return false;
    const nets = rbits.map(b => b.net !== undefined ? b.net : null);
    if (nets.every(n => n === null)) return false; // 全常數，不必看
    if (nets.some(n => n !== null && seenNets.has(n))) return false;
    nets.forEach(n => { if (n !== null) seenNets.add(n); });
    signals.push({ name, width: rbits.length, isPort, direction, rbits, values: [] });
    return true;
  }
  for (const [name, p] of Object.entries(ports)) addSignal(name, resolve(p.bits), true, p.direction);
  if (showInternal) {
    for (const [name, nn] of Object.entries(mod.netnames || {})) {
      if (signals.length >= 400) break;
      if (name.startsWith('$') || nn.hide_name) continue;
      addSignal(name, resolve(nn.bits), false, undefined);
    }
  }

  function sample() {
    for (const sig of signals) {
      if (sig.width === 1) {
        const b = sig.rbits[0];
        sig.values.push(b.net !== undefined ? val[b.net] : b.const);
      } else {
        let v = 0n, hasX = false;
        for (let i = 0; i < sig.rbits.length; i++) {
          const b = sig.rbits[i];
          const bit = b.net !== undefined ? val[b.net] : b.const;
          if (bit === X) { hasX = true; break; }
          if (bit) v |= 1n << BigInt(i);
        }
        sig.values.push(hasX ? 'x' : v);
      }
    }
  }

  // ---- 主迴圈 ----
  for (const cell of [...combCells, ...asyncCells]) pushCell(cell); // 起始先全評一遍
  applyStimulus(0);
  settle();
  sample();
  const N = Math.max(1, steps | 0);
  for (let step = 1; step <= N; step++) {
    applyStimulus(step);
    settle();
    if (clockEdges()) settle();
    asyncSrPoll();
    sample();
  }

  return { ok: true, warnings: [...new Set(warnings)], signals, steps: N };
}

// 產生 VCD（value change dump）文字
export function writeVCD(result, { moduleName = 'top' } = {}) {
  const lines = [];
  lines.push('$date now $end');
  lines.push('$version WebEDA gate-level simulation $end');
  lines.push('$timescale 1ns $end');
  lines.push(`$scope module ${moduleName} $end`);
  const idOf = new Map();
  const idStr = (i) => {
    let s = '', n = i;
    do { s += String.fromCharCode(33 + (n % 94)); n = Math.floor(n / 94) - 1; } while (n >= 0);
    return s;
  };
  let nextId = 0;
  const fmt = (sig, v) => sig.width === 1
    ? `${v === 'x' ? 'x' : v}${idOf.get(sig)}`
    : `b${v === 'x' ? 'x'.repeat(sig.width) : v.toString(2).padStart(sig.width, '0')} ${idOf.get(sig)}`;
  for (const sig of result.signals) {
    const id = idStr(nextId++);
    idOf.set(sig, id);
    lines.push(`$var wire ${sig.width} ${id} ${sig.name.replace(/\$/g, '_')} $end`);
  }
  lines.push('$upscope $end');
  lines.push('$enddefinitions $end');
  for (const sig of result.signals) lines.push(fmt(sig, sig.values[0]));
  for (let t = 1; t < result.steps + 1; t++) {
    const body = [];
    for (const sig of result.signals) {
      const prev = sig.values[t - 1], cur = sig.values[t];
      if (prev !== cur) body.push(fmt(sig, cur));
    }
    if (body.length) { lines.push(`#${t}`); lines.push(...body); }
  }
  return lines.join('\n') + '\n';
}
