// VM → RISC-V 組語翻譯器（對應 lib/asm/vm2asm.js 的 RV32 版本）
//
// 目標：riscv/_web_tools 的 rvasm（RV32I+M）＋ rvemu；只用兩邊都懂的子集：
//   真指令 add/sub/slt/sltiu/and/or/xor/xori/lw/sw/addi/lui/jal/jalr/beq/bne/mul/div/ecall，
//   偽指令 li/mv/j/jr/ret/call，指示 .text/.word，註解 `#`。
// 每行 VM 前加 `# ` 註解、多檔才寫 bootstrap、return label 用全域計數器（與 vm2asm 同慣例）。
// 多檔（bootstrap）模式下，`label/goto/if-goto` 標記加 `函式$` 前綴避免跨檔相撞。
//
// 暫存器／記憶體約定（rvemu 是統一編址、程式從 0 載入；資料區放固定位址避開程式）：
//   s1＝VM SP（byte 位址，初值 STACK_BASE，向上成長，每 push＋4）
//   s2＝LCL、s3＝ARG、s4＝THIS、s5＝THAT（byte 位址；THIS/THAT 同 Hack 存的是基址）
//   t0,t1,t2＝scratch；其餘暫存器不用。
//   temp 0..7 → TEMP_BASE＋4*i；static（第 k 個輸入檔的變數 i）→ STATIC_BASE＋k*STRIDE＋4*i。
//   真值沿用 Hack/Jack 慣例：true＝-1（0xffffffff）、false＝0。
//   整數語意為 32-bit（Hack 原生 16-bit；本鏈路小數值行為一致，大數 wrap 位寬不同）。
// 注意：只用「數字版」li（rvasm 對 `li rd, label` 的 pass1 佔位與 pass2 實際字數可能不一致，
//   小位址標籤會留下 0x00000000 非法字——故 return 地址走 ra 壓棧、static 走固定位址，
//   全程不出現符號版 li）。程式本體須小於 TEMP_BASE（28KB；noOS 課程程式約 1–2KB）。
//
// 函式呼叫沿用 Hack VM 幀格式（return/LCL/ARG/THIS/THAT＋ARG/LCL 重定位），
// return 地址是 jal 寫入 ra 後壓進 VM 堆疊保存，返回時 `jalr x0, 0(t1)`（不依賴 ra 當下值，
// 巢狀呼叫安全）。
// Math.multiply／Math.divide 內聯為 M 擴充 mul／div（Jack 小整數行為一致）；
// 其餘 OS 呼叫（Memory.*、String.*、Screen.* …）直接 throw（裁剪版 OS 以外尚不支援）。
//
// 注意：本檔包在 Vm2Rv 命名空間 IIFE 內——tools/embed.js 會把 lib/ 全部剝掉 import/export
// 拼進同一全域作用域，本檔的 translate/trim/scope 等與 lib/asm/vm2asm.js 同名，
// 不包起來會互相覆蓋（前例：tst.js 的 KEYWORDS 改名 TST_KEYWORDS）。

export const Vm2Rv = (() => {
const STACK_BASE = 0x10000;
const TEMP_BASE = 0x7000;
const STATIC_BASE = 0x8000;
const STATIC_STRIDE = 0x400; // 每檔 256 個 static（0x400 bytes）

let label_count = 0;
let return_count = 0;
let current_file = '';
let scope = false;
let cur_func = '';

const definedFuncs = new Set();
const calledFuncs = new Set();
const fileIndex = new Map(); // sanitized file -> 輸入順序 k（static 位址用）
const externalCalls = new Set(); // lenient 模式下未定義的 OS 呼叫（僅顯示用）
let lenient = false;

function trim(s) {
  let a = 0;
  let b = s.length;
  while (a < b && /\s/.test(s[a])) a += 1;
  while (b > a && /\s/.test(s[b - 1])) b -= 1;
  return s.slice(a, b);
}

function removeComment(line) {
  const i = line.indexOf('//');
  return i >= 0 ? line.slice(0, i) : line;
}

function sanFile(fn) {
  const s = fn.replace(/\\/g, '/');
  const base = s.slice(s.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '');
  const clean = base.replace(/[^A-Za-z0-9_]/g, '_') || 'File';
  return /^[0-9]/.test(clean) ? `F_${clean}` : clean;
}

function fileIdx(file) {
  let k = fileIndex.get(file);
  if (k === undefined) {
    k = fileIndex.size;
    fileIndex.set(file, k);
  }
  return k;
}

function staticAddr(file, i) {
  if (i > 255) throw new Error(`static 索引超出 0..255：${file} ${i}`);
  return STATIC_BASE + fileIdx(file) * STATIC_STRIDE + i * 4;
}

// ---- 堆疊原語（t0 持有值） ----
function emitPush(out) {
  out.push('sw t0, 0(s1)', 'addi s1, s1, 4');
}

function emitPopTo(out, reg) {
  out.push('addi s1, s1, -4', `lw ${reg}, 0(s1)`);
}

function writeArithmetic(out, command) {
  switch (command) {
    case 'add':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('add t0, t0, t1');
      emitPush(out);
      break;
    case 'sub':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('sub t0, t0, t1');
      emitPush(out);
      break;
    case 'neg':
      out.push('lw t0, -4(s1)', 'sub t0, x0, t0', 'sw t0, -4(s1)');
      break;
    case 'and':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('and t0, t0, t1');
      emitPush(out);
      break;
    case 'or':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('or t0, t0, t1');
      emitPush(out);
      break;
    case 'not':
      out.push('lw t0, -4(s1)', 'xori t0, t0, -1', 'sw t0, -4(s1)');
      break;
    case 'eq':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('sub t0, t0, t1', 'sltiu t0, t0, 1', 'sub t0, x0, t0');
      emitPush(out);
      break;
    case 'gt': // x > y ⟺ y < x（有號）
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('slt t0, t1, t0', 'sub t0, x0, t0');
      emitPush(out);
      break;
    case 'lt':
      emitPopTo(out, 't1');
      emitPopTo(out, 't0');
      out.push('slt t0, t0, t1', 'sub t0, x0, t0');
      emitPush(out);
      break;
    default:
      throw new Error(`不支援的運算指令：${command}`);
  }
}

const SEG_BASE = { local: 's2', argument: 's3', this: 's4', that: 's5' };

function writePush(out, segment, index) {
  if (!Number.isInteger(index) || index < 0) throw new Error(`push 索引須為非負整數：${segment} ${index}`);
  if (segment === 'constant') {
    out.push(`li t0, ${index}`);
    emitPush(out);
  } else if (segment === 'local' || segment === 'argument' || segment === 'this' || segment === 'that') {
    out.push(`li t1, ${index * 4}`, `add t1, ${SEG_BASE[segment]}, t1`, 'lw t0, 0(t1)');
    emitPush(out);
  } else if (segment === 'temp') {
    if (index > 7) throw new Error(`temp 索引超出 0..7：${index}`);
    out.push(`li t1, ${TEMP_BASE + index * 4}`, 'lw t0, 0(t1)');
    emitPush(out);
  } else if (segment === 'pointer') {
    if (index !== 0 && index !== 1) throw new Error(`pointer 索引須為 0 或 1：${index}`);
    out.push(index === 0 ? 'addi t0, s4, 0' : 'addi t0, s5, 0');
    emitPush(out);
  } else if (segment === 'static') {
    out.push(`li t1, ${staticAddr(current_file, index)}`, 'lw t0, 0(t1)');
    emitPush(out);
  } else {
    throw new Error(`不支援的 segment：${segment}`);
  }
}

function writePop(out, segment, index) {
  if (!Number.isInteger(index) || index < 0) throw new Error(`pop 索引須為非負整數：${segment} ${index}`);
  if (segment === 'local' || segment === 'argument' || segment === 'this' || segment === 'that') {
    out.push(`li t1, ${index * 4}`, `add t1, ${SEG_BASE[segment]}, t1`);
    emitPopTo(out, 't0');
    out.push('sw t0, 0(t1)');
  } else if (segment === 'temp') {
    if (index > 7) throw new Error(`temp 索引超出 0..7：${index}`);
    out.push(`li t1, ${TEMP_BASE + index * 4}`);
    emitPopTo(out, 't0');
    out.push('sw t0, 0(t1)');
  } else if (segment === 'pointer') {
    if (index !== 0 && index !== 1) throw new Error(`pointer 索引須為 0 或 1：${index}`);
    emitPopTo(out, 't0');
    out.push(index === 0 ? 'addi s4, t0, 0' : 'addi s5, t0, 0');
  } else if (segment === 'static') {
    out.push(`li t1, ${staticAddr(current_file, index)}`);
    emitPopTo(out, 't0');
    out.push('sw t0, 0(t1)');
  } else {
    throw new Error(`不支援的 segment：${segment}`);
  }
}

function labelName(arg) {
  return scope && cur_func !== '' ? `${cur_func}$${arg}` : arg;
}

function writeLabel(out, label) {
  out.push(`${labelName(label)}:`);
}

function writeGoto(out, label) {
  out.push(`jal x0, ${labelName(label)}`);
}

function writeIfGoto(out, label) {
  emitPopTo(out, 't0');
  out.push(`bne t0, x0, ${labelName(label)}`);
}

function writeFunction(out, funcName, numLocals) {
  if (!Number.isInteger(numLocals) || numLocals < 0) throw new Error(`function 區域變數數須為非負整數：${funcName} ${numLocals}`);
  definedFuncs.add(funcName);
  out.push(`${funcName}:`);
  // 呼叫者已留好 5 格幀（含 return 槽位 placeholder）；jal 寫入 ra 的正是返回位址，在此回填
  out.push('sw ra, -20(s2)');
  for (let i = 0; i < numLocals; i++) {
    out.push('li t0, 0');
    emitPush(out);
  }
}

function emitCallSeq(out, funcName) {
  const ret = `${funcName}$ret.${return_count++}`;
  // 依 Hack 幀格式壓 5 格：第 1 格是 return 槽位，先填 0，由被呼叫者 prologue 回填真正的 ra；
  // 接著壓 LCL/ARG/THIS/THAT（jal 會蓋掉 ra，故不能先 push ra——舊 ra 不是返回位址）
  out.push('li t0, 0');
  emitPush(out);
  for (const r of ['s2', 's3', 's4', 's5']) {
    out.push(`addi t0, ${r}, 0`);
    emitPush(out);
  }
  return ret;
}

function writeCall(out, funcName, numArgs) {
  if (!Number.isInteger(numArgs) || numArgs < 0) throw new Error(`call 參數數須為非負整數：${funcName} ${numArgs}`);
  // OS 內聯：Math.multiply／Math.divide 走 M 擴充，不產生呼叫
  if (funcName === 'Math.multiply' || funcName === 'Math.divide') {
    if (numArgs !== 2) throw new Error(`${funcName} 參數須為 2，得 ${numArgs}`);
    emitPopTo(out, 't1');
    emitPopTo(out, 't0');
    out.push(funcName === 'Math.multiply' ? 'mul t0, t0, t1' : 'div t0, t0, t1');
    emitPush(out);
    return;
  }
  if (/^(Math|Memory|String|Array|Screen|Keyboard|Output)\./.test(funcName)) {
    if (!lenient) {
      throw new Error(`不支援的 OS 呼叫（僅內聯 Math.multiply／Math.divide）：${funcName}`);
    }
    externalCalls.add(funcName); // 顯示模式：照發 jal，表頭列為外部未定義
  }
  calledFuncs.add(funcName);
  const ret = emitCallSeq(out, funcName);
  out.push(`li t0, ${numArgs * 4 + 20}`, 'sub s3, s1, t0', 'addi s2, s1, 0');
  out.push(`jal ra, ${funcName}`);
  out.push(`${ret}:`);
}

function writeReturn(out) {
  // t2＝FRAME（舊 LCL）；t1＝RET（FRAME-20，byte 位移＝5 words）
  out.push('addi t2, s2, 0', 'lw t1, -20(t2)');
  emitPopTo(out, 't0');
  out.push('sw t0, 0(s3)', 'addi s1, s3, 4');
  out.push('lw s5, -4(t2)', 'lw s4, -8(t2)', 'lw s3, -12(t2)', 'lw s2, -16(t2)');
  out.push('jalr x0, 0(t1)');
}

function writeBootstrap(out) {
  out.push('# Bootstrap code', `# Initialize VM SP = ${STACK_BASE} (0x${STACK_BASE.toString(16)})`);
  out.push(`li s1, ${STACK_BASE}`);
  out.push('# Call Sys.init');
  calledFuncs.add('Sys.init');
  const ret = emitCallSeq(out, 'Sys.init');
  out.push('li t0, 20', 'sub s3, s1, t0', 'addi s2, s1, 0');
  out.push('jal ra, Sys.init');
  out.push(`${ret}:`);
  out.push('# Halt (Sys.init 正常不返回；保險起見)');
  out.push('li a0, 0', 'li a7, 10', 'ecall');
}

function processCommand(out, cmd, a1, a2) {
  if (['add', 'sub', 'neg', 'eq', 'gt', 'lt', 'and', 'or', 'not'].includes(cmd)) {
    writeArithmetic(out, cmd);
  } else if (cmd === 'push') {
    writePush(out, a1, a2);
  } else if (cmd === 'pop') {
    writePop(out, a1, a2);
  } else if (cmd === 'label') {
    writeLabel(out, a1);
  } else if (cmd === 'goto') {
    writeGoto(out, a1);
  } else if (cmd === 'if-goto') {
    writeIfGoto(out, a1);
  } else if (cmd === 'function') {
    cur_func = a1;
    writeFunction(out, a1, a2);
  } else if (cmd === 'call') {
    writeCall(out, a1, a2);
  } else if (cmd === 'return') {
    writeReturn(out);
  } else {
    throw new Error(`不支援的 VM 指令：${cmd}`);
  }
}

function translateFile(out, filename, src) {
  current_file = sanFile(filename);
  out.push(`\n# ========== File: ${filename} ==========`);
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = removeComment(raw);
    const trimmed = trim(line);
    if (trimmed.length > 0) {
      out.push(`# ${trimmed}`);
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0];
      const a1 = parts[1] ?? '';
      const a2 = Number.isInteger(Number(parts[2])) && parts[2] !== undefined ? Number(parts[2]) : parts[2] ?? '';
      if ((cmd === 'push' || cmd === 'pop' || cmd === 'function' || cmd === 'call') && !Number.isInteger(a2)) {
        throw new Error(`參數 2 應為整數：${trimmed}`);
      }
      processCommand(out, cmd, a1, a2);
    }
  }
}

/** 翻譯多個 .vm 原始檔 → RISC-V 組語文字。files: [{ path, src }]，多檔時自動加 bootstrap。
 *  opts.lenient＝true 時為「顯示模式」：未定義的 OS 呼叫照發 jal 並列在表頭
 *  （僅供檢視，不可直接組譯執行）；預設嚴格模式直接 throw。 */
function translate(files, opts = {}) {
  label_count = 0;
  return_count = 0;
  scope = files.length > 1;
  cur_func = '';
  lenient = !!opts.lenient;
  definedFuncs.clear();
  calledFuncs.clear();
  externalCalls.clear();
  fileIndex.clear();
  const out = ['.text'];
  if (files.length > 1) writeBootstrap(out);
  for (const f of files) translateFile(out, f.path, f.src);
  if (!lenient) {
    for (const name of calledFuncs) {
      if (!definedFuncs.has(name)) throw new Error(`未定義函式：${name}（輸入 .vm 缺少對應 function，或屬尚未支援的 OS 呼叫）`);
    }
  } else if (externalCalls.size > 0) {
    out.splice(1, 0,
      '# 注意：以下外部呼叫無對應 function 定義，本 .s 僅供檢視，不可直接組譯執行：',
      ...[...externalCalls].sort().map((n) => `#   外部：${n}`));
  }
  return out.join('\n') + '\n';
}

return { translate, STACK_BASE, TEMP_BASE, STATIC_BASE, STATIC_STRIDE };
})();
