// CLI 共用小件（P5）：用法報錯一律 exit 1；`--dump A,B` 位址解析
// （十進位／0x 十六進位皆可，可重複）。cli/ 不進瀏覽器 bundle，可直接 import。
// 訊息格式沿用 riscv_run 原文，兩邊共用後逐字一致。
export function usageError(msg) {
  console.error(msg);
  process.exit(1);
}

/** 取選項值；缺值即用法報錯（原 hackemu 會吞掉變 NaN）。 */
export function needVal(args, i, opt) {
  if (i + 1 >= args.length) usageError(`錯誤：${opt} 缺少數值`);
  return args[i + 1];
}

/** 非負整數（`Number()` 語意，十進位與 0x 十六進位皆可）。 */
export function parseNonNeg(s) {
  const v = Number(s);
  if (!Number.isInteger(v) || v < 0) usageError(`錯誤：'${s}' 需為非負整數（可 0x 十六進位）`);
  return v;
}

/** `--dump A,B` → [a, b]。 */
export function parseRange(s) {
  const toks = String(s).split(',');
  if (toks.length !== 2) usageError(`錯誤：--dump 格式為 A,B：${s}`);
  return [parseNonNeg(toks[0]), parseNonNeg(toks[1])];
}

/** `--max N` → 正整數（沿用 riscv_run 的兩段式報錯）。 */
export function parseMax(s) {
  const v = parseNonNeg(s);
  if (v <= 0) usageError('錯誤：--max 需為正整數');
  return v;
}
