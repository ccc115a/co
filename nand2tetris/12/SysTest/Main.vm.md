# SysTest/Main.vm 程式說明

此檔是 `SysTest/Main.jack` 的 VM 編譯結果。**注意：本資料夾中沒有實際的 `Main.vm` 檔**（與其他測試夾不同），此說明列出「重新編譯後應得的標準 VM 碼」並解說其結構，作為自行實作時的對照。

## 概述

- 進入點：`function Main.main 1`（1 個 local = `key`）。
- 三個字串字面值會在編譯期展開為 `String.new` + 一串 `appendChar`，加上兩段 `Keyboard.keyPressed` 輪詢與一次 `call Sys.wait 1`。
- 這支 VM 簡潔：沒有算術，只有字串建構、輪詢迴圈與單一 wait 呼叫。

## 架構總覽（標準編譯結果）

```
function Main.main 1
; "Wait test:"（10 字元）
push constant 10
call String.new 1
push constant 87; call String.appendChar 2   ; 'W'
push constant 97; call String.appendChar 2   ; 'a'
...                                           ; 'i','t',' ','t','e','s','t',':'
call Output.printString 1; pop temp 0
call Output.println 0; pop temp 0
; "Press any key. After 2 seconds, another message will be printed:"（64 字元）
push constant 64
call String.new 1
push constant 80; call String.appendChar 2   ; 'P'
... （共 64 次）
call Output.printString 1; pop temp 0
; while (key = 0)
label WHILE_EXP0
push local 0; push constant 0; eq; not
if-goto WHILE_END0
call Keyboard.keyPressed 0; pop local 0
goto WHILE_EXP0
label WHILE_END0
; while (~(key = 0))
label WHILE_EXP1
push local 0; push constant 0; eq; not; not
if-goto WHILE_END1
call Keyboard.keyPressed 0; pop local 0
goto WHILE_EXP1
label WHILE_END1
push constant 2000
call Sys.wait 1
pop temp 0
; "Time is up. Make sure that 2 seconds had passed."（48 字元）
push constant 48
call String.new 1
push constant 84; call String.appendChar 2   ; 'T'
... （共 48 次）
call Output.printString 1; pop temp 0
push constant 0
return
```

## 原理

- 兩段輪詢的差別在 `not` 數量：第一段把 `eq` 的結果 `not` 後當條件（key=0 時 `eq`→true、`not`→false，跳出）；第二段再 `not` 一次（映射 `~(key=0)`）。
- 字元碼：`'W'=87`、空格=32；`'Time…'` 的 `'T'=84`。長度 10、64、48 正是三個字串的字元數，作為 `String.new` 的容量參數。

## 實作細節

| Jack | VM |
|------|----|
| `while (key = 0)` | `push local 0; push constant 0; eq; not; if-goto …` |
| `let key = Keyboard.keyPressed();` | `call Keyboard.keyPressed 0; pop local 0` |
| `do Sys.wait(2000);` | `push constant 2000; call Sys.wait 1; pop temp 0` |

## 測試與驗證

若你自行編譯 `Main.jack` 得到 `Main.vm`，將它與 `Sys.vm`、`Keyboard.vm`、`Output.vm`、`String.vm`、`Memory.vm`、`Array.vm`、`Math.vm`、`Screen.vm` 同夾載入 VM Emulator，則可走完整互動流程（按鍵→等 2 秒→看訊息）。官方資料夾本就只放 `.jack` 讓人自行 `JackCompiler`。

## 延伸討論

此檔說明了「為什麼 OS 測試需要真的按鍵」：`Sys.wait` 沒有 RAM 輸出可批次比對，唯一驗收方式是「人工計時」。若團隊希望自動化，可考慮用 `Memory.poke` 記錄進入/離開 `Sys.wait` 的時間戳再由 `.tst` 比較——但教科書刻意保留人工作業，以強調「時間」本就無法用純算術證明。