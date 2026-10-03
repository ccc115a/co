// VM 文字行共用解析（lib/asm/vm2asm.js＋lib/riscv/vm2riscv.js 共用）
// 行為與原兩份內聯碼逐字一致；參數合法性檢查仍由各後端自理（兩邊規則不同：
// vm2asm 要求所有帶參數 2 的行皆為整數，vm2riscv 只要求 push/pop/function/call）。
// 本檔純 ESM、無 import，可被 tools/embed.js 直接綴合進瀏覽器。

export function trim(s) {
  let a = 0;
  let b = s.length;
  while (a < b && /\s/.test(s[a])) a += 1;
  while (b > a && /\s/.test(s[b - 1])) b -= 1;
  return s.slice(a, b);
}

export function removeComment(line) {
  const i = line.indexOf('//');
  return i >= 0 ? line.slice(0, i) : line;
}

/** 把已 trim 的非空行切成 { cmd, a1, a2, hasA2 }；a2 能轉整數就轉，否則留原文。 */
export function splitArgs(trimmed) {
  const parts = trimmed.split(/\s+/);
  return {
    cmd: parts[0],
    a1: parts[1] ?? '',
    a2: Number.isInteger(Number(parts[2])) && parts[2] !== undefined ? Number(parts[2]) : parts[2] ?? '',
    hasA2: parts[2] !== undefined,
  };
}

/** 取檔名部分（含副檔名；去副檔名／消毒由各後端自理）。 */
export function fileBase(fn) {
  const s = fn.replace(/\\/g, '/');
  return s.slice(s.lastIndexOf('/') + 1);
}
