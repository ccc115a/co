// VM → HACK 組語翻譯器（oracle＝08/vm2asm.c，單檔 byte 相容）
// 每行 VM 前加 `// ` 註解、多檔才寫 bootstrap、return label 用全域計數器。
// 多檔（bootstrap）模式下，`label/goto/if-goto` 標記加 `函式$` 前綴避免跨檔相撞
// （跟上牌 _eda/vm2asm 一樣；C 版原樣輸出所以組不了多檔 OS）。

let label_count = 0;
let return_count = 0;
let current_file = '';
let scope = false;
let cur_func = '';

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

function writeArithmetic(out, command) {
  switch (command) {
    case 'add':
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'M=D+M');
      break;
    case 'sub':
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'M=M-D');
      break;
    case 'neg':
      out.push('@SP', 'A=M-1', 'M=-M');
      break;
    case 'and':
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'M=D&M');
      break;
    case 'or':
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'M=D|M');
      break;
    case 'not':
      out.push('@SP', 'A=M-1', 'M=!M');
      break;
    case 'eq':
    case 'gt':
    case 'lt': {
      const j = command === 'eq' ? 'JEQ' : command === 'gt' ? 'JGT' : 'JLT';
      out.push('@SP', 'AM=M-1', 'D=M', 'A=A-1', 'D=M-D');
      out.push(`@TRUE_${label_count}`, `D;${j}`);
      out.push('@SP', 'A=M-1', 'M=0');
      out.push(`@END_${label_count}`, '0;JMP');
      out.push(`(TRUE_${label_count})`, '@SP', 'A=M-1', 'M=-1');
      out.push(`(END_${label_count})`);
      label_count += 1;
      break;
    }
    default:
      throw new Error(`不支援的運算指令：${command}`);
  }
}

function writePush(out, segment, index) {
  if (segment === 'constant') {
    out.push(`@${index}`, 'D=A', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'local') {
    out.push(`@${index}`, 'D=A', '@LCL', 'A=D+M', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'argument') {
    out.push(`@${index}`, 'D=A', '@ARG', 'A=D+M', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'this') {
    out.push(`@${index}`, 'D=A', '@THIS', 'A=D+M', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'that') {
    out.push(`@${index}`, 'D=A', '@THAT', 'A=D+M', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'temp') {
    out.push(`@${5 + index}`, 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'pointer') {
    const ptr = index === 0 ? 'THIS' : 'THAT';
    out.push(`@${ptr}`, 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else if (segment === 'static') {
    out.push(`@${current_file}.${index}`, 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  } else {
    throw new Error(`不支援的 segment：${segment}`);
  }
}

function writePop(out, segment, index) {
  if (segment === 'local' || segment === 'argument' || segment === 'this' || segment === 'that') {
    const base = { local: 'LCL', argument: 'ARG', this: 'THIS', that: 'THAT' }[segment];
    out.push(`@${index}`, 'D=A', `@${base}`, 'D=D+M', '@R13', 'M=D');
    out.push('@SP', 'AM=M-1', 'D=M', '@R13', 'A=M', 'M=D');
  } else if (segment === 'temp') {
    out.push('@SP', 'AM=M-1', 'D=M', `@${5 + index}`, 'M=D');
  } else if (segment === 'pointer') {
    const ptr = index === 0 ? 'THIS' : 'THAT';
    out.push('@SP', 'AM=M-1', 'D=M', `@${ptr}`, 'M=D');
  } else if (segment === 'static') {
    out.push('@SP', 'AM=M-1', 'D=M', `@${current_file}.${index}`, 'M=D');
  } else {
    throw new Error(`不支援的 segment：${segment}`);
  }
}

function labelName(arg) {
  return scope && cur_func !== '' ? `${cur_func}$${arg}` : arg;
}

function writeLabel(out, label) {
  out.push(`(${labelName(label)})`);
}

function writeGoto(out, label) {
  out.push(`@${labelName(label)}`, '0;JMP');
}

function writeIfGoto(out, label) {
  out.push('@SP', 'AM=M-1', 'D=M', `@${labelName(label)}`, 'D;JNE');
}

function writeFunction(out, funcName, numLocals) {
  out.push(`(${funcName})`);
  for (let i = 0; i < numLocals; i++) {
    out.push('@SP', 'A=M', 'M=0', '@SP', 'M=M+1');
  }
}

function writeCall(out, funcName, numArgs) {
  const ret = `${funcName}$ret.${return_count++}`;
  out.push(`@${ret}`, 'D=A', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@LCL', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@ARG', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@THIS', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@THAT', 'D=M', '@SP', 'A=M', 'M=D', '@SP', 'M=M+1');
  out.push('@SP', 'D=M', '@5', 'D=D-A', `@${numArgs}`, 'D=D-A', '@ARG', 'M=D');
  out.push('@SP', 'D=M', '@LCL', 'M=D');
  out.push(`@${funcName}`, '0;JMP');
  out.push(`(${ret})`);
}

function writeReturn(out) {
  out.push('@LCL', 'D=M', '@R13', 'M=D');
  out.push('@5', 'A=D-A', 'D=M', '@R14', 'M=D');
  out.push('@SP', 'AM=M-1', 'D=M', '@ARG', 'A=M', 'M=D');
  out.push('@ARG', 'D=M+1', '@SP', 'M=D');
  out.push('@R13', 'AM=M-1', 'D=M', '@THAT', 'M=D');
  out.push('@R13', 'AM=M-1', 'D=M', '@THIS', 'M=D');
  out.push('@R13', 'AM=M-1', 'D=M', '@ARG', 'M=D');
  out.push('@R13', 'AM=M-1', 'D=M', '@LCL', 'M=D');
  out.push('@R14', 'A=M', '0;JMP');
}

function writeBootstrap(out) {
  out.push('// Bootstrap code', '// Initialize SP = 256');
  out.push('@256', 'D=A', '@SP', 'M=D');
  out.push('// Call Sys.init');
  writeCall(out, 'Sys.init', 0);
}

function basename(fn) {
  const s = fn.replace(/\\/g, '/');
  return s.slice(s.lastIndexOf('/') + 1);
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
  const base = basename(filename);
  let dot = base.lastIndexOf('.');
  if (dot < 0) dot = base.length;
  current_file = base.slice(0, dot);

  out.push(`\n// ========== File: ${filename} ==========`);
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = removeComment(raw);
    const trimmed = trim(line);
    if (trimmed.length > 0) {
      out.push(`// ${trimmed}`);
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0];
      const a1 = parts[1] ?? '';
      const a2 = Number.isInteger(Number(parts[2])) && parts[2] !== undefined ? Number(parts[2]) : parts[2] ?? '';
      if (!Number.isInteger(a2) && parts[2] !== undefined) throw new Error(`參數 2 應為整數：${trimmed}`);
      processCommand(out, cmd, a1, a2);
    }
  }
}

/** 翻譯多個 .vm 原始檔 → .asm 文字。files: [{ path, src }]，多檔時自動加 bootstrap。 */
export function translate(files) {
  label_count = 0;
  return_count = 0;
  scope = files.length > 1;
  cur_func = '';
  const out = [];
  if (files.length > 1) writeBootstrap(out);
  for (const f of files) translateFile(out, f.path, f.src);
  return out.join('\n') + '\n';
}