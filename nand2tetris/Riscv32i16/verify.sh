#!/usr/bin/env bash
# Riscv5stage 驗證腳本：重組譯、再跑全部 .tst，全部必須 1 通過 0 失敗。
# 依賴：node（hackjs CLI）、python3；晶片目錄 01 02 03a 03b 05 + 本目錄。
set -euo pipefail
cd "$(dirname "$0")"

# 1) 組譯（檔頭變了就重產生 .bin）
python3 asm.py prog1.asm prog2.asm

# 2) 依序跑測試，檢查「1 通過，0 失敗」
pass=0
for t in Rv1.tst Rv1_2.tst Rv5.tst Rv5_2.tst; do
  echo "== $t =="
  out=$(node ../_web_eda/cli/hdl2js.js \
    --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
    --dir ../Riscv5stage --test "../Riscv5stage/$t" 2>&1)
  echo "$out" | tail -1
  if ! echo "$out" | grep -q '1 通過，0 失敗'; then
    echo "FAIL: $t"; exit 1
  fi
  pass=$((pass+1))
done

echo
echo "全部 $pass/4 個測試通過。"