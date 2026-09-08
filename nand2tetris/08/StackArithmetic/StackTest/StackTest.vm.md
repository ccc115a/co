# StackTest.vm 程式說明

StackTest.vm 是第 7 章 StackArithmetic 測試集中最完整的「算術與邏輯測驗」
檔案，也被複製到本章資料夾。它用一連串的比較指令（eq/lt/gt）與邏輯運算
（and/or/not）來考驗 VM 翻譯器能否在堆疊機器上正確實現「真/假」
（-1/0）與各種位元運算。

## 概述

- 目的：測試 `eq`、`lt`、`gt`、`and`、`or`、`not` 等第 7 章尚未被
  SimpleAdd 涵蓋的指令。
- 完整執行的「對應 C 語言」可寫成：

```c
(bool)17 == 17;  (bool)17 == 16;  (bool)16 == 17;
(bool)892 < 891;  (bool)891 < 892;  (bool)891 < 891;
(bool)32767 > 32766;  (bool)32766 > 32767;  (bool)32766 > 32766;
57 | (31 & 53 + 112 neg) ... ; 82 or; not;
```

（精確的逐步計算見下方「實作細節」，這裡只示意順序。）

## 原理

### 比較如何變成 -1 / 0

Hack 硬體沒有布林型別。VM 的慣例是：**true = -1（二補數表示的所有位元為 1）、
false = 0**。翻譯器把每個比較指令展開為：

1. 取出頂端兩個值，計算 x − y。
2. 依條件（eq→`D;JEQ`、gt→`D;JGT`、lt→`D;JLT`)跳轉。
3. 不跳：在堆疊頂寫入 0。
4. 跳轉到 `TRUE_n`：在堆疊頂寫入 -1。

### 一元與二元組合

`and/or` 是位元層級運算（逐位元 AND/OR），`not` 是逐位元反相；
`add/sub/neg` 是一般整數運算。因此最後一串指令的結果取決於位的表示法，
例如 `not` 把 0 變 -1、把 -1 變 0。

## 實作細節（逐段解說）

### 三組 eq 測試

```
push constant 17
push constant 17
eq        // → true（-1）
push constant 17
push constant 16
eq        // → false（0）
push constant 16
push constant 17
eq        // → false（0）
```

### 三組 lt 測試

```
push constant 892
push constant 891
lt        // 892 < 891 → false（0）
push constant 891
push constant 892
lt        // 891 < 892 → true（-1）
push constant 891
push constant 891
lt        // 891 < 891 → false（0）
```

### 三組 gt 測試（用極端值 32766/32767）

```
push constant 32767
push constant 32766
gt        // → true（-1）
push constant 32766
push constant 32767
gt        // → false（0）
push constant 32766
push constant 32766
gt        // → false（0）
```

### 混合算術與位元運算

```
push constant 57
push constant 31
push constant 53
add       // 31 + 53 = 84
push constant 112
sub       // 84 - 112 = -28
neg       // 28
and       // 57 AND 28 = 24
push constant 82
or        // 24 OR 82 = 90
not       // NOT 90 = -91
```

最後堆疊頂為 -91。

## 測試與驗證

1. `./vm2asm StackTest.asm StackTest.vm`。
2. 用 VM Emulator 逐步執行，觀察每完成一條比較指令後堆疊頂的 -1/0。
3. 對照官方 `StackTest.cmp` 檔（第 7 章專案）確認序列相符。

## 延伸討論

- **為什麼用 -1 而不是 1 表示 true？** 因為 Hack 的 `M=!M` 之類位元運算
  對 -1 做 NOT 會得 0，且 `-1 & x = x`、`-1 | x = -1`，讓邏輯常數與位元
  運算彼此一致，這對編譯器非常省事（正是 Jack 語言 `not` 的語意）。
- `TRUE_n`/`END_n` 的編號（0..8）由翻譯器全域計數器產生，保證九個比較
  指令的標籤彼此不衝突。這在 `StackTest.asm` 中可以清楚看到（`TRUE_0`…`TRUE_8`）。