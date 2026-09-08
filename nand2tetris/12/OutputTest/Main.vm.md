# OutputTest/Main.vm 程式說明

`Main.vm` 是 `OutputTest/Main.jack` 編譯出的 VM 碼（254 行）。它大量示範了「字串字面值 → `String.new` + 一串 `appendChar`」的展開，以及把所有 `Output` 函式逐一 `call` 的骨幹。

## 概述

- 進入點：`function Main.main 1`（1 個 local = `s`）。
- 整支程式沒有運算、沒有分支，全是 `call` 序列——是「呼叫密集」型 VM。
- 對 VM 翻譯器而言，這支檔的目的在驗證 `call/return` 與 `push/pop` 在「密集、連續」使用下穩定。

## 架構總覽

每段印出都是一個模板：

```
push constant 10
call String.new 1                ; 容量＝字串長
push constant 48; call String.appendChar 2   ; '0'
push constant 49; call String.appendChar 2   ; '1'
...                               ; 依此類推每個字元
call Output.printString 1
pop temp 0
```

角落定位則是 `moveCursor`：

```
push constant 0; push constant 63
call Output.moveCursor 2; pop temp 0
push constant 66
call Output.printChar 1; pop temp 0
```

`moveCursor(row, col)` 的兩參數就是 `argument 0=row`、`argument 1=col`。

## 原理

- **String 字面值 = 建構**：Jack 編譯器把 `"0123456789"` 變成一開始的 `String.new(10)` 與十次 `appendChar`。因此 43 行的 Main.jack 會長成 254 行的 VM。
- **printInt 的負數**：`printInt(-12345)` 的低層只是 `push constant 12345; neg; call Output.printInt 1`——`neg` 在堆疊頂端取負，再把結果當參數。
- **直接輸出**：所有 `Output.printChar/printString/printInt/println/backSpace` 回傳值（0）均由 `pop temp 0` 丟棄。

## 實作細節

| Jack | VM |
|------|----|
| `Output.moveCursor(0, 63)` | `push constant 0; push constant 63; call Output.moveCursor 2` |
| `Output.printChar(66)` | `push constant 66; call Output.printChar 1` |
| `Output.printString("…")` | `String.new(n)` + n 次 `push 字元; call String.appendChar 2` + `call Output.printString 1` |
| `Output.printInt(-12345)` | `push constant 12345; neg; call Output.printInt 1` |
| `Output.backSpace()` | `call Output.backSpace 0; pop temp 0` |
| `s.appendChar(String.doubleQuote())` | `push local 0; call String.doubleQuote 0; call String.appendChar 2` |

最後 `push constant 0; return` 結束。

## 測試與驗證

VM Emulator 載入 `OutputTest.tst`（或手動把 `Output.vm`、`String.vm`、`Math.vm`、`Array.vm`、`Memory.vm` 一起 load 後直接 Run）。觀察螢幕：角落 4 字、數字/大小寫/符號三列、以及 `-1234` 被 `6789` 覆蓋的過程。`.tst` 不設 RAM 檢查，答案要用眼睛看。

## 延伸討論

注意 `Output.printInt` 需要底層 `String.setInt`（內部再呼叫 `Math.divide` 遞迴），所以 `Output.vm` 在執行 `printInt` 時會形成 `Output.printInt → String.setInt → String.do_set_int → Math.divide → Math.multiply` 的深層呼叫堆疊。這段 VM 正好可以拿來讓學生觀察「函式呼叫的堆疊框架協定」：LCL、ARG、THIS、THAT 逐層備份與還原。