#!/usr/bin/env bash
# 驗證 hdl2rs：ch01 ~ ch04 全部 .tst + ch05 全部（CPU + 六支 Computer）必須 PASS
set -e
cd "$(dirname "$0")"
echo "== cargo test (workspace) =="
cargo test -q
echo "== 跑 ch01 ~ ch03 全部測試 =="
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --dir ../03 --out gen
echo "== 跑 ch04 驗證（Mult-hw、Fill-hw，跑在 Computer.hdl 上）=="
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../04/mult/Mult-hw.tst --test ../04/fill/Fill-hw.tst --out gen
echo "== 跑 ch05 全部測試（CPU 內部/外部 + 六支 Computer）=="
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../05/CPU.tst --test ../05/CPU-external.tst --test ../05/ComputerAdd.tst --test ../05/ComputerAdd-external.tst --test ../05/ComputerMax.tst --test ../05/ComputerMax-external.tst --test ../05/ComputerRect.tst --test ../05/ComputerRect-external.tst --out gen
echo "== Jack → VM → ASM → HACK 全鏈路 e2e（跑在 Computer.hdl 上）=="
bin=target/debug
rm -rf gen/chain/vm && mkdir -p gen/chain/vm
"$bin/jack2vm" -o gen/chain/vm gen/chain
"$bin/vm2asm" gen/chain/chain.asm gen/chain/vm/Main.vm gen/chain/vm/Sys.vm
"$bin/hackasm" gen/chain/chain.asm gen/chain/chain.hack
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test gen/chain/chain.tst --out gen
echo "== hackemu 虛擬機 headless 執行（RAM[16] 應為 5，與上面 hdl2rs 一致）=="
"$bin/hackasm" gen/chain/chain.asm gen/chain/chain.bin --bin
"$bin/hackemu" --headless gen/chain/chain.bin --max 500000 | grep -q "RAM\[16\] static: 5"
echo "== 全部通過 =="