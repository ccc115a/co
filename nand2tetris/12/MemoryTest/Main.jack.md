# MemoryTest/Main.jack 程式說明

這是第 12 章 OS 的記憶體類別（`Memory.jack`）測試主程式。它直接呼叫 `Memory.peek/poke`，並透過 `Array.new/dispose` 間接測試 `Memory.alloc/deAlloc`，最後把結果寫入 RAM[8000]–[8005] 供批次比對。

## 概述

- 與 `ArrayTest` 幾乎同構，但多了對 `Memory.peek` / `Memory.poke` 的第一手測試。
- 驗證重點：(1) `peek/poke` 讀寫正確；(2) `alloc` 回傳可用區塊且未重疊；(3) `deAlloc` 讓空間可重用。
- 依賴：`Memory.*`、`Array.*`。

## 架構總覽

`function void main()` 變數：`temp`（int）、`a`、`b`、`c`（Array）。流程：

| 步驟 | 動作 | RAM 結果 |
|------|------|----------|
| 1 | `Memory.poke(8000, 333)`；`temp = Memory.peek(8000)`；`poke(8001, temp+1)` | RAM[8000]=333、RAM[8001]=334 |
| 2 | `a = Array.new(3); a[2] = 222;` 寫 RAM[8002]=`a[2]` | RAM[8002]=222 |
| 3 | `b = Array.new(3); b[1] = a[2]-100;` | RAM[8003]=122 |
| 4 | `c = Array.new(500); c[499] = a[2]-b[1];` | RAM[8004]=100 |
| 5 | `dispose a,b`；`b = Array.new(3); b[0] = c[499]-90;` | RAM[8005]=10 |
| 6 | `dispose c,b` | — |

## 原理

- **peek/poke 直通 RAM**：`Memory.jack` 以 static `memory`（＝0）對映整顆 RAM，`peek(a)` 回傳 `memory[a]`、`poke(a,v)` 寫入。測試用它們把「結果巴士」寫到 8000–8005。
- **重用測試**：步驟 5 在釋放三組（3、3、500 格）後立刻再 `new(3)`。正確的 `deAlloc` 會把釋放塊送回 free list，「最好適配（best fit）」演算法會優先配出剛好 3 格的那塊；若回收失敗，新 `b` 會撞到 `c` 或取到垃圾，RAM[8005] 就非 10。

## 實作細節

- `do Memory.poke(8000, 333);` 因 `poke` 是 function，直接呼叫；`temp = Memory.peek(8000)` 由函式回傳值。
- `a`、`b`、`c` 的陣列操作與 `ArrayTest` 相同（見其 jack 說明），差異只在「外送點」：這裡多繞一層 `Memory.poke(addr, value)`。
- 註解已標出每一步的期望 RAM 值，可當元件驗收清單。
- 步驟 2–4 使用三個不同大小的陣列（3、3、500），使 free list 必須同時容納多種區塊尺寸；步驟 5 在釋放後立刻復用，考驗回收邏輯。

## 測試與驗證

`MemoryTest.tst` 輸出清單含 RAM[8000..8005]，期望值：

```
|     333 |     334 |     222 |     122 |     100 |      10 |
```

在 VM Emulator 中：如要測「自己寫的 Memory.jack」，先把它編譯成 `Memory.vm` 再與 `Main.vm`、`Array.vm` 一起載入；對比 `.cmp` 通過即代表 alloc/deAlloc/peek/poke 四者全數正確。

## 延伸討論

這個測試的順序刻意把「配置的塊大小」做成 3、3、500、3（釋放後重用），逼近 best-fit 的「最小誤配」壓力；若 free list 是 FIFO 而不是 best-fit，結果可能仍正確但內部碎片不同。真正的 OS 常會合併相鄰自由塊（coalescing），`Memory.jack` 的 `deAlloc` 正是這樣設計的——下一步建議讀 `MemoryTest/Memory.jack` 說明理解 free list 三個欄位的結構。另外可修改測試參數（例如把 `Array.new(500)` 改成 4、把 3 改成 2）自製「碎片壓力場」，讓 coalescing 的邊界條件更容易被逼出來。