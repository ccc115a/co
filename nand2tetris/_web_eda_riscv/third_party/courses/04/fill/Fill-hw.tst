// Fill 的行為驗證（跑在 Computer.hdl 之上）
// 驗證無按鍵時把螢幕塗白（0）、有按鍵時塗黑（-1）。
// 只跑一部份幀（~100 個字元），用中間地帶的 cell 做穩健檢查點：
// 相鄰兩階段的交界會落在 [95,117]（每格 17~21 個週期），
// 所以 94 一定是白、118~189 一定是黑，與迴圈週期無關。

load Computer.hdl,
output-file Fill-hw.out,
compare-to Fill-hw.cmp,
output-list SCREEN[94]%D1.7.1 SCREEN[118]%D1.7.1 SCREEN[189]%D1.7.1;
ROM32K load Fill.hack,

set reset 1, tick, tock, set reset 0,
set Keyboard 0,              // 無按鍵 → 白色
repeat 2000 { tick, tock, }
output;

set Keyboard 7,              // 有按鍵 → 黑色（未塗區域從此行之後全變黑）
repeat 2000 { tick, tock, }
output;