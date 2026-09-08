# ScreenTest/Screen.vm 程式說明

`Screen.vm` 是第 12 章 OS 類別 `Screen.jack` 編譯出的 VM 碼（469 行）。它把「螢幕＝512×256 點、每點一位元」的像素陣列包裝成 `drawPixel`、`drawLine`、`drawRectangle`、`drawCircle` 等繪圖 API。

## 概述

- 螢幕基底 `static 0` = 16384；`clearScreen` 把 0..8191（共 8192 個 16 位元字）清為背景色。
- `static 1`：目前顏色（true=塗黑 / false=清除）；`static 4`=false、`static 5`=true（初始化用）。
- 「點」的最小單位是一個位元，但畫水平線時整字寫入以加速。
- 被誰使用：所有要畫圖的 Jack 程式；ScreenTest 與第 9 章遊戲都靠它。

## 架構總覽

| 函式 | 標頭 | 行為 |
|------|------|------|
| `Screen.init` | 0 | 設基底、顏色、呼叫者寫好的值 |
| `Screen.clearScreen` | 1 | 迴圈把 8192 格填背景 |
| `Screen.setColor` | 0 | `static 1 = color` |
| `Screen.drawPixel` | 2 | 單點 set/clear |
| `Screen.drawLine` | 3 | 依 dx/dy 分類：垂直/水平/斜線 |
| `Screen.drawDiagonalLine` | 4 | Bresenham 式全域斜線 |
| `Screen.drawVerticalLine` | 1 | 垂直線 |
| `Screen.drawHorizontalLine` | 4 | 水平線（整字優化） |
| `Screen.draw_short_horizontal_line` | 0 | 短水平線（逐點） |
| `Screen.drawRectangle` | 1 | 逐列水平線填滿 |
| `Screen.drawCircle` | 3 | 逐列算半寬再水平線 |

## 原理

- **位址計算**：`row` 的像素在「第 row 列、第 x 點」的螢幕字號 = `row*32 + x/16`（32 字列）。`drawPixel`：
  ```
  push argument 1; push constant 32; call Math.multiply 2      ; row*32
  push argument 0; push constant 16; call Math.divide 2; add   ; + x/16
  ```
  遮罩位元 = `Math.two_to_the(x mod 16)`（查 `Math` 的次方表）。
- **顏色運算**：true 時 `RAM[addr] = RAM[addr] | mask`；false 時 `= RAM[addr] & ~mask`。
- **drawLine 分類**：先做「x1>x2 則互換」的排序保證由左往右；若 `dx=0` 走垂直、`dy=0` 走水平、否則 `drawDiagonalLine`。

## 實作細節

- **drawDiagonalLine（Bresenham）**：`local 3` = dy 符號（−1 或 1），誤差累計 `local 2`：每一步若 `error < 0` 就 `x+1、error += |dy|`，否則 `y+=sign、error -= dx`。循環終止條件要同時檢查 x 方向與 y 方向（依 dy 正負），見 `WHILE_EXP0` 的雙條件 `and`/`or` 組裝。
- **drawHorizontalLine 的整字優化**：先取起/迄點的 `x mod 16`（local 2、3）與字號首尾（local 0、1）。同一個字內時直接 `draw_short_horizontal_line`；否則填滿中間的完整字（`push static 1; pop that 0`——整格一次寫成前景色），首尾半字各自 `draw_short_horizontal_line`。`end_word_index` 在右邊界非 0 時 `+1` 讓迴圈涵蓋結尾字。
- **drawCircle**：
  ```
  local 1 = -r ... +(r)        ; 逐列
  local 2 = r*r
  local 0 = Math.sqrt(r*r - local 1*local 1)
  drawHorizontalLine(cx-..., cx+..., cy+local 1)
  ```
  這正是「圓 = 一整列一整列的短水平線」；r=30 的太陽只需 61 次水平線呼叫，遠比逐點快。
- **drawRectangle**：`for y in y1..y2: drawHorizontalLine(x1, x2, y)`。

## 測試與驗證

`ScreenTest/Main.vm` 畫出「房＋太陽」；肉眼比對即可。較嚴謹的跑法：用 VM Emulator 開 `ScreenTest.tst`（若存在），Run 到結束後直接看螢幕畫布。可針對角落、全寬水平線（0→511）與對角線各追蹤 `drawPixel` 是否符合 16 種座標的遮罩邏輯。

## 延伸討論

- **整字寫入 vs 逐點**：水平線實作犧牲一點程式長度換取 16 倍速。真實 VGA 驅動採用完全相同手法（byte/word 对齐）。
- `drawCircle` 用 `Math.sqrt`（自行實現）而非浮點三角函數——Hack 只有整數運算，這是「查表＋平方根」的典型取捨。
- 若把這份 `Screen.vm` 的 `scroll` 省略，Output 捲動會直接關閉（清屏），但 Screen 繪圖不受影響，反映「輸出類別與繪圖類別各自獨立」的分層設計。