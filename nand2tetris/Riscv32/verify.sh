#!/bin/bash
# verify.sh：Riscv32 全部回歸（正確性以 .cmp 比對）
# 用法：bash verify.sh
#
#   1) 組譯 prog1/prog2/prog3 → .bin
#   2) 用 _web_eda（hackjs 32-bit 引擎，16-bit 原版在 ../_web_eda16）模擬：
#      單週期核心 Rv32_1 ×2（prog1、prog3）
#      ＆ 五級管線核心 Rv32_5 ×2（prog1、prog3）
#   .tst 皆含 compare-to .cmp，任何暫存器/記憶體/PC 偏差即 FAIL。
set -e
cd "$(dirname "$0")"

echo "== 組譯 =="
node asm.js prog1.asm
node asm.js prog2.asm
node asm.js prog3.asm

echo "== 模擬（單週期＋管線）=="
cd ../_web_eda
# 注意：不可 rm -rf gen——那會連帶清掉 _web_eda/dist 的語料來源
# （gen/chain、gen/os_src），讓 jack.html/hdl.html 的內建語料短少。
node cli/hdl2js.js \
  --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --dir ../Riscv32 \
  --test ../Riscv32/Rv32_1.tst \
  --test ../Riscv32/Rv32_1_3.tst \
  --test ../Riscv32/Rv32_5.tst \
  --test ../Riscv32/Rv32_5_3.tst \
  --out gen

rm -f ../Riscv32/*.out

echo "== 全部通過 =="