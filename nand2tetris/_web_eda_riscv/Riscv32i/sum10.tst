// sum10.tst：rv32i 記憶體示範 ── sum10（1+...+10=55 存 mem[16] 再讀回）
// HALT（t=37）後 PC 凍結在 9。
load rv32i.hdl,
output-file sum10.out,
compare-to sum10.cmp,
output-list pc%X1.8.1 dbgReg%D1.10.1 RAM32W[16]%D1.10.1 time%S0.6.1;

ROM32 load sum10.hack,
set dbgRd 1,
repeat 45 { tick, tock, output; }
set dbgRd 0, eval, output;
set dbgRd 1, eval, output;
set dbgRd 2, eval, output;
set dbgRd 3, eval, output;
set dbgRd 4, eval, output;
set dbgRd 5, eval, output;
