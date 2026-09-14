#!/usr/bin/env bash
# Riscv5stage 全測試：用 hackjs（_web_eda）跑本目錄所有 .tst。
# 依賴教材章節晶片：01 02 03/a 03/b 05 + 本目錄（含 _lib）。
set -euo pipefail
cd "$(dirname "$0")"
node ../_web_eda/cli/hdl2js.js \
  --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --dir ../Riscv5stage --out gen