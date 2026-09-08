# MathTest/Main.vm 程式說明

`Main.vm` 是 `MathTest/Main.jack` 編譯出的 VM 碼（162 行）。它把 Jack 的 `*`、`/` 縮寫展開成對 `Math.multiply`、`Math.divide` 的 `call`，並把每個結果搬進 RAM[8000]–[8013]。

## 概述

- 進入點：`function Main.main 1`（1 個 local = `r`，指向 8000）。
- 14 個指派各自展開成「計算 → `pop temp 0` → `pop pointer 1` → `pop that 0`」的固定模式。
- 對 VM 翻譯器而言，這支檔是「呼叫數值函式 + 陣列元素存取」的混和測試。

## 架構總覽

每組指派的基本骨架（以 `r[0] = 2 * 3` 為例）：

```
push constant 0
push local 0
add                        ; 位址 = r + 0，令 that 指向它
push constant 2
push constant 3
call Math.multiply 2       ; 堆疊頂端兩個參數
pop temp 0                 ; 保留結果到 temp
pop pointer 1              ; that = r + 0
push temp 0
pop that 0                 ; RAM[8000] = 6
```

連續指派（如 `r[1] = r[0] * (-30)`）需要先讀回前一個結果：

```
push constant 0; push local 0; add; pop pointer 1; push that 0   ; 讀 r[0]（=6）
push constant 30; neg                                            ; -30
call Math.multiply 2
```

## 原理

- **`*` 和 `/` 是呼叫**：Jack 編譯器把 `a * b` 翻成 `call Math.multiply 2`、`a / b` 翻成 `call Math.divide 2`，所以運算子重載在本專案的 VM 層就是「函式呼叫」。
- **pop temp**：Jack 的暫存變數在位址 5–12（temp 段），編譯器用它當「目前要搬到指定陣列位置的值」。`pop temp 0` 保住 6，再 `pop pointer 1` 切換 `that`，最後 `push temp 0; pop that 0` 一字不差地寫入 RAM。
- **neg**：`(-30)` 用 `push constant 30; neg`，因 VM 的 `neg` 是堆疊頂端取負。

## 實作細節

| Jack | VM |
|------|----|
| `r[0] = 2 * 3` | `push constant 0; push local 0; add` … `push constant 2; push constant 3; call Math.multiply 2` |
| `r[6] = -18000 / 6` | `push constant 18000; neg; push constant 6; call Math.divide 2` |
| `r[8] = Math.sqrt(9)` | `push constant 9; call Math.sqrt 1` |
| `r[10] = Math.min(345,123)` | `push constant 345; push constant 123; call Math.min 2` |
| `r[13] = Math.abs(-32767)` | `push constant 32767; neg; call Math.abs 1` |

倒數四行：`push constant 13` … `call Math.abs 1` … `pop that 0`，最後 `push constant 0; return`。

## 測試與驗證

VM Emulator 開啟 `MathTest.tst`（未從檔案 `load` 所有 OS 檔時需先載入 `Math.vm`+`Array.vm`+`Memory.vm`）。跑完 VM 檢查 `RAM[8000]..RAM[8013]`：

```
6  -180  -18000  -18000  0  3  -3000  0  3  181  123  123  27  32767
```

第 7 格（RAM[8007]）為 0（32766 / −32767 商為 0），第 10 格為 181（32767 的平方根）。

## 延伸討論

注意編譯器如何處理 `r[2] = r[1] * 100`：它先算出 RHS 並 `pop temp 0`，再算 LHS 位址——也就是說 Jack 求值順序保證 RHS 完成後才切換 `that`，其中 `temp` 區是關鍵的「中間值停車格」。若自己寫 VM 翻譯器時把 temp 段對應錯位址，就會看到結果搬到錯誤的 RAM 位置。