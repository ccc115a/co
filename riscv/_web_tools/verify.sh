#!/usr/bin/env bash
# verify.sh — rvjs 嚴格驗證：
#   npm test → cli 組譯全部 examples（產生 .hex/.bin）
#   → rvemu 跑每個 example 並 grep 預期 UART（含 exit 比對）
#   → node tools/build.js 建 dist。
# .hex/.bin 建構物用完即刪，不留 repo。
set -euo pipefail
cd "$(dirname "$0")"

# 建構物用完即刪（成功或失敗皆清）
trap 'rm -f examples/*.hex examples/*.bin; rm -rf .tmp-ku' EXIT

npm test

for e in hello sum fib loadstore branch mul sort gpu_tid gpu_vecadd1; do
  node cli/rvasm.js "examples/$e.s"
done

check() {
  # $1 = example 名，$2 = 預期 UART，$3 = 預期 exit
  local out
  out=$(node cli/rvemu.js "examples/$1.s")
  echo "$out"
  echo "$out" | grep -F -q "$2"
  echo "$out" | grep -F -q "exit=$3"
  echo "ok: $1 (UART='$2', exit=$3)"
}

check hello 'Hi RV32!' 0
check sum '55' 55
check fib '55' 55
check loadstore 'OK' 0
check branch 'OK' 0
check mul '42' 42
check sort '12345' 0
check gpu_tid 'T0 N1' 0
check gpu_vecadd1 'OK' 0

# cu2rv：每個 kernels/*.ku 都能編成 .s 並組譯成 .hex（暫存目錄，不留 repo）
mkdir -p .tmp-ku && cp kernels/*.ku .tmp-ku/
for k in .tmp-ku/*.ku; do
  node cli/cu2rv.js "$k"
done
for s in .tmp-ku/*.s; do
  node cli/rvasm.js "$s"
done
rm -rf .tmp-ku

node tools/build.js

# dist 內容檢查：corpus 含 GPU 範例、kucorpus 含 DSL 範例、bundle 含編譯器
for e in gpu_tid gpu_vecadd1; do
  grep -F -q "$e" dist/corpus.js
done
for k in vecadd saxpy tiny; do
  grep -F -q "$k" dist/kucorpus.js
done
grep -F -q 'compileKernel' dist/rvjs.js
grep -F -q 'kucorpus.js' dist/index.html
echo 'ok: dist 含 GPU＋DSL 範例'

echo '全部驗證通過'
