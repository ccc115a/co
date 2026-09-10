#!/bin/bash
# hdl2rs 測試腳本：workspace 單元測試 + ch01~ch05 全部 .tst 迴歸（每完成一版就加一章）
set -x

cargo test -q
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --dir ../03 --out gen || true

# v0.4：ch04 驗證（Mult-hw、Fill-hw，跑在 Computer.hdl 上）
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../04/mult/Mult-hw.tst --test ../04/fill/Fill-hw.tst --out gen || true

# v0.4：ch05 全部（CPU 內部/外部 + 六支 Computer）
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test ../05/CPU.tst --test ../05/CPU-external.tst --test ../05/ComputerAdd.tst --test ../05/ComputerAdd-external.tst --test ../05/ComputerMax.tst --test ../05/ComputerMax-external.tst --test ../05/ComputerRect.tst --test ../05/ComputerRect-external.tst --out gen || true

# v0.5：Jack → VM → ASM → HACK 全鏈路 e2e（跑在 Computer.hdl 上）
bin=target/debug
rm -rf gen/chain/vm && mkdir -p gen/chain/vm
$bin/jack2vm -o gen/chain/vm gen/chain
$bin/vm2asm gen/chain/chain.asm gen/chain/vm/Main.vm gen/chain/vm/Sys.vm
$bin/hackasm gen/chain/chain.asm gen/chain/chain.hack
cargo run -q -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --test gen/chain/chain.tst --out gen || true

# v0.6：hackemu 虛擬機 headless 交叉驗證（RAM[16] 應為 5，與 hdl2rs Provider 一致）
$bin/hackasm gen/chain/chain.asm gen/chain/chain.bin --bin
$bin/hackemu --headless gen/chain/chain.bin --max 500000 | grep -q "RAM\[16\] static: 5" || true

# v0.7：ch12 裁剪版 OS headless（Memory.poke / Math.multiply / Screen.drawPixel 標記）
rm -rf gen/show_os_vm gen/show_app_vm && mkdir -p gen/show_os_vm gen/show_app_vm
$bin/jack2vm -o gen/show_os_vm gen/os_src
$bin/jack2vm -o gen/show_app_vm gen/os
$bin/vm2asm gen/show.asm gen/show_os_vm/*.vm gen/show_app_vm/*.vm
$bin/hackasm gen/show.asm gen/show.bin --bin
$bin/hackemu --headless gen/show.bin --max 10000000 --dump 200,201 --dump 22784,22784 > gen/show.out || true
grep -q "RAM\[200..=201\]: \[1234, 777\]" gen/show.out || true
grep -q "RAM\[22784..=22784\]: \[32768\]" gen/show.out || true

# v0.7.1：重建 pong.bin + Pong --keys 方向鍵回應（bat 位置隨按鍵分離）
rm -rf gen/pong_os_vm gen/pong_app_vm && mkdir -p gen/pong_os_vm gen/pong_app_vm || true
$bin/jack2vm -o gen/pong_os_vm gen/os_src || true
$bin/jack2vm -o gen/pong_app_vm ../11/jack/Pong || true
$bin/vm2asm gen/pong.asm gen/pong_os_vm/*.vm gen/pong_app_vm/*.vm || true
$bin/hackasm gen/pong.asm gen/pong.bin --bin || true
printf '1000000 left\n' > gen/keys.left || true
printf '1000000 right\n' > gen/keys.right || true
kern="$bin/hackemu"; [ -x target/release/hackemu ] && kern=target/release/hackemu
$kern --headless gen/pong.bin --max 300000000 --keys gen/keys.left --img gen/pong.left.ppm >/dev/null 2>&1 || true
$kern --headless gen/pong.bin --max 300000000 --keys gen/keys.right --img gen/pong.right.ppm >/dev/null 2>&1 || true
python3 - gen/pong.left.ppm gen/pong.right.ppm <<'PY' || true
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
print("方向鍵回應 OK" if r - l > 100 else "方向鍵未分離 bat")
PY

# v0.7.2：M7.3 逐模組單測（Math / String / Screen / Memory.deAlloc，標記槽 RAM[100..=110]）
rm -rf gen/m73/os_vm && mkdir -p gen/m73/os_vm || true
$bin/jack2vm -o gen/m73/os_vm gen/os_src || true
for t in MathTest StringTest ScreenTest HeapTest; do
    rm -rf gen/m73/$t/vm_app && mkdir -p gen/m73/$t/vm_app || true
    $bin/jack2vm -o gen/m73/$t/vm_app gen/m73/$t || true
    $bin/vm2asm gen/m73/$t.asm gen/m73/os_vm/*.vm gen/m73/$t/vm_app/*.vm >/dev/null || true
    $bin/hackasm gen/m73/$t.asm gen/m73/$t.bin --bin >/dev/null || true
done
$kern --headless gen/m73/MathTest.bin --max 50000000 --dump 100,110 > gen/m73/MathTest.out 2>/dev/null || true
$kern --headless gen/m73/StringTest.bin --max 50000000 --dump 100,110 > gen/m73/StringTest.out 2>/dev/null || true
$kern --headless gen/m73/ScreenTest.bin --max 50000000 --dump 100,110 > gen/m73/ScreenTest.out 2>/dev/null || true
$kern --headless gen/m73/HeapTest.bin --max 50000000 --dump 100,110 > gen/m73/HeapTest.out 2>/dev/null || true
grep -q "RAM\[100..=110\]: \[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1\]" gen/m73/MathTest.out || true
grep -q "RAM\[100..=110\]: \[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0\]" gen/m73/StringTest.out || true
grep -q "RAM\[100..=110\]: \[1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0\]" gen/m73/ScreenTest.out || true
grep -q "RAM\[100..=110\]: \[1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0\]" gen/m73/HeapTest.out || true

ls -la gen 2>/dev/null