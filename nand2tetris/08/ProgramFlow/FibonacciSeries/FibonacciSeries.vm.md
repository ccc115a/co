# FibonacciSeries.vm 程式說明

FibonacciSeries.vm 是第 8 章 ProgramFlow 的第二個測試程式。它示範如何純用
`label/goto/if-goto` 寫出「迴圈 + if-else 分支」，並同時運用 `pointer 1`
把 `that` 段的基底搬到任意位址，把費氏數列依序寫入任意記憶體區塊。

## 概述

- 目的：測試流程控制指令，並驗證 `pop pointer` 與 `that` 段的組合。
- 功能：把費氏數列的前 n 個元素依序寫到「起始於位址 addr」的記憶體。
  參數 `argument[0] = n`、`argument[1] = addr`。
- 對應 C 語言：

```c
int *that = addr;          // pop pointer 1
that[0] = 0; that[1] = 1;  // 前兩個元素
for (n = n - 2; n > 0; n--) {
    that[2] = that[0] + that[1];
    that++;                // 基底前移一格
}
```

## 原理

### 為何先減 2？

費氏數列開始就要放兩個已知元素（0、1），因此剩下要「算出來」的元素只剩
n−2 個。程式先把 `argument[0]` 減 2，作為迴圈計數器。

### 用「搬動基底」代替「搬動索引」

計算新元素時，每一次都是 `that[0] + that[1]` 存到 `that[2]`，之後把
`THAT` 暫存器加 1（`push pointer 1 / push constant 1 / add / pop pointer 1`），
讓基底前移。這等價於高階語言的 `that++`（指標遞增），可避免每次都重算
絕對位址。

### if-goto 配 goto 實作 if-else

```
label LOOP
push argument 0
if-goto COMPUTE_ELEMENT   // n > 0 → 算下一個
goto END                  // 否則結束
label COMPUTE_ELEMENT
   ... 算下一個元素、n-- ...
goto LOOP
```

這正是 `if (n > 0) { 算元素; } else { 結束; }` 的分支結構：條件成立跳往
COMPUTE_ELEMENT，條件失敗則落入 `goto END`。

## 實作細節（逐段解說）

```
push argument 1
pop pointer 1      // THAT = argument[1]（addr）
push constant 0
pop that 0         // that[0] = 0
push constant 1
pop that 1         // that[1] = 1
push argument 0
push constant 2
sub
pop argument 0     // n = n - 2

label LOOP
push argument 0
if-goto COMPUTE_ELEMENT
goto END

label COMPUTE_ELEMENT
push that 0
push that 1
add
pop that 2         // that[2] = that[0] + that[1]
push pointer 1
push constant 1
add
pop pointer 1      // THAT++
push argument 0
push constant 1
sub
pop argument 0     // n--
goto LOOP

label END          //（最後停在 END；結果已寫入記憶體）
```

## 測試與驗證

1. 呼叫者把 `argument[0]=n`、`argument[1]=addr` 設定好（測試腳本常設 n=10、
   addr 如 2700）。
2. `./vm2asm FibonacciSeries.asm FibonacciSeries.vm`，VM Emulator 執行。
3. 檢查記憶體 `addr` 起連續 n 個位址依序為 0、1、1、2、3、5、8、13、21、34
   （等費氏數列前 n 項）。
4. 對照 `FibonacciSeries.cmp`。

## 延伸討論

- 這是「指標加法」的最佳示範：`that[0]+that[1]` 每次都以現行 THIS/THAT
  基底定址，透過 `pop pointer` 遞增基底，等價於陣列索引變數前移。
- 相較於 BasicLoop 的單一 if-goto，本程式多了「if-goto + goto」的完整分叉，
  一份譯本同時涵蓋 label、goto、if-goto、pointer 與 that 段的全部用法，
  是進入 FunctionCalls 前的一次總演練。