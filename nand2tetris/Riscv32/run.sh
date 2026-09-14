#!/bin/bash
# run.sh：快速示範 — 組譯 → 跑五級管線 Rv32_5（prog3 後跳迴圈測資）
# 用法：bash run.sh
set -e
cd "$(dirname "$0")"

node asm.js prog1.asm
node asm.js prog2.asm
node asm.js prog3.asm

cd ../_web_eda32
rm -rf gen
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --dir ../Riscv32 --test ../Riscv32/Rv32_5_3.tst --out gen

echo "--- Rv32_5_3.out（末段）---"
tail -12 ../Riscv32/Rv32_5_3.out