// `.tst` 測試腳本的解析與執行（對應 _eda/hackrt/src/tst.rs）
//
// 支援：load、output-file、compare-to、output-list、set、eval、tick、tock、
// output、repeat、while、echo、clear-echo、`<chip> load <file>`。
// 指令用 `,` 或 `;` 分隔；repeat/while 的區塊用 `{ }`。

import fs from 'node:fs';
import path from 'node:path';
import { OutField, dataLine, headerLine } from './fmt.js';

/** 腳位引用：Whole（無括號或 `[]`）｜ Bit(i)（`[i]`） */
export class PinRef {
  constructor(name, idx) {
    this.name = name;
    this.idx = idx; // { kind:'Whole' } | { kind:'Bit', i }
  }
  raw() {
    if (this.idx.kind === 'Whole') return this.name;
    return `${this.name}[${this.idx.i}]`;
  }
  static parse(s) {
    const open = s.indexOf('[');
    if (open >= 0) {
      const close = s.indexOf(']', open);
      const inner = s.slice(open + 1, close < 0 ? s.length : close).trim();
      let idx = { kind: 'Whole' };
      if (inner !== '') {
        const n = Number(inner);
        if (Number.isFinite(n)) idx = { kind: 'Bit', i: n };
      }
      return new PinRef(s.slice(0, open), idx);
    }
    return new PinRef(s, { kind: 'Whole' });
  }
}

/** 把 `%B..`、`%X..`、十進位（含負數）解析成 u16 */
export function parseVal(s) {
  const t = s.trim();
  if (t.startsWith('%B')) {
    const v = parseInt(t.slice(2), 2);
    return Number.isFinite(v) ? (v & 0xffff) : null;
  }
  if (t.startsWith('%X')) {
    const v = parseInt(t.slice(2), 16);
    return Number.isFinite(v) ? (v & 0xffff) : null;
  }
  const i = Number(t);
  if (!Number.isFinite(i)) return null;
  return ((i % 0x10000) + 0x10000) % 0x10000;
}

/** 原始掃描結果：文字區塊，`{`/`}` 各自成塊 */
const Raw = {};

/** 把來源切成 Raw 序列。`"..."` 字串會保留原樣，`,` `;` `{` `}` 都是分隔符 */
function lexRaw(src) {
  const out = [];
  let buf = '';
  let inStr = false;
  for (const c of src) {
    if (inStr) {
      buf += c;
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      buf += c;
      inStr = true;
      continue;
    }
    if (c === ',' || c === ';' || c === '{' || c === '}') {
      const t = buf.trim();
      if (t !== '') out.push({ kind: 'Text', s: t });
      buf = '';
      if (c === '{') out.push({ kind: 'Open' });
      if (c === '}') out.push({ kind: 'Close' });
      continue;
    }
    buf += c;
  }
  const t = buf.trim();
  if (t !== '') out.push({ kind: 'Text', s: t });
  return out;
}

/** 移除 `//` 行註解（保留 `"..."` 字串內的字元） */
function stripComments(src) {
  let out = '';
  let inStr = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === '"') inStr = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const TST_KEYWORDS = ['set', 'echo', 'repeat', 'while', 'eval', 'tick', 'tock',
  'output', 'clear-echo', 'compare-to', 'output-file', 'output-list', 'load'];

/** 把指令文字轉成 Step（block 給 repeat/while） */
function parseStepText(cmd, block) {
  cmd = cmd.trim().replace(/,+$/, '');
  if (cmd === '') return null;

  if (cmd.startsWith('repeat ')) {
    const n = Number(cmd.slice('repeat '.length).trim());
    if (!Number.isInteger(n) || n < 0) throw new Error(`repeat 數值錯誤：${cmd.slice(8)}`);
    if (!block) throw new Error('repeat 後面缺少 { ... }');
    return { type: 'Repeat', n, body: block };
  }

  if (cmd.startsWith('while ')) {
    if (!block) throw new Error('while 後面缺少 { ... }');
    const parts = cmd.slice('while '.length).trim().split(/\s+/);
    if (parts.length !== 3) throw new Error(`while 條件格式錯誤：${cmd.slice(6)}`);
    let op;
    if (parts[1] === '<>') op = 'Ne';
    else if (parts[1] === '=' || parts[1] === '==') op = 'Eq';
    else throw new Error(`不支援的 while 運算子: ${parts[1]}`);
    const val = parseVal(parts[2]);
    if (val === null) throw new Error(`while 值解析失敗：${parts[2]}`);
    return { type: 'While', name: parts[0], op, val, body: block, limit: 100_000 };
  }

  // `<chip> load <file>`：ROM32K load Add.hack
  const sp = cmd.indexOf(' load ');
  if (sp >= 0) {
    const prefix = cmd.slice(0, sp).trim();
    const first = cmd.split(/\s+/)[0] || '';
    const kw = TST_KEYWORDS;
    const file = cmd.slice(sp + ' load '.length).trim().replace(/,+$/, '');
    const chipOk = prefix !== '' && !/\s/.test(prefix) && prefix === first && !kw.includes(first);
    if (chipOk && file !== '') {
      return { type: 'LoadRom', file };
    }
  }

  switch (cmd) {
    case 'eval': return { type: 'Eval' };
    case 'tick': return { type: 'Tick' };
    case 'tock': return { type: 'Tock' };
    case 'output': return { type: 'Output' };
    case 'clear-echo': return { type: 'ClearEcho' };
  }
  if (cmd.startsWith('set ')) {
    const [pin, val] = parseSet(cmd.slice(4));
    return { type: 'Set', pin, val };
  }
  if (cmd.startsWith('echo')) {
    const s = cmd.slice(4).trim().replace(/^"|"$/g, '');
    return { type: 'Echo', msg: s };
  }
  throw new Error(`無法辨識的指令：${cmd}`);
}

function parseSet(rest) {
  rest = rest.trim();
  const sp = rest.search(/\s/);
  if (sp < 0) throw new Error(`set 格式錯誤：${rest}`);
  const pinname = rest.slice(0, sp);
  const valstr = rest.slice(sp);
  const val = parseVal(valstr);
  if (val === null) throw new Error(`set 值解析失敗：${valstr}`);
  return [PinRef.parse(pinname), val];
}

/** 從 index 開始解析指令序列。stopOnClose=true：遇到 `}` 就停止。 */
function parseSeq(raws, index, stopOnClose) {
  const steps = [];
  let i = index;
  while (i < raws.length) {
    const r = raws[i];
    if (r.kind === 'Open') throw new Error('意外的 {');
    if (r.kind === 'Close') {
      if (stopOnClose) return [steps, i + 1];
      throw new Error('意外的 }');
    }
    if (r.kind === 'Text') {
      const trimmed = r.s.trim();
      if (i + 1 < raws.length && raws[i + 1].kind === 'Open'
        && (trimmed.startsWith('repeat') || trimmed.startsWith('while'))) {
        const [block, next] = parseSeq(raws, i + 2, true);
        const step = parseStepText(trimmed, block);
        if (step) steps.push(step);
        i = next;
        continue;
      }
      const step = parseStepText(trimmed, null);
      if (step) steps.push(step);
      i += 1;
    }
  }
  if (stopOnClose) throw new Error('區塊沒有配對的 }');
  return [steps, i];
}

/** 解析 `output-list` 的文字內容（不含前綴） */
function parseOutputListFields(s) {
  const fields = [];
  let p = 0;
  while (p < s.length) {
    while (p < s.length && !/[A-Za-z0-9_]/.test(s[p])) p += 1;
    if (p >= s.length) break;
    const start = p;
    while (p < s.length && /[A-Za-z0-9_\[\]]/.test(s[p])) p += 1;
    const name = s.slice(start, p);
    if (p >= s.length || s[p] !== '%') {
      throw new Error(`output-list 欄位格式錯誤：${name}（缺 %）`);
    }
    p += 1;
    const kc = s[p].toUpperCase();
    const kind = kc === 'B' ? 'B' : kc === 'D' ? 'D' : kc === 'X' ? 'X' : kc === 'S' ? 'S'
      : (() => { throw new Error(`output-list 不支援的格式 ${kc}（${name}）`); })();
    p += 1;
    const readNum = () => {
      const st = p;
      while (p < s.length && /[0-9]/.test(s[p])) p += 1;
      const n = Number(s.slice(st, p));
      if (!Number.isFinite(n)) throw new Error('output-list 數字解析失敗');
      return n;
    };
    const a = readNum();
    if (p >= s.length || s[p] !== '.') throw new Error(`output-list ${name} 缺 a.b.c`);
    p += 1;
    const b = readNum();
    if (p >= s.length || s[p] !== '.') throw new Error(`output-list ${name} 缺 a.b.c`);
    p += 1;
    const c = readNum();
    if (p < s.length && s[p] === ',') p += 1;
    fields.push({ field: new OutField(name.trim(), kind, a, b, c), pin: PinRef.parse(name) });
  }
  if (fields.length === 0) throw new Error('output-list 沒有欄位');
  return fields;
}

/** 解析整個腳本 */
export function parseScript(src) {
  const raws = lexRaw(stripComments(src));
  const script = { load: null, outputFile: null, compareTo: null, outputList: [], romLoad: null, steps: [] };
  const steps = [];
  let i = 0;
  while (i < raws.length) {
    const r = raws[i];
    if (r.kind === 'Close') throw new Error('意外的 }');
    if (r.kind === 'Open') throw new Error('意外的 {');
    const trimmed = r.s.trim();
    if (trimmed.startsWith('output-list')) {
      script.outputList = parseOutputListFields(trimmed.slice('output-list'.length));
      i += 1;
      continue;
    }
    let handled = false;
    for (const kw of ['output-file', 'compare-to', 'load', 'rom-load']) {
      if (trimmed.startsWith(kw)) {
        let value = trimmed.slice(kw.length).trim().replace(/,+$/, '');
        if (kw === 'output-file') script.outputFile = value;
        else if (kw === 'compare-to') script.compareTo = value;
        else if (kw === 'load') { if (!value.endsWith('.tst')) script.load = value; }
        else if (kw === 'rom-load') script.romLoad = value;
        handled = true;
        break;
      }
    }
    if (handled) { i += 1; continue; }
    if (i + 1 < raws.length && raws[i + 1].kind === 'Open') {
      const [block, next] = parseSeq(raws, i + 2, true);
      const step = parseStepText(trimmed, block);
      if (step) steps.push(step);
      i = next;
      continue;
    }
    const [more, next] = parseSeq(raws, i, false);
    steps.push(...more);
    i = next;
  }
  script.steps = steps;
  return script;
}

export class RunErr extends Error {
  constructor(line, msg) {
    super(`第 ${line} 行：${msg}`);
    this.line = line;
    this.msg = msg;
  }
}

/**
 * 執行測試：`.out` 內容寫進 out，並依 output-file/compare-to 產檔與比對。
 * baseDir：腳本中所有相對路徑的基準。
 */
export function run(model, script, baseDir, out, verbose) {
  if (script.outputList.length > 0) {
    const fields = script.outputList.map((f) => f.field);
    out.push(headerLine(fields) + '\n');
  }
  if (verbose) console.error(`load ${script.load ?? '(none)'}`);
  if (script.romLoad) {
    model.loadRom(path.join(baseDir, script.romLoad));
  }
  const st = { cycle: 0, half: false };
  runSteps(model, script, script.steps, baseDir, out, st, verbose);
  if (script.outputFile) {
    const outPath = path.join(baseDir, script.outputFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, out.join(''));
    if (script.compareTo) {
      const cmpPath = path.join(baseDir, script.compareTo);
      reportCompare(outPath, cmpPath, verbose);
    }
  }
}

function runSteps(model, script, steps, baseDir, out, st, verbose) {
  for (const step of steps) {
    switch (step.type) {
      case 'Set': {
        if (!model.setInput(step.pin.raw(), step.val)) {
          throw new RunErr(0, `set 失敗：找不到輸入腳 ${step.pin.raw()}`);
        }
        break;
      }
      case 'LoadRom':
        model.loadRom(path.join(baseDir, step.file));
        break;
      case 'Eval':
        model.doEval();
        break;
      case 'Tick':
        model.tick();
        st.half = true;
        break;
      case 'Tock':
        model.tock();
        st.half = false;
        st.cycle += 1;
        break;
      case 'Output': {
        const timeStr = `${st.cycle}${st.half ? '+' : ''}`;
        if (script.outputList.length > 0) {
          const fields = script.outputList.map((f) => f.field);
          const line = dataLine(fields, timeStr, (n) => model.getOutput(n));
          out.push(line + '\n');
        }
        break;
      }
      case 'Repeat':
        for (let k = 0; k < step.n; k++) {
          runSteps(model, script, step.body, baseDir, out, st, verbose);
        }
        break;
      case 'While': {
        let iters = 0;
        for (;;) {
          const cur = model.getOutput(step.name) ?? 0;
          const matched = step.op === 'Ne' ? cur !== step.val : cur === step.val;
          if (!matched) break;
          iters += 1;
          if (iters > step.limit) {
            throw new RunErr(0, `while ${step.name} 迴圈次數超過上限 ${step.limit}`);
          }
          runSteps(model, script, step.body, baseDir, out, st, verbose);
        }
        break;
      }
      case 'Echo':
        if (verbose) console.error(step.msg);
        break;
      case 'ClearEcho':
        break;
    }
  }
}

/** 比對 .out 與 .cmp，把結果印到 stdout/stderr */
export function reportCompare(outPath, cmpPath, verbose) {
  const outText = fs.readFileSync(outPath, 'utf8');
  const cmpText = fs.readFileSync(cmpPath, 'utf8');
  const outLines = outText.split('\n');
  const cmpLines = cmpText.split('\n');
  // 檔尾換行與否無關內容：把兩邊最後的空串去除（Rust 用 lines() 也如此）
  while (outLines.length > 0 && outLines[outLines.length - 1] === '') outLines.pop();
  while (cmpLines.length > 0 && cmpLines[cmpLines.length - 1] === '') cmpLines.pop();
  let bad = 0;
  const n = Math.min(outLines.length, cmpLines.length);
  for (let i = 0; i < n; i++) {
    if (outLines[i].trimEnd() !== cmpLines[i].trimEnd()) {
      bad += 1;
      if (bad <= 5 || verbose) {
        console.error(`  第 ${i + 1} 行不符：`);
        console.error(`    out: ${JSON.stringify(outLines[i])}`);
        console.error(`    cmp: ${JSON.stringify(cmpLines[i])}`);
      }
    }
  }
  const lineMismatch = outLines.length !== cmpLines.length;
  if (lineMismatch) {
    console.error(`  行數不符：out=${outLines.length} cmp=${cmpLines.length}`);
  }
  if (bad === 0 && !lineMismatch) {
    console.log(`PASS ${cmpPath}`);
    return;
  }
  console.log(`FAIL ${cmpPath}（${Math.max(bad, 1)} 行不符）`);
  throw new RunErr(0, `與 ${cmpPath} 比對失敗`);
}