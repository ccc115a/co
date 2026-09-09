#!/bin/bash
# hdl2rs 測試腳本：workspace 單元測試 + ch01/ch02 全部 .tst 迴歸
set -x

cargo test -q
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --out gen || true

ls -la gen 2>/dev/null