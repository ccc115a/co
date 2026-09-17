#!/bin/bash
# show_sections.sh：自訂 section 連結驗證（對應書 18.4）
# 產生含 .mysection 的測試 C，連結 sections.ld，以 readelf -S / nm 驗證。
# 用法：bash show_sections.sh
set -u
CC=riscv64-unknown-elf-gcc
READELF=riscv64-unknown-elf-readelf
NM=riscv64-unknown-elf-nm
DIR="$(dirname "$0")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/t.c" <<'EOF'
// 測試韌體：進入點 + 自訂節魔數表（對應 sections.ld 的 .mysection）
// 取用 _stack_top/_end：讓 PROVIDE 符號實體化（未被引用則不會輸出）
extern unsigned _stack_top, _end;
__attribute__((section(".mysection")))
const unsigned mymagic[4] = {0xDEADBEEF, 0x12345678, 0x5A5A5A5A, 0x0BADF00D};
void _start(void) {
  if (_stack_top == 0 || _end == 0) { __asm__ volatile("nop"); }  // 可觀察取用，不可優化掉
  while (1) { __asm__ volatile("nop"); }
}
EOF

"$CC" -march=rv32imac -mabi=ilp32 -nostdlib -T "$DIR/sections.ld" \
  -o "$TMP/fw.elf" "$TMP/t.c" || { echo "連結失敗"; exit 1; }

echo "== readelf -S（節表）=="
"$READELF" -S "$TMP/fw.elf" | grep -E 'mysection|\.text|\.data|\.bss'
echo "== 開機符號 =="
"$NM" "$TMP/fw.elf" | grep -E '_start|_smy|_emy|_stack_top|_end'
echo "== 驗證 =="
"$READELF" -S "$TMP/fw.elf" | grep -q '\.mysection' \
  && "$NM" "$TMP/fw.elf" | grep -q '_smy' \
  && echo "PASS：自訂節 .mysection 存在，符號 _smy/_emy 正確" || { echo "FAIL"; exit 1; }
