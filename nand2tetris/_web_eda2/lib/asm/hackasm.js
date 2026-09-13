// HACK 兩-pass 組譯器（對應 _eda/hackasm，oracle＝06/asm.cpp）
// .asm → { hack: 16 位元字串行, bin: Uint8Array（u16 LE）}
// 行為與 asm.cpp 一致：pass1 蒐集 (LABEL)→位址、pass2 編碼；
// 未定義符號（非內建）當變數從 RAM 16 起配。

export const D_MAP = {
  '': '000', M: '001', D: '010', MD: '011',
  A: '100', AM: '101', AD: '110', AMD: '111',
};

export const C_MAP = {
  0: '0101010', '1': '0111111', '-1': '0111010',
  D: '0001100', A: '0110000', '!D': '0001101',
  '!A': '0110001', '-D': '0001111', '-A': '0110011',
  'D+1': '0011111', 'A+1': '0110111', 'D-1': '0001110',
  'A-1': '0110010', 'D+A': '0000010', 'D-A': '0010011',
  'A-D': '0000111', 'D&A': '0000000', 'D|A': '0010101',
  M: '1110000', '!M': '1110001', '-M': '1110011',
  'M+1': '1110111', 'M-1': '1110010', 'D+M': '1000010',
  'D-M': '1010011', 'M-D': '1000111', 'D&M': '1000000',
  'D|M': '1010101',
};

export const J_MAP = {
  '': '000', JGT: '001', JEQ: '010', JGE: '011',
  JLT: '100', JNE: '101', JLE: '110', JMP: '111',
};

export const PREDEFINED = {
  R0: 0, R1: 1, R2: 2, R3: 3, R4: 4, R5: 5, R6: 6, R7: 7,
  R8: 8, R9: 9, R10: 10, R11: 11, R12: 12, R13: 13, R14: 14, R15: 15,
  SCREEN: 16384, KBD: 24576, SP: 0, LCL: 1, ARG: 2, THIS: 3, THAT: 4,
};

/** 去掉前導空白與註解（//…）、row 尾端 \r\n；回傳程式碼部分 */
export function parseAsmLine(line) {
  let code = line;
  let i = 0;
  while (i < code.length && (code[i] === ' ' || code[i] === '\t')) i += 1;
  code = code.slice(i);
  let end = code.indexOf('//');
  if (end < 0) end = code.length;
  return code.slice(0, end).trimEnd();
}

function int2bin(a, size) {
  let s = '';
  for (let i = size - 1; i >= 0; i--) s += ((a >> i) & 1) + '';
  return s;
}

/** 把一行《已去掉註解》的程式碼編成 16 位元字串；會用到 symMap/varTop */
export function code2binary(code, symMap, varState) {
  if (code[0] === '@') {
    const sym = code.slice(1);
    let address;
    if (/^\d+$/.test(sym)) {
      address = Number(sym);
    } else {
      if (symMap.has(sym)) {
        address = symMap.get(sym);
      } else {
        address = varState.next++;
        symMap.set(sym, address);
      }
    }
    return int2bin(address, 16);
  }
  // C 指令
  let d = '';
  let comp;
  let j = '';
  const eq = code.indexOf('=');
  if (eq >= 0) {
    d = code.slice(0, eq);
    comp = code.slice(eq + 1);
    const semi = comp.indexOf(';');
    if (semi >= 0) {
      j = comp.slice(semi + 1);
      comp = comp.slice(0, semi);
    }
  } else {
    const semi = code.indexOf(';');
    comp = semi >= 0 ? code.slice(0, semi) : code;
    j = semi >= 0 ? code.slice(semi + 1) : '';
  }
  const ccode = C_MAP[comp];
  const dcode = D_MAP[d];
  const jcode = J_MAP[j];
  if (ccode === undefined || dcode === undefined || jcode === undefined) {
    throw new Error(`無法編碼的 C 指令行：'${code}'`);
  }
  return `111${ccode}${dcode}${jcode}`;
}

/** 組譯整段 .asm 文字。回傳 { hack, bin }：hack=字串（每行 16 位元+換行）、bin=Uint8Array */
export function assemble(asmText) {
  // pass1：蒐集 labels
  const symMap = new Map(Object.entries(PREDEFINED));
  const lines = [];
  let address = 0;
  for (const raw of asmText.split('\n')) {
    const code = parseAsmLine(raw);
    if (code === '') continue;
    if (code[0] === '(') {
      const label = code.slice(1, code.indexOf(')'));
      if (symMap.has(label)) throw new Error(`重複定義 label：${label}`);
      symMap.set(label, address);
    } else {
      lines.push(code);
      address += 1;
    }
  }
  // pass2：編碼
  const varState = { next: 16 };
  const hackLines = lines.map((code) => code2binary(code, symMap, varState));
  const hack = hackLines.join('\n') + (hackLines.length > 0 ? '\n' : '');
  const bin = new Uint8Array(hackLines.length * 2);
  hackLines.forEach((bits, i) => {
    const v = parseInt(bits, 2) & 0xffff;
    bin[i * 2] = v & 0xff;
    bin[i * 2 + 1] = v >> 8;
  });
  return { hack, bin };
}