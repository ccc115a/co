// Rv1：單週期核心 ── prog1 綜合測試
load Rv1.hdl,
output-file Rv1.out,
compare-to Rv1.cmp,
output-list pc%X1.4.1 dbgRegLo%D1.6.1 dbgRegHi%D1.6.1 RAM16K[0]%D1.6.1 time%S0.6.1;

ROM32K load prog1.bin,
repeat 12 { tick, tock, output; }
set dbgRd 1, eval, output;
set dbgRd 2, eval, output;
set dbgRd 3, eval, output;
set dbgRd 4, eval, output;
set dbgRd 5, eval, output;
set dbgRd 6, eval, output;
set dbgRd 7, eval, output;
set dbgRd 8, eval, output;