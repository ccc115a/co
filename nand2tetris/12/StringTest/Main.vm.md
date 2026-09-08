# StringTest/Main.vm 程式說明

`Main.vm` 是 `StringTest/Main.jack` 編譯出的 VM 碼（469 行）。它是「呼叫 `String` 各方法 + 收集結果輸出」的長型程式，字串字面值照例展開成一長串 `String.new` + `appendChar`。

## 概述

- 進入點：`function Main.main 2`（local 0 = `s`、local 1 = `i`）。
- 按步驟 1–12 依序呼叫 `String.new`、`appendChar`、`dispose`、`setInt`、`length`、`charAt`、`setCharAt`、`eraseLastChar`、`intValue`、`backSpace`、`doubleQuote`、`newLine`。
- 對 VM 翻譯器是「method 呼叫（含 this）+ 字串建構」的密集案例。

## 架構總覽

Method 呼叫的標準型態（以 `s.length()` 為例）：

```
push local 0              ; this = s
call String.length 1      ; this 就是 argument 0
push constant 8
call String.new 1         ; 建 "length: " 字串
...
call Output.printInt 1    ; 印 length 值
```

`setCharAt(2, 45)`：

```
push local 0; push constant 2; push constant 45
call String.setCharAt 3   ; (this, index, value)
pop temp 0
```

`dispose`：

```
push local 1; call String.dispose 1; pop temp 0
```

## 原理

- **隱含 this**：Jack 的 method 呼叫變成「第一位參數＝物件」；所以 `s.length()` 在 VM 是 `call String.length 1`、`setCharAt(2,45)` 是 `call String.setCharAt 3`。所有 String 方法的第一個參數都是 `argument 0`（即 this）。
- **賦值動作**：`let i = String.new(6);` → `call String.new 1; pop local 1`；`do i.setInt(12345);` → `push local 1; push constant 12345; call String.setInt 2; pop temp 0`。
- **鏈式 append**：`s = s.appendChar(97)` 翻成 `push local 0; push constant 97; call String.appendChar 2; pop local 0`——回傳值（還是同一位址）存回 local。

## 實作細節

| Jack | VM |
|------|----|
| `String.new(0)` | `push constant 0; call String.new 1` |
| `i.setInt(12345)` | `push local 1; push constant 12345; call String.setInt 2` |
| `s.length()` | `push local 0; call String.length 1` |
| `s.charAt(2)` | `push local 0; push constant 2; call String.charAt 2` |
| `s.setCharAt(2,45)` | `push local 0; push constant 2; push constant 45; call String.setCharAt 3` |
| `s.eraseLastChar()` | `push local 0; call String.eraseLastChar 1; pop temp 0` |
| `String.backSpace()` | `call String.backSpace 0`（function，無 this） |

`"456"` 字面值是 `String.new(3)`＋三個 `appendChar`，最後 `pop local 0`；`"-32123"` 同理（new 6）——字串字面值在 VM 層就是「動態建物」。

## 測試與驗證

VM Emulator 載入 `StringTest` 資料夾（含所有 OS vm）後 Run。輸出逐行對照 `Main.jack` 的註解（見該檔表格）。若 `String.zero-capacity` 未處理，第 4 行前的 `call String.dispose` 即會當機或輸出怪值。

## 延伸討論

注意 `"minus before new"`：`let s = "-32123"` 的編譯結果中負號只是字元 45 的 append，與 `setInt` 的負號路徑完全不同——一個靠「字元資料」、一個靠「數值再轉字元」。這支 VM 是練習「追蹤 method 呼叫的 this 協定」的最佳教材：每一行 `call String.Xxx n` 的 n 都比源碼參數多 1。