#!/usr/bin/env bash
# 驗證 hdl2rs：ch01 ~ ch03 全部 .tst + ch05 CPU（v0.3）必須 PASS
set -e
cd "$(dirname "$0")"
echo "== cargo test (workspace) =="
cargo test -q
echo "== 跑 ch01 ~ ch03 全部測試 =="
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --dir ../03 --out gen
echo "== 跑 ch05 CPU 測試（內部 DRegister[] 探測 + 純外部）=="
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../05/CPU.tst --test ../05/CPU-external.tst --out gen
echo "== 全部通過 =="