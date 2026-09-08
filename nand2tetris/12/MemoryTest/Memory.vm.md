# MemoryTest/Memory.vm 程式說明

`Memory.vm` 是第 12 章 OS 類別 `Memory.jack` 編譯出的 VM 碼（446 行、7 個函式）。它把「free list 堆積管理」翻譯成純 VM 的指標算術。static 0–5 依序是 `memory、freeList、NO_BLOCK、FL_LENGTH、FL_NEXT、ALLOC_SIZE`。

## 概述

- 這是全部 OS 檔中最「指標密集」的一支：大量 `push *static*; add; pop pointer 1; push that 0` 的讀／寫區塊欄位。
- 兩個公開函式 `alloc`/`deAlloc`，四個內部函式（`best_fit、do_alloc、find_prev_free`），加上 `init`、`peek`、`poke`。
- 執行緒：單執行緒，無鎖定需求。

## 架構總覽

| 函式 | 標頭 | 對應 jack |
|------|------|-----------|
| `Memory.init` | 0 | 設六個 static，freeList[0]=14336、[1]=0 |
| `Memory.peek / poke` | 0 | `that = memory + address` 存取 |
| `Memory.alloc` | 2 | 呼叫 best_fit；依回傳決定表頭更新 |
| `Memory.best_fit` | 5 | 掃 free list 找最小適合塊 |
| `Memory.do_alloc` | 2 | 分割或整塊發出，填 ALLOC_SIZE |
| `Memory.deAlloc` | 3 | 找前驅、合併前／後塊 |
| `Memory.find_prev_free` | 1 | 走 free list 直到越過 object |

## 原理

VM 沒有 `arr[i]`，一切「物件欄位」都要展開成「基底＋位移」：

```
push 基底        ; 如 static 1（freeList）
push 偏移        ; 如 static 4（FL_NEXT = 1）
add
pop pointer 1
push that 0      ; 讀取；寫入則前面多 push 值、pop temp 0、後面 pop that 0
```

因此 `found_block[FL_NEXT]` 在 VM 裡是：
`push static 4; push local 0; add; pop pointer 1; push that 0`（讀）。
整個檔案九成的指令都是這種「三明治」。

## 實作細節

- **alloc 的兩分支**：
  ```
  push argument 0
  call Memory.best_fit 1 ; local 0 = prev_block
  push local 0; push static 2; eq   ; prev == NO_BLOCK?
  ```
  `prev_block = null`（`push constant 0; eq`）時 `local 1 = freeList`，再 `push local 1; push argument 0; call Memory.do_alloc 2; pop static 1` 更新表頭。最後 `push local 1; push constant 1; add; return`——即「回傳位址＝found+1」。
- **best_fit**：`local 0=best_block(NO_BLOCK)`、`local 3=best_size(16384)`、`local 2=cur_block(freeList)`、`local 1=prev_block(null)`、`local 4=cur_size`。迴圈直到 `cur_block = null`，比較後沿 `FL_NEXT` 前進。
- **deAlloc 的合併**：`local 0=alloc_size`、`local 1=prev_block`。條件 `prev + prev.len = object` 的比較在 VM 是：
  ```
  push local 1; push static 3; push local 1; add; pop pointer 1; push that 0; add
  push argument 0; eq
  ```
  合併就是 `prev_len + alloc_size`（`push that 0(value); push local 0; add`）。後塊合併相同模式，共用 `IF_TRUE2` 標籤。
- **全程靜態區**用 `static 0..5`，沒有 heap 配置（除 `init` 前無 Array）。

## 測試與驗證

`MemoryTest.tst` 批次驗證：`Memory.init` 需先被呼叫（在 Sys.init 流程中）。若學生實作 bug 導致 free list 錯亂，下一個 `Array.new` 可能回傳 2048 而覆寫 freeList 自身，VM Emulator 會直接看到 RAM[2048] 被改而輸出爆走。

## 延伸討論

這支 VM 是理解「物件導向編譯」的最佳教材：`this` 欄位 = `pointer 0 + 偏移`；`static` 欄位 = `static n`；「回傳物件位址」就是「把指標當整數傳」。對照 `Math.vm` 的簡潔，可見 `Memory.vm` 多做的是「間接存取管理塊」，這些間接層正是 heap manager 的理論本體。