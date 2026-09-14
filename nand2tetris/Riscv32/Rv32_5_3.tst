// Rv32_5_3：五級管線核心 ── prog3（後跳迴圈＋負位移）
load Rv32_5.hdl,
output-file Rv32_5_3.out,
compare-to Rv32_5_3.cmp,
output-list pc%X1.8.1 dbgReg%D1.10.1 RAM32W[0]%D1.10.1 time%S0.4.1;
ROM32 load prog3.bin,
repeat 25 { tick, tock, output; }
set dbgRd 1, eval, output;
set dbgRd 2, eval, output;
set dbgRd 3, eval, output;
set dbgRd 4, eval, output;
set dbgRd 5, eval, output;
set dbgRd 6, eval, output;