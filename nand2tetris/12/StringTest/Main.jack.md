# StringTest/Main.jack 程式說明

這是第 12 章 OS 的字串類別（`String.jack`）測試主程式。它逐一驗證 `String` 的每個方法，並把結果印在螢幕上（附註解標出期望值）。

## 概述

- 測試目標所有主要 API：`new`（含零容量）、`appendChar`、`dispose`、`setInt`、`length`、`charAt`、`setCharAt`、`eraseLastChar`、`intValue`、`backSpace`、`doubleQuote`、`newLine`。
- 與 ArrayTest/MathTest 不同，這裡用 `Output.printString/printInt` 直接印出結果給人看（每個註解標明期望輸出）。
- 依賴：`String.*`、`Output.*`。

## 架構總覽

`function void main()` 變數 `s`、`i`。測試順序與預期輸出：

| 步驟 | 動作 | 預期畫面 |
|------|------|----------|
| 1 | `String.new(0)` 再 dispose（零容量要能建立） | （無輸出，僅不當機） |
| 2 | `String.new(6)`，appendChar 97..101 | `new,appendChar: abcde` |
| 3 | `i.setInt(12345)` | `setInt: 12345` |
| 4 | `i.setInt(-32767)`（最小負數極端的正數端） | `setInt: -32767` |
| 5 | `s.length()` | `length: 5` |
| 6 | `s.charAt(2)` | `charAt[2]: 99` |
| 7 | `s.setCharAt(2, 45)` | `setCharAt(2,'-'): ab-de` |
| 8 | `s.eraseLastChar()` | `eraseLastChar: ab-d` |
| 9 | `let s = "456"; s.intValue()` | `intValue: 456` |
| 10 | `let s = "-32123"; s.intValue()` | `intValue: -32123` |
| 11 | `String.backSpace()` 等三個常數 | `backSpace: 129`、`doubleQuote: 34`、`newLine: 128` |

最後 dispose 兩個物件。

## 原理

- **零容量**：`String.new(0)` 要求容量 0；實作需自行把「容量 ≤ 0」提昇為 1（見 String.vm 的 `String.new`），否則 `Array.new(0)` 配置 0 格、append 立刻溢位。這是一個「邊界可用性」測試。
- **setInt 負數**：`-32767` 驗證「最小負數 / 最大正數」第二極端（−32768 刻意不測，因 `-(-32768)` 溢位）。
- **intValue 解析**：正數 456 與帶負號 −32123 都須由字元逐一解析。
- **setCharAt(2,45)**：將第 2 字元換成 `-`（45），`abcde`→`ab-de`；反應「覆寫」而非「插入」。

## 實作細節

- 開啟的 `i` 容量 6，`setInt(12345)` 剛好 5 字元、`-32767` 為 6 字元——驗證容量 6 恰到好處（再多就「靜默截斷」）。
- `let s = s.appendChar(97);` 用鏈式回傳，測 appendChar 的「回傳 this」設計。
- 三個常數測試直接 `Output.printInt(String.backSpace())`——驗證 OS 的「虛擬鍵」ASCII 約定。

## 測試與驗證

VM Emulator 載入 `StringTest` 資料夾（含 `String.vm`、`Output.vm`、`Math.vm`、`Memory.vm`、`Array.vm`）後 Run，比對螢幕逐行：

```
new,appendChar: abcde
setInt: 12345
setInt: -32767
length: 5
charAt[2]: 99
setCharAt(2,'-'): ab-de
eraseLastChar: ab-d
intValue: 456
intValue: -32123
backSpace: 129
doubleQuote: 34
newLine: 128
```

任何一行不符即代表對應方法有誤。

## 延伸討論

這份「以輸出驗收」的測試為 OS 開發提供了快速迴圈：改 `String.jack` → 重編譯 → 跑資料夾 → 看螢幕。相較 `.cmp` 批次測試，它犧牲自動化但保留了「誰錯在哪一目了然」的診斷力。真實語言的 `String`（如 Java）通常不可變，這裡可變的設計配上 `dispose` 正好示範「OS 自管記憶體」的必要。