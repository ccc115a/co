#!/usr/bin/env bash
# 驗證 hackjs：單元測試 + ch01~ch05 全部 .tst（37/37，與 Rust verify.sh 相同清單）必須 PASS
set -e
cd "$(dirname "$0")"
echo "== node --test（單元測試）=="
node --test
echo "== 跑 ch01 ~ ch03 全部測試 =="
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b
echo "== 跑 ch05 全部測試（CPU 內部/外部 + 六支 Computer；Memory.tst 需人工按鍵，不自動化）=="
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --test ../05/CPU.tst --test ../05/CPU-external.tst \
  --test ../05/ComputerAdd.tst --test ../05/ComputerAdd-external.tst \
  --test ../05/ComputerMax.tst --test ../05/ComputerMax-external.tst \
  --test ../05/ComputerRect.tst --test ../05/ComputerRect-external.tst
echo "== 跑 ch04（Mult-hw / Fill-hw，跑在 Computer.hdl 上）=="
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --test ../04/mult/Mult-hw.tst --test ../04/fill/Fill-hw.tst
echo "== v0.5：Jack → VM → ASM → HACK 全鏈路 e2e（跑在 Computer.hdl 上，RAM[16]=5）=="
mkdir -p gen/chain/vm
node cli/jack2vm.js gen/chain/Main.jack >/dev/null
node cli/jack2vm.js gen/chain/Sys.jack >/dev/null
mv -f gen/chain/output/Main.vm gen/chain/output/Sys.vm gen/chain/vm/
node cli/vm2asm.js gen/chain/chain.asm gen/chain/vm/Main.vm gen/chain/vm/Sys.vm >/dev/null
node cli/hackasm.js gen/chain/chain.asm >/dev/null
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --test gen/chain/chain.tst
echo "== v0.6：hackemu headless 交叉驗證（chain.bin → RAM[16]=5，與 hdl2js 一致）=="
node cli/hackemu.js --headless gen/chain/chain.bin --max 500000 | grep -q "RAM\[16\] static: 5"
echo "== v0.7：ch12 裁剪版 OS headless（Memory.poke / Math.multiply / Screen.drawPixel 標記）=="
node cli/jack2vm.js gen/os_src >/dev/null
node cli/jack2vm.js gen/os >/dev/null
node cli/vm2asm.js gen/show.asm gen/os_src/output/*.vm gen/os/output/*.vm >/dev/null
node cli/hackasm.js gen/show >/dev/null
node cli/hackemu.js --headless gen/show.bin --max 10000000 --dump 200,201 --dump 22784,22784 > gen/show.out
grep -q "RAM\[200..=201\]: \[1234, 777\]" gen/show.out
grep -q "RAM\[22784..=22784\]: \[32768\]" gen/show.out
echo "== v0.7.1：Pong --keys 方向鍵回應（bat 位置隨按鍵分離）=="
node cli/jack2vm.js ../11/jack/Pong >/dev/null
node cli/vm2asm.js gen/pong.asm gen/os_src/output/*.vm ../11/jack/Pong/output/*.vm >/dev/null
node cli/hackasm.js gen/pong >/dev/null
printf '1000000 left\n' > gen/keys.left
printf '1000000 right\n' > gen/keys.right
node cli/hackemu.js --headless gen/pong.bin --max 300000000 --keys gen/keys.left --img gen/pong.left.ppm >/dev/null
node cli/hackemu.js --headless gen/pong.bin --max 300000000 --keys gen/keys.right --img gen/pong.right.ppm >/dev/null
python3 - gen/pong.left.ppm gen/pong.right.ppm <<'PY'
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
assert r - l > 100, f"方向鍵未分離 bat (left={l}, right={r})"
PY
echo "== v0.7.2：逐模組單測（Math / String / Screen / Memory.deAlloc，標記槽 RAM[100..=110]）=="
for t in MathTest StringTest ScreenTest HeapTest; do
    node cli/jack2vm.js gen/m73/$t >/dev/null
    node cli/vm2asm.js gen/m73/$t.asm gen/os_src/output/*.vm gen/m73/$t/output/*.vm >/dev/null
    node cli/hackasm.js gen/m73/$t >/dev/null
    node cli/hackemu.js --headless gen/m73/$t.bin --max 50000000 --dump 100,110 > gen/m73/$t.out
done
grep -q "RAM\[100..=110\]: \[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1\]" gen/m73/MathTest.out
grep -q "RAM\[100..=110\]: \[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0\]" gen/m73/StringTest.out
grep -q "RAM\[100..=110\]: \[1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0\]" gen/m73/ScreenTest.out
grep -q "RAM\[100..=110\]: \[1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0\]" gen/m73/HeapTest.out
echo "== v0.8：網頁 bundle（dist/embed.js＋app.js 語法，file:// 直開）=="
node tools/embed.js
node --check dist/embed.js
node --check dist/app.js
grep -q 'src="embed.js"' dist/index.html && grep -q 'src="app.js"' dist/index.html
echo "== v0.9：hdl.html 瀏覽器全路徑（語料 40/40 內建案例 + 頁面語法）=="
node tools/gen_corpus.js
node tools/embed.js
node tools/browser_smoke.js
node --check dist/corpus.js && node --check dist/hdl-rt.js && node --check dist/hdl.js
node -e '
const fs = require("fs");
const h = fs.readFileSync("dist/hdl.html", "utf8");
for (const s of ["corpus.js", "hdl-rt.js", "embed.js", "hdl.js"]) {
  if (!h.includes(`src="${s}"`)) { console.error("hdl.html 缺 " + s); process.exit(1); }
}
console.log("hdl.html script 引用完整");
'
echo "== v1.0：jack.html 瀏覽器全鏈路（內建 12 程式 compile→assemble→run、oracle RAM[16]=5）=="
node tools/gen_corpus.js
node tools/browser_jack_smoke.js
node --check dist/jack.js
node -e '
const fs = require("fs");
const h = fs.readFileSync("dist/jack.html", "utf8");
for (const s of ["corpus.js", "hdl-rt.js", "embed.js", "jack.js"]) {
  if (!h.includes(`src="${s}"`)) { console.error("jack.html 缺 " + s); process.exit(1); }
}
for (const [from, to] of [["index.html", "jack.html"], ["hdl.html", "jack.html"]]) {
  const f = fs.readFileSync("dist/" + from, "utf8");
  if (!f.includes(`href="${to}"`)) { console.error("dist/" + from + " 缺 jack.html 連結"); process.exit(1); }
}
console.log("jack 頁面引用與互相連節完整");
'
echo "== 全部 PASS =="