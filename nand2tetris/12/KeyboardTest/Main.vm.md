# KeyboardTest/Main.vm 程式說明

`Main.vm` 是 `KeyboardTest/Main.jack` 編譯出的 VM 碼（949 行）。因為 Jack 的字串字面值會在編譯期展開成「`String.new` + 一行 `appendChar`」，這支檔裡摻了大量字串建構指令，真正反映測試邏輯的是其中 `call Keyboard.*` 與迴圈/分支的骨架。

## 概述

- 進入點：`function Main.main 5`（5 個 local：`c、key、s、i、ok`）。
- `local 4` 是 `ok`（0 = false，−1 = true），四關各用一組 `WHILE_EXPn / WHILE_ENDn` 迴圈。
- 對 VM 翻譯器而言，這支檔混合了 `String` 的建構與方法呼叫、`call`/`return` 堆疊框架、條件分支（`eq`、`if-goto`）、邏輯運算元（`not`、`and`）。

## 架構總覽

每一關的骨架大致是：

```
push constant 16        ; 字串容量＝字面值長度
call String.new 1
push constant 107; call String.appendChar 2   ; 'k'
push constant 101; call String.appendChar 2   ; 'e'
...                                            ; 逐字 append
call Output.printString 1; pop temp 0         ; 印提示
label WHILE_EXP0                              ; while(~ok)
push local 4; not; not; if-goto WHILE_END0
   ...
call Keyboard.keyPressed 0; pop local 1       ; key = Keyboard.keyPressed()
...
push constant 0; not; pop local 4             ; ok = true
goto WHILE_EXP0
label WHILE_END0
```

## 原理

- **字串字面值**：`"keyPressed test:"` 有 16 個字元，所以先 `String.new(16)`，再連續 16 次 `push 該字元 ASCII; call String.appendChar 2`。這說明為何一支 41 行的 jack 會編出近千行 VM。
- **while(~ok)**：編譯成 `push local 4; not; not; if-goto WHILE_END0`——`~ok` 為真（≠0）時繼續迴圈。Jack 的布林真值是 −1（0xFFFF），`not` 會在 0 ↔ −1 之間互換。
- **keyPressed 輪詢**：
  ```
  label WHILE_EXP1
  push local 1; push constant 0; eq; not ; wait until key != 0
  if-goto WHILE_END1
  call Keyboard.keyPressed 0; pop local 1
  ```
  `key = 0` 的比較用 `eq` 產生布林，再用 `not` 反轉成迴圈條件。

## 實作細節

| Jack | VM |
|------|----|
| `let ok = false;` | `push constant 0` / `pop local 4` |
| `let key = Keyboard.keyPressed();` | `call Keyboard.keyPressed 0` / `pop local 0` |
| `if (c = 137)` | `push local 0; push constant 137; eq; if-goto IF_TRUE0` |
| `let ok = true;` | `push constant 0; not` / `pop local 4` |
| `s.length() = 4` | `push local 2; call String.length 1`（`this=local 2`）`push constant 4; eq` |
| `s.charAt(0) = 74` | `push local 2; push constant 0; call String.charAt 2; push constant 74; eq` |

`String.appendChar` 每次都要傳 2 個參數（`this`、字元碼），所以 VM 中每當建字串就看到一長串 `push/call`。

## 測試與驗證

VM Emulator 載入 `KeyboardTest` 資料夾的全部 `.vm`（`Main.vm` + `Keyboard.vm` + `String.vm`，必要時再加上 `OS` 內建檔），設定鍵盤位置後執行。在 `call Sys.wait/Output.*` 時可開「Animate: No Animation」加速；程式會停在 `call Keyboard.keyPressed` 等使用者按鍵。互動流程與預期輸出見 `Main.jack` 的說明。

## 延伸討論

這支 VM 大量示範了「方法呼叫的隱含參數」：`s.charAt(0)` 的低層型式是 `call String.charAt 2`，`argument 0` 放 `s`（即 `this`），`argument 1` 放索引。若能比對第 11 章 VM 翻譯器輸出的 Hack，可看到每次 `call` 都要把回傳位址、LCL、ARG、THAT、THIS 依序推入堆疊——`readLine` 的巢狀呼叫（readLine → readChar → keyPressed）會形成漂亮的堆疊框架堆積。