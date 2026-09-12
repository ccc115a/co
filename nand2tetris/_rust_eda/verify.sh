#!/usr/bin/env bash
# 驗證 hdl2rs：ch01 ~ ch04 全部 .tst + ch05 全部（CPU + 六支 Computer）必須 PASS
set -e
cd "$(dirname "$0")"
echo "== cargo test (workspace) =="
cargo test -q
cargo build -q -p hackasm -p vm2asm -p jack2vm -p hackemu
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
grep -q "RAM\[22784..=22784\]: \[32768\]" gen/show.out
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
echo "== v0.7.2：M7.3 逐模組單測（Math / String / Screen / Memory.deAlloc，標記槽 RAM[100..=110]）=="
rm -rf gen/m73/os_vm && mkdir -p gen/m73/os_vm
"$bin/jack2vm" -o gen/m73/os_vm gen/os_src
for t in MathTest StringTest ScreenTest HeapTest; do
    rm -rf gen/m73/$t/vm_app && mkdir -p gen/m73/$t/vm_app
    "$bin/jack2vm" -o gen/m73/$t/vm_app gen/m73/$t >/dev/null
    "$bin/vm2asm" gen/m73/$t.asm gen/m73/os_vm/*.vm gen/m73/$t/vm_app/*.vm >/dev/null
    "$bin/hackasm" gen/m73/$t.asm gen/m73/$t.bin --bin >/dev/null
done
"$kern" --headless gen/m73/MathTest.bin --max 50000000 --dump 100,110 > gen/m73/MathTest.out 2>/dev/null
"$kern" --headless gen/m73/StringTest.bin --max 50000000 --dump 100,110 > gen/m73/StringTest.out 2>/dev/null
"$kern" --headless gen/m73/ScreenTest.bin --max 50000000 --dump 100,110 > gen/m73/ScreenTest.out 2>/dev/null
"$kern" --headless gen/m73/HeapTest.bin --max 50000000 --dump 100,110 > gen/m73/HeapTest.out 2>/dev/null
grep -q "RAM\[100..=110\]: \[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1\]" gen/m73/MathTest.out
grep -q "RAM\[100..=110\]: \[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0\]" gen/m73/StringTest.out
grep -q "RAM\[100..=110\]: \[1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0\]" gen/m73/ScreenTest.out
grep -q "RAM\[100..=110\]: \[1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0\]" gen/m73/HeapTest.out
echo "== v0.8：hackserve（WebSocket）端到端回歸 =="
cargo build --release -p hackserve >/dev/null
PORT=8087
target/release/hackserve --port $PORT >/tmp/hackserve-v08.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
node - "$PORT" ../06/add.asm ../06/sum.asm ../04/fill/Fill.asm ../04/mult/Mult.asm <<'NODE'
const [port, ...files] = process.argv.slice(2);
const fs = require('fs');
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
const waiters = {}; let seq = 0;
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waiters[m.id]) { waiters[m.id](m); delete waiters[m.id]; } };
function req(o) { return new Promise((res, rej) => { const id = ++seq; o.id = id; waiters[id] = res; ws.send(JSON.stringify(o)); setTimeout(() => { if (waiters[id]) { delete waiters[id]; rej(new Error('timeout ' + o.type)); } }, 5000); }); }
function assert(c, msg) { if (!c) { console.error('FAIL:', msg); process.exit(1); } console.log('ok -', msg); }
ws.onopen = async () => {
  try {
    for (const f of files) {                     // 官方語料都要能組譯
      const asm = fs.readFileSync(f, 'utf8');
      const m = await req({ type: 'load', asm });
      assert(m.ok && m.rom > 0, `assemble ${f} → ${m.rom} words`);
    }
    let m = await req({ type: 'load', asm: '@2\nD=A\n@3\nD=D+A\n@0\nM=D\n@0\n0;JMP\n' });
    m = await req({ type: 'simulate', steps: 8 });  // 0;JMP 跳回 0
    assert(m.sp === 5 && m.pc === 0, `ADD → sp=${m.sp} pc=${m.pc}`);
    m = await req({ type: 'load', asm: '@SCREEN\nM=-1\n@0\n0;JMP\n' });
    m = await req({ type: 'simulate', steps: 2 });  // @SCREEN 是 A 指令，第 2 步才寫入
    let w0 = null;
    for (const r of m.rows) if (r.r === 0) { const b = Buffer.from(r.b, 'base64'); w0 = b.readUInt16BE(0); }
    assert(w0 === 0xffff, 'screen row0 word0 black');
    m = await req({ type: 'load', asm: '@2\nXXX\n' });  // 組譯錯誤要帶行號
    assert(!m.ok && m.errorLine === 2, `error line=${m.errorLine}`);
    ws.send(JSON.stringify({ type: 'setKey', code: 65, down: true }));
    m = await req({ type: 'ramDump', start: 24576, len: 1 });
    assert(m.data[0] === 65, 'kbd key');
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  ws.close(); process.exit(0);
};
setTimeout(() => { console.error('timeout'); process.exit(1); }, 15000);
NODE
{ kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; } || true
trap - EXIT
echo "== v0.9：hackserve WebSocket HDL 批次模擬回歸 =="
cargo build --release -p hdl2rs >/dev/null
cargo build --release -p hackserve >/dev/null
PORT=8086
target/release/hackserve --port $PORT >/tmp/hackserve-v09.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
node - "$PORT" <<'NODE'
const port = process.argv[2];
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
const waiters = {}; let seq = 0;
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waiters[m.id]) { waiters[m.id](m); delete waiters[m.id]; } };
function req(o) { return new Promise((res, rej) => { const id = ++seq; o.id = id; waiters[id] = res; ws.send(JSON.stringify(o)); setTimeout(() => { if (waiters[id]) { delete waiters[id]; rej(new Error('timeout ' + o.type)); } }, 60000); }); }
function assert(c, msg) { if (!c) { console.error('FAIL:', msg); process.exit(1); } console.log('ok -', msg); }
ws.onopen = async () => {
  try {
    const list = await req({ type: 'hdl-list' });
    assert(list.chapters.some((c) => c.name === '02'), 'hdl-list 含 02');
    const alu = list.chapters.find((c) => c.name === '02').cases.find((c) => c.case === 'ALU');
    assert(alu && alu.hasCompare, '02/ALU hasCompare');
    const m = await req({ type: 'hdl-run', chapter: '02', case: 'ALU' });
    assert(m.ok && m.pass && m.lines > 0, `ALU PASS（${m.lines} 列）`);
    const custom = await req({ type: 'hdl-run', top: 'And9',
      hdl: 'CHIP And9 { IN a, b; OUT out; PARTS: Nand(a=a,b=b,out=n); Nand(a=n,b=n,out=out); }',
      tst: 'load And9.hdl,\noutput-list a%B1.1.1 b%B1.1.1 out%B1.1.1;\nset a 0, set b 0, eval, output;\nset a 1, set b 0, eval, output;\nset a 1, set b 1, eval, output;',
      cmp: '| a | b |out|\n| 0 | 0 | 0 |\n| 1 | 0 | 0 |\n| 1 | 1 | 1 |' });
    assert(custom.ok && custom.pass, '自訂貼上（含 cmp）PASS');
    const bad = await req({ type: 'hdl-run', top: 'Bad9',
      hdl: 'CHIP Bad9 { IN a; OUT out; PARTS: Nand(',
      tst: 'load Bad9.hdl,\noutput-list a%B1.1.1;\nset a 1, eval, output;' });
    assert(!bad.ok, '錯誤 HDL → ok:false');
    const comp = await req({ type: 'hdl-run', release: true, chapter: '05', case: 'ComputerAdd' });
    assert(comp.ok && comp.pass, `ComputerAdd PASS（${comp.lines} 列，含 ROM32K load）`);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  ws.close(); process.exit(0);
};
setTimeout(() => { console.error('timeout'); process.exit(1); }, 180000);
NODE
{ kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; } || true
trap - EXIT
echo "== 全部通過 =="