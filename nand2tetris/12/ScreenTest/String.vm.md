# ScreenTest/String.vm 程式說明

此檔是第 12 章 OS 的 `String.jack` 編譯結果，被複製進 `ScreenTest` 資料夾供 `Output` 相關函式與 `Main.vm` 的外部呼叫使用。內容與 `KeyboardTest/String.vm`、`StringTest/String.vm` 完全一致（264 行）。

## 概述

- 物件結構：`this 0`＝字元陣列位址、`this 1`＝容量、`this 2`＝目前長度。
- 提供：`new/dispose/length/charAt/setCharAt/appendChar/eraseLastChar`、`intValue/is_digit/digit_val/digit_char`、`setInt/do_set_int`、`newLine/backSpace/doubleQuote`。
- 在 ScreenTest 中的角色：`Output.printString` 要用 `String.length/charAt`；`printInt` 要用 `String.new/setInt/dispose`；`Main.jack` 用 `String.new`＋`appendChar`＋`doubleQuote` 造 `"`。

## 原理（詳見 KeyboardTest/String.vm 說明）

- appendChar 只在 `length < capacity` 時寫，回傳 `this` 支援鏈接。
- intValue 用 Horner 法 `v = v*10 + digit`，前導 `-` 記為負。
- setInt 遞迴 `do_set_int` 逐位 `digit_char`。
- `newLine=128`、`backSpace=129`、`doubleQuote=34`。

## 實作細節

ScreenTest 最需要留意的一段是 `Output.printInt` 對 `String` 的依賴：

```
function Output.printInt 1
push constant 10
call String.new 1
pop local 0
push local 0; push argument 0
call String.setInt 2
...
push local 0; call Output.printString 1
...
push local 0; call String.dispose 1
```

因此 `Main.vm` 的 `Output.moveCursor/printInt/printString` 牽動整條 String 鏈；缺此檔時 `call String.new` 會「函式未定義」。反之若此檔存在但 `setInt` 有錯，`Output.printInt` 印出的數字就會錯位——ScreenTest 雖沒印整數，但仰賴同一個 String 實例的健全性。

## 測試與驗證

ScreenTest.tst（或手動）跑完 `Main.vm` 應畫出房子與太陽；文字部分不會出現。若你的 `String` 有 bug，畫面可能看不出問題——可另以 `StringTest` 的 `.tst` 專測字串。

另外，若 `Output.vm` 的 `printInt/printString` 在 ScreenTest 中被間接呼叫（某些繪圖失敗的錯誤路徑），這裡的 `String` 品質就會決定錯誤訊息是否正常印出——所以「看不到字」也可能是 String 的問題而非 Output。

## 延伸討論

同一份 `String.vm` 出現在三個資料夾（KeyboardTest、ScreenTest、StringTest），是官方專案「測試資料夾自帶依賴」慣例的又一例。若你在 ScreenTest 載入整資料夾時發現 `call` 數量暴增，那正是 `Main.vm` 把字串字面值逐字 `appendChar` 的結果——原本 37 行的 `Main.jack` 編成 104 行的 `Main.vm`，其中就有數十行是在建 `"` 字串。

對 Student 而言，ScreenTest 夾的 `String.vm` 可以當「最小 OS 依賴檢查表」：Screen 先動，`Output` 靠 String＋Math，`Math.init` 靠 Memory＋Array。只要在同一夾內，這五支就構成互相牽動的最小閉包。