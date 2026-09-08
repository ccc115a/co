# StringTest/String.vm 程式說明

`String.vm` 是第 12 章 OS 的 `String.jack` 編譯結果（264 行）。這是 `StringTest` 資料夾直接被測試的對象：`Main.vm` 對它的 `new/appendChar/setInt/length/charAt/setCharAt/eraseLastChar/intValue` 等逐一實測。

## 概述

- `String` 物件＝3 格 heap：`this 0`＝字元陣列位址、`this 1`＝容量、`this 2`＝目前長度。
- 全為 method（`argument 0`＝this），只有 `newLine/backSpace/doubleQuote` 三個是 function。
- 支援字元流操作與「字串↔整數」雙向轉換。

## 架構總覽

| 函式 | 類別 | 行為 |
|------|------|------|
| `new` | constructor | `Memory.alloc 3`；容量 ≤0 → 1；`Array.new(cap)`、寫 three fields，回傳 this |
| `dispose` | method | `Array.dispose(charArray)` |
| `length` / `charAt` / `setCharAt` | method | 取長度／讀寫字元 |
| `appendChar` / `eraseLastChar` | method | 尾加／尾刪 |
| `intValue` | method | 字元→整數（Horner） |
| `setInt` / `do_set_int` | method | 整數→字元（遞迴） |
| `is_digit`/`digit_val`/`digit_char` | 內部 helper | 字符判別與轉換 |
| `newLine`/`backSpace`/`doubleQuote` | function | 回 128 / 129 / 34 |

## 原理

- **appendChar 的防溢**：`this 2 < this 1`（長度 < 容量）才寫與遞增；超出則忽略——配合「容量 6 存 5 字元 abcde，`setInt` 後 `-32767` 恰好 6 」的測試規格。
- **intValue**：`v=0`、`neg=false`；若有 `-` 且長度>0 則從 index1 起、`neg=true`；迴圈 `v = v*10 + (char[j]-'0')` 直到非 digit；最後 `neg ? -v : v`。
- **setInt**：清零長度，負數先 append `-`（並對值取負），再遞迴 `do_set_int(n)`。
- **do_set_int**（尾端取位）：`q = n/10`、`digit = n - q*10`（用 `Math.divide`＋`Math.multiply`）、`c = digit_char(digit)`；若 `n<10` 直接 append，否則 `do_set_int(q)` 再 append——保證高位先寫。

## 實作細節

- `String.new` 的零容量分支：
  ```
  push argument 0; push constant 0; eq
  if-goto IF_TRUE0   ; 容量0 → 改1
  ...
  push argument 0; call Array.new 1; pop this 0      ; charArray
  push argument 0; pop this 1                        ; capacity
  push constant 0; pop this 2                        ; length
  push pointer 0; return                             ; 回傳 this
  ```
- `charAt` 的「this + index」存取即 `push argument 1; push this 0; add; pop pointer 1; push that 0`。
- `digit_char` 與 `digit_val` 只是 ±48；`Math.multiply`/`divide` 由 ScreenTest 版提供（此檔亦呼叫相同名稱的 `Math.*`）。
- `intValue` 的 `-` 判斷用 `and` 連結「長度>0」與「首字元=45」兩個條件，再於 `IF_TRUE0` 設 `local 2 = true`（`push constant 0; not`）。

## 測試與驗證

`StringTest.tst`（或手動載入 StringTest 資料夾）執行 `Main.vm`，螢幕輸出須逐行符合 Main.jack 註解。此檔同時是 Keyboard/Output 的底層（`readLine`、`printInt` 都仰賴它），任一支與 Main.vm 同夾的檔都隱含驗證其基本功能。

## 延伸討論

- **為何 `new(0)` 要撐成 1**：全 OS 共同約定「至少一格」避免 `Array.new(0)` 回傳 null 指標而崩潰；StringTest 第一步正是測試這個邊界。
- **可變 vs 不可變**：`setCharAt`/`eraseLastChar` 就地修改，方便 OS 節省記憶體；真實應用多用不可變字串（安全、可共用），此處則以「直接管理記憶體」為第一優先。
- 遞迴 `do_set_int` 說明了「字串串接的順序 = 數字的位數順序」：先除十、先輸出，是最後進來的數字char。與 intValue 的方向正好相反，一組對稱。