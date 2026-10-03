// Mult 的行為驗證（跑在 Computer.hdl 之上，對照官方 Mult.cmp 六個檢查點）
// 官方 CPU Emulator 用 PC/reset 重跑的流程，這裡以 reset pin + RAM16K[i] 達成。
// RAM16K[2] 應等於 RAM16K[0] × RAM16K[1]（負值前置檢查程式有把 product 歸零）。

load Computer.hdl,
output-file Mult-hw.out,
compare-to Mult-hw.cmp,
output-list RAM16K[0]%D2.6.2 RAM16K[1]%D2.6.2 RAM16K[2]%D2.6.2;
ROM32K load Mult.hack,

// 第 1 節：(0, 0) → 0
set reset 1, tick, tock, set reset 0,
set RAM16K[2] -1,
set RAM16K[0] 0, set RAM16K[1] 0,
repeat 20 { tick, tock, }
set RAM16K[0] 0, set RAM16K[1] 0,
output;

// 第 2 節：(1, 0) → 0
set reset 1, tick, tock, set reset 0,
set RAM16K[2] -1,
set RAM16K[0] 1, set RAM16K[1] 0,
repeat 50 { tick, tock, }
set RAM16K[0] 1, set RAM16K[1] 0,
output;

// 第 3 節：(0, 2) → 0
set reset 1, tick, tock, set reset 0,
set RAM16K[2] -1,
set RAM16K[0] 0, set RAM16K[1] 2,
repeat 80 { tick, tock, }
set RAM16K[0] 0, set RAM16K[1] 2,
output;

// 第 4 節：(3, 1) → 3
set reset 1, tick, tock, set reset 0,
set RAM16K[2] -1,
set RAM16K[0] 3, set RAM16K[1] 1,
repeat 120 { tick, tock, }
set RAM16K[0] 3, set RAM16K[1] 1,
output;

// 第 5 節：(2, 4) → 8
set reset 1, tick, tock, set reset 0,
set RAM16K[2] -1,
set RAM16K[0] 2, set RAM16K[1] 4,
repeat 150 { tick, tock, }
set RAM16K[0] 2, set RAM16K[1] 4,
output;

// 第 6 節：(6, 7) → 42
set reset 1, tick, tock, set reset 0,
set RAM16K[2] -1,
set RAM16K[0] 6, set RAM16K[1] 7,
repeat 210 { tick, tock, }
set RAM16K[0] 6, set RAM16K[1] 7,
output;