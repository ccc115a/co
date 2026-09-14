// Rv5：五級管線核心 ── prog2 向後迴圈測試（多次 flush + 向後 JAL）
load Rv5.hdl,
output-file Rv5_2.out,
compare-to Rv5_2.cmp,
output-list pc%X1.4.1 dbgRegLo%D1.6.1 dbgRegHi%D1.6.1 RAM16K[0]%D1.6.1 time%S0.6.1;

ROM32K load prog2.bin,
repeat 50 { tick, tock, output; }
set dbgRd 1, eval, output;
set dbgRd 2, eval, output;
set dbgRd 3, eval, output;