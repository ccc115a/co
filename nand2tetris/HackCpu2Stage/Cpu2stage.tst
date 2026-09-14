load Cpu2stage.hdl,
output-file Cpu2stage.out,
output-list pc[]%D2.5.2 writeM%B2.1.2 addressM[]%D2.15.2 outM[]%D2.15.2;

// 測試腳本：因為有 1-Cycle 管線延遲，所以我們印出每個 step，不特別比對（不設 compare-to）
// 觀察指令是否在第二個 Clock 才真正生效！
set inM 0,
set reset 1,
set instruction 0,
tick, tock, output,

set reset 0,
set instruction 12345, // @12345 (A-instruction)
tick, tock, output,

set instruction 3192,  // 另一個數值，但此時上一道的 @12345 才剛進管線開始運算
tick, tock, output,
