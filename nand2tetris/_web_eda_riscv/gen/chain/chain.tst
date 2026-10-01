// Jack → VM → ASM → HACK 全鏈路 e2e（_eda/jack2vm + _eda/vm2asm + _eda/hackasm）
// Main.init 把 static 變數 Main.0（hackasm 分配至 RAM[16]）設為 5，之後無窮迴圈。
load Computer.hdl,
output-file chain.out,
compare-to chain.cmp,
output-list RAM16K[16]%D1.7.1;

ROM32K load chain.hack,

set reset 0,
output;

repeat 5000 {
    tick, tock, output;
}