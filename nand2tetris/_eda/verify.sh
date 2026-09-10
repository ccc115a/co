#!/usr/bin/env bash
# 驗證 hdl2rs：ch01 ~ ch04 全部 .tst + ch05 全部（CPU + 六支 Computer）必須 PASS
set -e
cd "$(dirname "$0")"
echo "== cargo test (workspace) =="
cargo test -q
echo "== 跑 ch01 ~ ch03 全部測試 =="
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --dir ../03 --out gen
echo "== 跑 ch04 驗證（Mult-hw、Fill-hw，跑在 Computer.hdl 上）=="
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../04/mult/Mult-hw.tst --test ../04/fill/Fill-hw.tst --out gen
echo "== 跑 ch05 全部測試（CPU 內部/外部 + 六支 Computer）=="
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../05/CPU.tst --test ../05/CPU-external.tst --test ../05/ComputerAdd.tst --test ../05/ComputerAdd-external.tst --test ../05/ComputerMax.tst --test ../05/ComputerMax-external.tst --test ../05/ComputerRect.tst --test ../05/ComputerRect-external.tst --out gen
echo "== Jack → VM → ASM → HACK 全鏈路 e2e（跑在 Computer.hdl 上）=="
bin=target/debug
rm -rf gen/chain/vm && mkdir -p gen/chain/vm
"$bin/jack2vm" -o gen/chain/vm gen/chain
"$bin/vm2asm" gen/chain/chain.asm gen/chain/vm/Main.vm gen/chain/vm/Sys.vm
"$bin/hackasm" gen/chain/chain.asm gen/chain/chain.hack
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test gen/chain/chain.tst --out gen
echo "== hackemu 虛擬機 headless 執行（RAM[16] 應為 5，與上面 hdl2rs 一致）=="
"$bin/hackasm" gen/chain/chain.asm gen/chain/chain.bin --bin
"$bin/hackemu" --headless gen/chain/chain.bin --max 500000 | grep -q "RAM\[16\] static: 5"
echo "== v0.7：ch12 裁剪版 OS headless（Memory.poke / Math.multiply / Screen.drawPixel 標記）=="
rm -rf gen/show_os_vm gen/show_app_vm && mkdir -p gen/show_os_vm gen/show_app_vm
"$bin/jack2vm" -o gen/show_os_vm gen/os_src
"$bin/jack2vm" -o gen/show_app_vm gen/os
"$bin/vm2asm" gen/show.asm gen/show_os_vm/*.vm gen/show_app_vm/*.vm
"$bin/hackasm" gen/show.asm gen/show.bin --bin
"$bin/hackemu" --headless gen/show.bin --max 10000000 --dump 200,201 --dump 22784,22784 > gen/show.out
grep -q "RAM\[200..=201\]: \[1234, 777\]" gen/show.out
grep -q "RAM\[22784..=22784\]: \[1\]" gen/show.out
echo "== v0.7.1：重建 pong.bin（Pong + 裁剪版 OS）=="
rm -rf gen/pong_os_vm gen/pong_app_vm && mkdir -p gen/pong_os_vm gen/pong_app_vm
"$bin/jack2vm" -o gen/pong_os_vm gen/os_src
"$bin/jack2vm" -o gen/pong_app_vm ../11/jack/Pong
"$bin/vm2asm" gen/pong.asm gen/pong_os_vm/*.vm gen/pong_app_vm/*.vm
"$bin/hackasm" gen/pong.asm gen/pong.bin --bin
echo "== v0.7.1：Pong --keys 方向鍵回應（bat 位置隨按鍵分離）=="
printf '1000000 left\n' > gen/keys.left
printf '1000000 right\n' > gen/keys.right
kern="$bin/hackemu"; [ -x target/release/hackemu ] && kern=target/release/hackemu
"$kern" --headless gen/pong.bin --max 300000000 --keys gen/keys.left --img gen/pong.left.ppm >/dev/null 2>&1
"$kern" --headless gen/pong.bin --max 300000000 --keys gen/keys.right --img gen/pong.right.ppm >/dev/null 2>&1
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
echo "== 全部通過 =="