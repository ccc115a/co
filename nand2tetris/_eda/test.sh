#!/bin/bash
# hdl2rs 測試腳本：workspace 單元測試 + ch01~ch05 全部 .tst 迴歸（每完成一版就加一章）
set -x

cargo test -q
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --dir ../03 --out gen || true

# v0.4：ch04 驗證（Mult-hw、Fill-hw，跑在 Computer.hdl 上）
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../04/mult/Mult-hw.tst --test ../04/fill/Fill-hw.tst --out gen || true

# v0.4：ch05 全部（CPU 內部/外部 + 六支 Computer）
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../05/CPU.tst --test ../05/CPU-external.tst --test ../05/ComputerAdd.tst --test ../05/ComputerAdd-external.tst --test ../05/ComputerMax.tst --test ../05/ComputerMax-external.tst --test ../05/ComputerRect.tst --test ../05/ComputerRect-external.tst --out gen || true

# v0.5：Jack → VM → ASM → HACK 全鏈路 e2e（跑在 Computer.hdl 上）
bin=target/debug
rm -rf gen/chain/vm && mkdir -p gen/chain/vm
$bin/jack2vm -o gen/chain/vm gen/chain
$bin/vm2asm gen/chain/chain.asm gen/chain/vm/Main.vm gen/chain/vm/Sys.vm
$bin/hackasm gen/chain/chain.asm gen/chain/chain.hack
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test gen/chain/chain.tst --out gen || true

ls -la gen 2>/dev/null