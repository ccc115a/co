// Rv1：單週期核心 ── prog2 向後迴圈測試
load Rv1.hdl,
output-file Rv1_2.out,
compare-to Rv1_2.cmp,
output-list pc%X1.4.1 dbgRegLo%D1.6.1 dbgRegHi%D1.6.1 RAM16K[0]%D1.6.1 time%S0.6.1;

ROM32K load prog2.bin,
repeat 20 { tick, tock, output; }
set dbgRd 1, eval, output;
set dbgRd 2, eval, output;
set dbgRd 3, eval, output;