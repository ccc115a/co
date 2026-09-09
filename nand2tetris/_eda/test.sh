#!/bin/bash
# hdl2rs 測試腳本：workspace 單元測試 + ch01~ch03 全部 .tst 迴歸（每完成一版就加一章）
set -x

cargo test -q
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --dir ../03 --out gen || true

# v0.3：ch05 CPU（內部 DRegister[] 探測 + 純外部腳），Computer*/Memory 需 .hack/互動，v0.4 起
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../05/CPU.tst --test ../05/CPU-external.tst --out gen || true

ls -la gen 2>/dev/null