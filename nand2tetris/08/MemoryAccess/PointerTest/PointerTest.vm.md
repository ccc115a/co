# PointerTest.vm 程式說明

PointerTest.vm 是第 7 章 MemoryAccess 測試集中，專門測試 `pointer` 段與
`this/that` 段的檔案。它示範用 `pop pointer 0`/`pop pointer 1` 把值寫入
`THIS`/`THAT` 暫存器，再藉由這兩個暫存器間接定址 `this`/`that` 段。

## 概述

- 目的：測試 `push/pop pointer 0|1` 對映到 `THIS`/`THAT` 暫存器，以及
  `this`/`that` 段如何跟著基底暫存器改變。
- 對應 C 語言：

```c
int *THIS = 3030;   // pop pointer 0
int *THAT = 3040;   // pop pointer 1
THIS[2] = 32;       // pop this 2
THAT[6] = 46;       // pop that 6
result = THIS + THAT - THIS[2] + THAT[6];
        = 3030 + 3040 - 32 + 46 = 6084
```

## 原理

`pointer` 段只有 0 與 1 兩個位置，分別對應到 `THIS`（RAM 3）與
`THAT`（RAM 4）這兩個「基底暫存器」。因此：

- `pop pointer 0` 就是 `THIS = pop()`（把堆疊頂的值載入 THIS）。
- `pop pointer 1` 就是 `THAT = pop()`。
- `push pointer 0` 就是「把 THIS 的值壓入堆疊」。
- 而 `this i` / `that i` 只是用 THIS/THAT 的現值當基底做 `RAM[base+i]` 定址。

這是「指標的指標」：`push pointer 0; add` 是「把兩個基底暫存器的**數值**
相加」，而 `push this 2` 是「去該指標所指的位置取資料」。

## 實作細節（逐段解說）

### 設定基底暫存器

```
push constant 3030
pop pointer 0      // THIS = 3030
push constant 3040
pop pointer 1      // THAT = 3040
```

### 用基底寫入資料

```
push constant 32
pop this 2         // RAM[3030+2] = 32
push constant 46
pop that 6         // RAM[3040+6] = 46
```

### 計算

```
push pointer 0     // 3030
push pointer 1     // 3040
add                // 6070
push this 2        // 32
sub                // 6038
push that 6        // 46
add                // 6084
```

最後堆疊頂為 6084。

## 測試與驗證

1. `./vm2asm PointerTest.asm PointerTest.vm`。
2. VM Emulator 執行；結束時 RAM[0]=257（SP）、RAM[256]=6084。
3. 對照第 7 章專案的 `PointerTest.cmp`。

## 延伸討論

- `pointer` 與 `this/that` 的分工是 Jack 語言「物件」的基礎：編譯器把物件的
  基底位址放進 THIS，就能用 `this i` 存取物件的資料成員；而 `pop pointer 0`
  正是「切換到這個物件」。換 THIS/THAT 後，整個 `this`/`that` 段的內容
  就「換了一批」，非常像 C 語言的 `int *p = ...`。
- 本測試也凸顯了 VM 的多層抽象：同一份記憶體，可以用 `this i`、`that i`、
  `pointer` 從三種觀點存取，端看基底暫存器現在指到哪。