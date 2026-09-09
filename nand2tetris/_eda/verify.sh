#!/usr/bin/env bash
# 驗證 hdl2rs：ch01 ~ ch03 全部 .tst 必須 PASS
set -e
cd "$(dirname "$0")"
echo "== cargo test (workspace) =="
cargo test -q
echo "== 跑 ch01 ~ ch03 全部測試 =="
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --dir ../03 --out gen
echo "== 全部通過 =="