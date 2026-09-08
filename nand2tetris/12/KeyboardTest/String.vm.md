# KeyboardTest/String.vm 程式說明

`String.vm` 是第 12 章 OS 類別 `String.jack` 編譯出的 VM 碼（264 行）。它把「字串」做成一個物件：三個欄位 `this[0..2]` = (字元陣列位址, 容量, 現有長度)，並提供 char/string 轉換、增刪字元等功能。`KeyboardTest` 資料夾會用到其中的 `new、appendChar、eraseLastChar、intValue、newLine、backSpace`。

## 概述

- 一個 `String` 物件佔 3 格（`Memory.alloc 3`）：`this 0`＝字元陣列（`Array`），`this 1`＝容量，`this 2`＝目前長度。
- 每個函式的 `argument 0` 都是 `this`（method），故以 `push argument 0; pop pointer 0` 開頭。
- 被誰使用：所有輸出/輸入文字之處（`Output.printString`、`Keyboard.readLine` 等）。

## 架構總覽

| 函式 | 用途 |
|------|------|
| `String.new` | 配置 3 格物件；容量 ≤0 時改設 1（要求「零容量也支援」）；`Array.new(容量)` 存進 `this 0` |
| `dispose` / `length` / `charAt` / `setCharAt` | 釋放、取長度（`this 2`）、按索引讀/寫字元 |
| `appendChar` / `eraseLastChar` | 尾部加字（容量內才加）、尾部減字 |
| `intValue` / `is_digit` / `digit_val` / `digit_char` | 字串 → 整數、字元判別/轉換小工具 |
| `setInt` / `do_set_int` | 整數 → 字串（含負號；遞迴逐位） |
| `newLine` / `backSpace` / `doubleQuote` | 回傳特殊碼 128 / 129 / 34 |

## 原理

- **appendChar**：只有當 `length < capacity`（`this 2 < this 1`）才寫 `this[length] = c` 並加長，回傳 `this` 以便鏈式呼叫（`s = s.appendChar(97)`）。
- **intValue**（Horner 法）：`result = result * 10 + digit`，由左往右掃；開頭若為 `-`（45）記號並從第 1 字元開始。`is_digit` 檢查字元落在 48–57 之間。
- **do_set_int**：`n = n/10`、`digit = n % 10`，把 `digit_char(digit)`（'0'+digit）遞迴地在前面（先除先輸出）組成字串；`setInt` 則先處理負號（appendChar('-')）再呼叫 `do_set_int`。

## 實作細節

- `String.new`：`push argument 0; push constant 0; eq; if-goto IF_TRUE0`——容量為 0 時 `pop argument 0` 設為 1，呼應測試「zero-capacity should be supported」。
- `appendChar` 回傳 `push pointer 0; return`：物件位址（this）留在堆疊頂端，才能讓 `s = s.appendChar(97)` 鏈接下去。
- `intValue` 的負號偵測：
  ```
  push this 2; push constant 0; gt        ; length > 0
  push constant 0; push this 0; add; pop pointer 1; push that 0
  push constant 45; eq                     ; 第一個字元是 '-'
  and
  ```
  兩條件 `and` 才判定是負數。
- `digit_char`/`digit_val` 只是 ±48（'0'）的加減法，顯示 ASCII 的便利性。

## 測試與驗證

`StringTest` 與 `KeyboardTest` 都含此檔。`KeyboardTest` 中 `readLine` 的 backspace 靠 `String.eraseLastChar` 實現、`readInt` 靠 `intValue` 解析；輸入 `-32123` 驗證負號路徑。若有缺失的函式（如忘了實作），測試檔會在中途 `call` 到不存在的函式而當機。

## 延伸討論

Jack 的 `String` 是「定容、可變長」的物件，類似 C 的 `char buf[capacity]`＋長度計數器；append 超過容量會靜默忽略（不擴充、不報錯）。真實語言（如 Java）的 `String` 通常不可變，改變內容要另建新物件；Jack 選擇可變以簡化 OS 實作。`intValue` 的 Horner 迴圈同時是「字元解析」的典型範例，而 `setInt`/`do_set_int` 是它的對偶：解析（字元→數）與列印（數→字元）剛好形成一正一反的遞迴。一次讀懂 `intValue` 與 `do_set_int` 兩支，就能掌握「數字進出字串」的完整圖像。