// Jack → VM → ASM → HACK 全鏈路 e2e：1+...+10
// Main.init 把 static 變數 sum（hackasm 分配至 RAM[16]）累加成 55，之後無窮迴圈。
load Computer.hdl,
output-file sum.out,
compare-to sum.cmp,
output-list RAM16K[16]%D1.7.1;

ROM32K load sum.hack,

set reset 0,
output;

repeat 2000 {
    tick, tock, output;
}
