# SysTest/Sys.vm 程式說明

此檔是第 12 章 OS 的 `Sys.jack` 之 VM 編譯結果。**注意：本資料夾沒有實際的 `Sys.vm` 檔**（官方資料夾只放 `.jack`），此說明列出重新編譯後應得的標準 VM 碼並解說結構。

## 概述

共有四個函式：`Sys.init`、`Sys.halt`、`Sys.wait`、`Sys.error`。`Sys.init` 是「全 OS 開機函式」——每次 Jack 程式啟動都由它依序初始化五個類別再呼叫 `Main.main`。`Sys.wait`、`Sys.error` 是`被測試程式所呼叫的服務。

## 架構總覽（標準編譯結果）

```
function Sys.init 0
call Math.init 0; pop temp 0
call Output.init 0; pop temp 0
call Screen.init 0; pop temp 0
call Keyboard.init 0; pop temp 0
call Memory.init 0; pop temp 0
call Main.main 0; pop temp 0
push constant 0
return

function Sys.halt 0
label WHILE_EXP0
push constant 0
not
not
if-goto WHILE_END0
goto WHILE_EXP0
label WHILE_END0
push constant 0
return

function Sys.wait 2
push constant 0
pop local 0                       ; i = 0
label WHILE_EXP0
push local 0; push argument 0; lt
not
if-goto WHILE_END0                ; while i < duration
push constant 0
pop local 1                       ; j = 0
label WHILE_EXP1
push local 1; push constant 200; lt
not
if-goto WHILE_END1                ; while j < 200
push local 1; push constant 1; add; pop local 1
goto WHILE_EXP1
label WHILE_END1
push local 0; push constant 1; add; pop local 0
goto WHILE_EXP0
label WHILE_END0
push constant 0
return

function Sys.error 0
push constant 3
call String.new 1
push constant 69; call String.appendChar 2   ; 'E'
push constant 114; call String.appendChar 2  ; 'r'
push constant 114; call String.appendChar 2  ; 'r'
call Output.printString 1; pop temp 0
push argument 0
call Output.printInt 1; pop temp 0
call Sys.halt 0; pop temp 0
push constant 0
return
```

## 原理

- **開機依賴順序**：`Math → Output → Screen → Keyboard → Memory → Main.main`。低層先就位（Math 的次方表可被 Output/Screen 使用；Memory 的空閒串列在一切 heap 動作之前建好）。
- **halt**：`while(true)` 編成「`i時 0; not; not`」恆真 → `goto WHILE_EXP0` 原地跳，永不結束。
- **wait 的時距**：外層 `i` 跑 exactly duration 次、內層 `j` 每次跑 200 步，共 `200×duration` 個空轉；配合標準 clockrate 約為 duration 毫秒，`Sys.wait(2000)` ≈ 2 秒。
- **error**：印 `Err<code>` 後 `Sys.halt`——程式觸發錯誤時以「卡死＋訊息」回應，而非回傳。

## 實作細節

- `call Main.main 0`：`Main.main` 是 function void，回傳 0 被 `pop temp 0` 丟棄；`Sys.init` 自己回 0。
- `Sys.wait` 宣告 `var int i, j`，因此 `function Sys.wait 2`（兩個 local）。
- 迴圈條件 `i < duration` 的 VM：`push local 0; push argument 0; lt; not; if-goto WHILE_END0`。
- `Sys.error` 的 `"Err"` 字面值展開成 `String.new(3)` 與三次 `appendChar`（'E'=69、'r'=114、'r'=114）；`errorCode` 從 `argument 0` 給 `Output.printInt`。

## 測試與驗證

此檔以 `SysTest/Main.vm` 為進入點互動驗證 `wait`；若要測 `Sys.init` 本身的順序，可在 VM Emulator 設中斷點於 `Main.main` 呼叫處，確認五個 init 依序先執行完。硬體（第 5 章的 Computer）上則要先經第 11 章編譯器產生 Hack 組合語言。

## 延伸討論

`Sys.init` 是「OS 與應用程式之間的合約」：小作家 `Main.main` 不需管初始化，引擎透過 `Sys.init` 保證環境就緒。真實系統的 `_start`、`crt0`、`main` 包裝正是一樣的概念。`halt` 在圖形遊戲中常被當「dead end」用；`error` 是「診斷與防呆」的分界線——如果你寫的 OS 連 `Sys.jack` 都不見足，任何 `do` 呼叫 Method 的程式都會在開機瞬間當機。