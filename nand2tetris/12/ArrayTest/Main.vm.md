# ArrayTest/Main.vm 程式說明

`Main.vm` 是 `Main.jack` 用 Jack 編譯器產出的 VM 碼（第 11 章成果）。它是 `ArrayTest` 資料夾的進入點：`function Main.main 4` 宣告了 4 個區域變數（`r、a、b、c`），整支程式只用 VM 的堆疊指令操作記憶體。

## 概述

- 這支 VM 檔沒有呼叫任何「自訂演算法」，只是把陣列存取 `a[i]` 的語法，展開成底層的指標算術（`base + i`）與 `pointer`/`that` 指向。
- 對 VM 翻譯器而言，它是「指標算術 + 函式呼叫」混合的測試；對 OS 而言，它測 `Array.new/dispose` 與 `Memory.alloc/deAlloc` 的正確性。

## 架構總覽

程式碼呈現固定的「三明治」模式，一組就是一列陣列存取的展開：

```
push 索引        ; 把陣列索引放上堆疊
push 基底位址    ; 陣列物件的位址（通常在 local 1、local 2…）
add              ; 算術：base + index → 目標記憶體位址
...              ; （寫入時）留下常數值、pop pointer 1 / pop that 0
```

之後 `return` 前會把值 `pop temp 0`，再搬到 `that 0`——這是 Jack 編譯器處理「`=` 左右兩邊都是陣列元素（如 `r[0] = a[2]`）」時的標準工作流程：先算 RHS、搬到 temp，再算 LHS 位址、搬進 temp 值。

## 原理

Jack 陣列與 C 陣列一樣，是「基底位址 + 位移」：

- `a[2] = 222` ⟹ `push constant 2; push local 1; add; push constant 222; pop temp 0; pop pointer 1; push temp 0; pop that 0`
  - `pop pointer 1` 把「`a` 的位址 + 2」設成 `THAT`，接著 `pop that 0` 就把 222 寫進去。
- `r[0] = a[2]` 兩邊都是陣列元素時，編譯器先求 RHS `a[2]`（放到 temp），再令 `THAT = r＋0`，最後 `push temp 0; pop that 0`。

`call Array.new 1` / `Array.dispose 1` 則直接對應 `.jack` 的 `Array.new(n)` 與 `a.dispose()`。

## 實作細節

關鍵指令對照：

| Jack | VM |
|------|----|
| `var Array r;` | `function Main.main 4`（4 個 local） |
| `let r = 8000;` | `push constant 8000` / `pop local 0` |
| `let a = Array.new(3);` | `push constant 3` / `call Array.new 1` / `pop local 1` |
| `let a[2] = 222;` | `push constant 2; push local 1; add; push constant 222; pop temp 0; pop pointer 1; push temp 0; pop that 0` |
| `let r[0] = a[2];` | 先 `push constant 2; push local 1; add; pop pointer 1; push that 0`（讀 a[2]）再搬到 `that 0`（r+0） |
| `do a.dispose();` | `push local 1; call Array.dispose 1; pop temp 0` |

注意到 `Array.dispose` 的傳回值（void 的 0）會被 `pop temp 0` 丟掉。

## 測試與驗證

用 VM Emulator 載入 `ArrayTest.tst`（內部先 `load Main.vm`），重複 `vmstep` 一百萬次後輸出：

```
|RAM[8000]|RAM[8001]|RAM[8002]|RAM[8003]|
|     222 |     122 |     100 |      10 |
```

十萬步內程式就應正常結束（最後一行是 `push constant 0; return`）。若 `Memory.alloc` 回傳錯誤的基底位址，`that` 指向的就不是預期記憶體，輸出就會偏離。

## 延伸討論

`function Main.main 4` 的「4」是編譯器統計 `var` 數量後寫入的標頭；`Main.vm` 裡看不到「類別/instance」概念——method 呼叫在低層就是把物件位址擺在 `argument 0`。要觀察完整堆疊機器運作，可搭配第 11 章的 VM 翻譯器把這段 VM 翻譯成 Hack 組合語言，`push/pop/add` 會各展開成 5–10 條 `asm`。