#!/bin/bash
# gpu_examples.sh — 完整鏈路實跑：.ku → cu2rv → .s → rvasm → .hex → iverilog＋vvp
#
#   riscv/gpu_examples.sh [kernel...]
#
# 不帶參數時跑全部 kernels/*.ku；也可只跑指定的（不含副檔名），例如：
#   riscv/gpu_examples.sh vecadd saxpy
#
# 判定標準：
#   vecadd      testbench 黃金值完全一致，須出現 ^PASS
#   saxpy/relu/sum/tiny
#               testbench 黃金值是按 vecadd 寫死的，陣列不符是預期的；
#               只看有無 done＋有無「lane0 a0」FAIL（a0=0 即語意正確）
#
# repo 保證：prog.hex 先備份、結束自動還原；中間檔全放 mktemp，不留痕跡。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
WEB="$ROOT/_web_tools"
GPU="$ROOT/_verilog/riscvgpu"
TMP="$(mktemp -d)"
ORIG_HEX="$TMP/prog.hex.orig"

command -v node >/dev/null || { echo "缺 node" >&2; exit 1; }
command -v iverilog >/dev/null || { echo "缺 iverilog" >&2; exit 1; }

cp "$GPU/prog.hex" "$ORIG_HEX"
cleanup() {
  cp "$ORIG_HEX" "$GPU/prog.hex"   # 還原 repo 的 prog.hex
  rm -rf "$TMP"
}
trap cleanup EXIT

if [ "$#" -gt 0 ]; then
  KERNELS="$*"
else
  KERNELS="vecadd saxpy relu sum tiny"
fi

PASS_N=0
FAIL_N=0
FAILED=""

for k in $KERNELS; do
  echo "=== $k ==="
  ku="$WEB/kernels/$k.ku"
  [ -f "$ku" ] || { echo "找不到 $ku"; FAIL_N=$((FAIL_N + 1)); FAILED="$FAILED $k(缺檔)"; continue; }

  node "$WEB/cli/cu2rv.js" "$ku" -o "$TMP/$k.s" || { echo "cu2rv 失敗"; FAIL_N=$((FAIL_N + 1)); FAILED="$FAILED $k(cu2rv)"; continue; }
  node "$WEB/cli/rvasm.js" "$TMP/$k.s" || { echo "rvasm 失敗"; FAIL_N=$((FAIL_N + 1)); FAILED="$FAILED $k(rvasm)"; continue; }
  cp "$TMP/$k.hex" "$GPU/prog.hex"

  ( cd "$GPU" && iverilog -o "$TMP/sim" riscvgpu_test.v riscvgpu.v lane.v alu.v control.v immgen.v regfile.v ) \
    || { echo "iverilog 失敗"; FAIL_N=$((FAIL_N + 1)); FAILED="$FAILED $k(iverilog)"; continue; }
  ( cd "$GPU" && vvp "$TMP/sim" > "$TMP/$k.log" 2>&1 )
  grep -E '^(done|PASS|FAIL)' "$TMP/$k.log"

  if [ "$k" = "vecadd" ]; then
    if grep -q '^PASS' "$TMP/$k.log"; then
      echo "PASS: ${k}"; PASS_N=$((PASS_N + 1))
    else
      echo "FAIL: ${k}"; FAIL_N=$((FAIL_N + 1)); FAILED="$FAILED ${k}"
    fi
  else
    if grep -q '^done' "$TMP/$k.log" && ! grep -q 'lane0 a0' "$TMP/$k.log"; then
      echo "PASS: ${k} (done+a0=0)"; PASS_N=$((PASS_N + 1))
    else
      echo "FAIL: ${k}"; FAIL_N=$((FAIL_N + 1)); FAILED="$FAILED ${k}"
    fi
  fi
done

echo "----------------------------------------"
echo "通過 ${PASS_N}，失敗 ${FAIL_N}${FAILED:+（${FAILED} ）}"
[ "$FAIL_N" -eq 0 ]
