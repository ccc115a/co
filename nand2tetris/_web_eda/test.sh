#!/usr/bin/env bash
# 容錯版：node --test + ch01~05 全跑（失敗不終止，最尾看結果）
set -x
cd "$(dirname "$0")"
node --test || true
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b || true
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --test ../05/CPU.tst --test ../05/CPU-external.tst \
  --test ../05/ComputerAdd.tst --test ../05/ComputerAdd-external.tst \
  --test ../05/ComputerMax.tst --test ../05/ComputerMax-external.tst \
  --test ../05/ComputerRect.tst --test ../05/ComputerRect-external.tst || true
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --test ../04/mult/Mult-hw.tst --test ../04/fill/Fill-hw.tst || true
# v0.5：Jack → VM → ASM → HACK 全鏈路 e2e（RAM[16]=5）
mkdir -p gen/chain/vm
node cli/jack2vm.js gen/chain/Main.jack
node cli/jack2vm.js gen/chain/Sys.jack
mv -f gen/chain/output/Main.vm gen/chain/output/Sys.vm gen/chain/vm/
node cli/vm2asm.js gen/chain/chain.asm gen/chain/vm/Main.vm gen/chain/vm/Sys.vm
node cli/hackasm.js gen/chain/chain.asm
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --test gen/chain/chain.tst || true
# v0.6：hackemu headless 交叉驗證（chain.bin → RAM[16]=5）
node cli/hackemu.js --headless gen/chain/chain.bin --max 500000 | grep "RAM\[16\] static: 5" || true
# v0.7：show（Memory.poke/Math.multiply/Screen.drawPixel 標記槽）
node cli/jack2vm.js gen/os_src >/dev/null 2>&1 || true
node cli/jack2vm.js gen/os >/dev/null 2>&1 || true
node cli/vm2asm.js gen/show.asm gen/os_src/output/*.vm gen/os/output/*.vm >/dev/null 2>&1 || true
node cli/hackasm.js gen/show >/dev/null 2>&1 || true
node cli/hackemu.js --headless gen/show.bin --max 10000000 --dump 200,201 --dump 22784,22784 2>/dev/null | grep "RAM\[200..=201\]" || true
# v0.7.1：Pong --keys 方向鍵分離
node cli/jack2vm.js ../11/jack/Pong >/dev/null 2>&1 || true
node cli/vm2asm.js gen/pong.asm gen/os_src/output/*.vm ../11/jack/Pong/output/*.vm >/dev/null 2>&1 || true
node cli/hackasm.js gen/pong >/dev/null 2>&1 || true
node cli/hackemu.js --headless gen/pong.bin --max 300000000 --keys gen/keys.left --img gen/pong.left.ppm >/dev/null 2>&1 || true
node cli/hackemu.js --headless gen/pong.bin --max 300000000 --keys gen/keys.right --img gen/pong.right.ppm >/dev/null 2>&1 || true
python3 - gen/pong.left.ppm gen/pong.right.ppm 2>/dev/null <<'PY' || true
import sys
def bat_min_x(path):
    d = open(path, 'rb').read().split(b'\n', 3)[3]
    xs = []
    for y in range(229, 237):
        row = d[(y * 512) * 3:(y * 512 + 512) * 3]
        xs += [x for x in range(512) if row[x * 3] < 128]
    return min(xs) if xs else -1
l = bat_min_x(sys.argv[1]); r = bat_min_x(sys.argv[2])
print(f"bat min-x: left={l}  right={r}")
PY
# v0.7.2：逐模組單測
for t in MathTest StringTest ScreenTest HeapTest; do
    node cli/jack2vm.js gen/m73/$t >/dev/null 2>&1 || true
    node cli/vm2asm.js gen/m73/$t.asm gen/os_src/output/*.vm gen/m73/$t/output/*.vm >/dev/null 2>&1 || true
    node cli/hackasm.js gen/m73/$t >/dev/null 2>&1 || true
    node cli/hackemu.js --headless gen/m73/$t.bin --max 50000000 --dump 100,110 2>/dev/null | grep "RAM\[100..=110\]" || true
done
# v0.8：網頁 bundle 冒煙（embed + 語法檢查 + index 引用）
node tools/embed.js && node --check dist/embed.js && node --check dist/app.js && grep -q 'src="embed.js"' dist/index.html || true
# v0.9：hdl.html 瀏覽器全路徑（語料 40/40 + 頁面語法）
node tools/gen_corpus.js && node tools/embed.js && node tools/browser_smoke.js || true
node --check dist/corpus.js && node --check dist/hdl-rt.js && node --check dist/hdl.js || true
# v1.0：jack.html 全鏈路（內建 12 程式）
node tools/gen_corpus.js && node tools/browser_jack_smoke.js || true
node --check dist/jack.js || true