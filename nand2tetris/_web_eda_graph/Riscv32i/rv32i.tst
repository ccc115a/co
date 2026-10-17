// rv32i.tst：rv32i 單週期核心 ── rv32i_prog 綜合測資（60 指令）
// 中途探測 jal link（t=35 取 x30=35）與 jalr link（t=40 取 x29=39），
// 結尾掃全部 x0..x31。HALT（t=59）後 PC 凍結在 55。
load rv32i.hdl,
output-file rv32i.out,
compare-to rv32i.cmp,
output-list pc%X1.8.1 dbgReg%D1.10.1 RAM32W[4]%D1.10.1 RAM32W[8]%D1.10.1 RAM32W[12]%D1.10.1 time%S0.6.1;

ROM32 load rv32i_prog.hack,
repeat 35 { tick, tock, output; }
set dbgRd 30, eval, output;
repeat 5 { tick, tock, output; }
set dbgRd 29, eval, output;
repeat 30 { tick, tock, output; }
set dbgRd 0, eval, output;
set dbgRd 1, eval, output;
set dbgRd 2, eval, output;
set dbgRd 3, eval, output;
set dbgRd 4, eval, output;
set dbgRd 5, eval, output;
set dbgRd 6, eval, output;
set dbgRd 7, eval, output;
set dbgRd 8, eval, output;
set dbgRd 9, eval, output;
set dbgRd 10, eval, output;
set dbgRd 11, eval, output;
set dbgRd 12, eval, output;
set dbgRd 13, eval, output;
set dbgRd 14, eval, output;
set dbgRd 15, eval, output;
set dbgRd 16, eval, output;
set dbgRd 17, eval, output;
set dbgRd 18, eval, output;
set dbgRd 19, eval, output;
set dbgRd 20, eval, output;
set dbgRd 21, eval, output;
set dbgRd 22, eval, output;
set dbgRd 23, eval, output;
set dbgRd 24, eval, output;
set dbgRd 25, eval, output;
set dbgRd 26, eval, output;
set dbgRd 27, eval, output;
set dbgRd 28, eval, output;
set dbgRd 29, eval, output;
set dbgRd 30, eval, output;
set dbgRd 31, eval, output;
