#!/bin/bash
# run.sh：快速示範 — 組譯 → 跑五級管線 Rv32_5（prog3 後跳迴圈測資）
# 用法：bash run.sh
set -e
cd "$(dirname "$0")"

node asm.js prog1.asm
node asm.js prog2.asm
node asm.js prog3.asm

cd ../_web_eda
# 注意：不可 rm -rf gen——那會連帶清掉 _web_eda/gen 的 corpus 語料來源（gen/chain、gen/os_src）
rm -f ../Riscv32/Rv32_5_3.out
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --dir ../Riscv32 --test ../Riscv32/Rv32_5_3.tst --out gen

echo "--- Rv32_5_3.out（末段）---"
tail -12 ../Riscv32/Rv32_5_3.out