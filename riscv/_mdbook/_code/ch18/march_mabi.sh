#!/bin/bash
# march_mabi.sh：-march/-mabi 配對實驗（對應書 18.2）
# 以多組 -march/-mabi 編 hello.c，記錄成功/失敗並印對照表。
# 用法：bash march_mabi.sh
set -u
CC=riscv64-unknown-elf-gcc
SRC="$(dirname "$0")/hello.c"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 格式：march:mabi:預期（ok/fail):說明
CASES=(
  "rv32imac:ilp32:ok:RV32 MCU 黃金組合"
  "rv64gc:lp64d:ok:RV64 應用黃金組合"
  "rv64imac:lp64:ok:RV64 無浮點軟浮點"
  "rv64gc:ilp32:fail:XLEN=64 卻用 32 位 ABI"
  "rv64imac:lp64d:fail:ABI 要 D 擴充但硬體沒有"
)

pass=0; fail=0
printf '%-12s %-8s %-6s %-6s %s\n' "march" "mabi" "預期" "實測" "說明"
echo "---------------------------------------------------------------"
for c in "${CASES[@]}"; do
  march="${c%%:*}"; rest="${c#*:}"
  mabi="${rest%%:*}"; rest="${rest#*:}"
  expect="${rest%%:*}"; note="${rest#*:}"
  if "$CC" -march="$march" -mabi="$mabi" -o "$TMP/t.elf" "$SRC" 2>"$TMP/err.log"; then
    got="成功"
  else
    got="失敗"
  fi
  want="成功"; [ "$expect" = "fail" ] && want="失敗"
  if [ "$got" = "$want" ]; then res="相符"; pass=$((pass+1)); else res="不符"; fail=$((fail+1)); fi
  printf '%-12s %-8s %-6s %-6s %s [%s]\n' "$march" "$mabi" "$want" "$got" "$note" "$res"
done
echo "---------------------------------------------------------------"
echo "相符 $pass 筆，不符 $fail 筆"
[ "$fail" -eq 0 ]
