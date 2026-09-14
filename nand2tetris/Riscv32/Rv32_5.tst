// Rv32_5：五級管線核心 ── prog1 綜合測資
load Rv32_5.hdl,
output-file Rv32_5.out,
compare-to Rv32_5.cmp,
output-list pc%X1.8.1 dbgReg%D1.10.1 RAM32W[12]%D1.10.1 time%S0.4.1;
ROM32 load prog1.bin,
repeat 100 { tick, tock, output; }
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
