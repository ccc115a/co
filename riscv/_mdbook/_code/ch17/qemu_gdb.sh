#!/bin/bash
# qemu_gdb.sh — 一鍵啟動 QEMU 等待 GDB（對應 17.4）
# 用法：./qemu_gdb.sh [kernel.elf]（預設 ../ch15/kernel.elf）
# 另開終端用 riscv64-unknown-elf-gdb 連 :1234（見 gdb_cmds.txt）。
set -e
KERNEL="${1:-../ch15/kernel.elf}"
[ -f "$KERNEL" ] || { echo "缺 $KERNEL：先到 ../ch15 執行 make"; exit 1; }
qemu-system-riscv64 -machine virt -bios none -kernel "$KERNEL" -nographic -s -S
