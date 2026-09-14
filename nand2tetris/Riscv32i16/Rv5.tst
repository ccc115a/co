// Rv5：五級管線核心 ── prog1 綜合測試（含 load-use stall、前遞、flush）
//   14 條指令；stall 1 拍 + JAL flush，約在 c18 前全部排空；讀取用 t=24。
load Rv5.hdl,
output-file Rv5.out,
compare-to Rv5.cmp,
output-list pc%X1.4.1 dbgRegLo%D1.6.1 dbgRegHi%D1.6.1 RAM16K[0]%D1.6.1 time%S0.6.1;

ROM32K load prog1.bin,
repeat 24 { tick, tock, output; }
set dbgRd 1, eval, output;
set dbgRd 2, eval, output;
set dbgRd 3, eval, output;
set dbgRd 4, eval, output;
set dbgRd 5, eval, output;
set dbgRd 6, eval, output;
set dbgRd 7, eval, output;