# OutputTest/Main.jack 程式說明

這是第 12 章 OS 的輸出類別（`Output.jack`）測試主程式。它把所有 `Output` 的方法都呼叫一遍，把整套字元集畫上螢幕，並用整數輸出與倒退鍵做最後檢查。

## 概述

- 測試目標：`moveCursor`、`printChar`、`printString`、`println`、`printInt`、`backSpace`。
- 是「視覺型」測試：沒有批次比對，學生直接看螢幕確認字形、游標位置、換行、倒退都正確。
- 依賴：`Output.*`、`String.new/appendChar/doubleQuote`。

## 架構總覽

`function void main()` 大致分四段：

1. **角落定位**：`moveCursor` 把游標擺到 (0,63)、(22,0)、(22,63) 印字元 B、C、D、A——驗證「邊界列 ＆ 螢幕右下」游標不溢出、不跳行。
2. **數字與大小寫**：`printString` 印 `0123456789`、`ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz`。
3. **符號集**：印 `!#$%&'()*+,-./:;<=>?@[\]^_\`{|}~`（30 個字元後接 `"`——由 `String.doubleQuote()` 得來，測雙引號字形的支援）。
4. **整數倒退**：`printInt(-12345)` 換行？不——先印 `-12345`，接著 `backSpace()`（游標左移）再 `printInt(6789)`，製造 `-1234` 被 6789 覆蓋的效果，測 `printInt` 與 `backSpace` 的配合。

## 原理

- **moveCursor(row,col)**：0 ≤ row < 23、0 ≤ col < 64。角落測試驗證 `(22,63)` 印 'D'、之後印 'A' 不應跳列（顯示雖然 row=22 是底行，仍可連續列印直到 `println` 觸發捲動）。
- **printInt 的倒退**：`printInt` 內部用 `String.setInt` 產生字串再 `printString`。這裡把游標移回一格後印 6789，唯一目的：確認 `backSpace` 不跨列、不刪字，只移動游標。
- **雙引號字形**：標準 Hack 字型沒有 `"` 前面的定義時，`String.doubleQuote()` 仍回傳 34；第 3 段把它印出來檢查 34 號字形存在。

## 實作細節

- 開頭 `let s = String.new(1); do s.appendChar(String.doubleQuote());`——製造含一個 `"` 的字串並當 `printString` 參數。這也順帶驗證 `appendChar` 回傳 this 的鏈式用法（此處沒用 `s = s.appendChar(...)`，因為物件位址不變）。
- 所有呼叫都包 `do`（丟掉 void 回傳值）。
- 最後一段刻意不換行，讓 `backSpace` 的效果直接映入眼簾。
- 數字段 `printString("0123456789")` 驗證 48–57 號字形齊全；字母段驗證 65–90（大寫）與 97–122（小寫）；符號段驗證 33 起跳的特殊字元與 34 號（`"`）字形。

## 測試與驗證

在 VM Emulator 中載入 `OutputTest`（含 `Output.vm`、`String.vm`、`Math.vm`、`Memory.vm`、`Array.vm`），執行後對照螢幕：

- 第 0 列第 63 格：`B`；第 22 列左緣 `C`、右緣 `D`、`D` 後應接 `A`（同列末）。
- 第 2 列起依序看到數字列、大小寫 52 字、符號列（含 `"`）。
- 接著 `-12345`，倒退後出現 `-12346789`（'5' 被 6789 覆蓋的前 1 格）——表示印出 `-1234` 後游標後退一格，然後 6789 從後退點開始寫。

判讀錨點一覽：

| 螢幕位置 | 應見 | 背後驗證 |
|----------|------|----------|
| (0,63) | B | 頂列最右格可印 |
| (22,0)、(22,63) | C、D、A | 底列左右邊界、D→A 不跳列 |
| 第 2 列起 | 三列文字 | 字型與 printString/println |
| 最後一列 | -1234 覆成 -12346789 | printInt＋backSpace |

## 延伸討論

這份測試刻意涵蓋「控制碼之外的圖形」與「游標邊界」：若你的 `Output.printChar` 在 col=63 就自動換列，角落測試會立刻露出破綻（B 應佔最後一格而不是跑到下一列）。`printInt` 用 `String.setInt`＋`printString` 而非逐字畫數字，顯示 OS 各類別互相搭配：Output、String、Math 三層分工。