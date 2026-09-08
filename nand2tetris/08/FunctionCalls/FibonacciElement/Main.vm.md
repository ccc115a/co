# Main.vm 程式說明（FibonacciElement 測試）

這是 FibonacciElement 測試集的 `Main.vm`，只定義一個函式：
`Main.fibonacci`，用**遞迴**計算費氏數列第 n 個元素。
它是第 8 章第一個真正的遞迴範例——`Main.fibonacci` 在自身內部呼叫自己。

## 概述

- 函式：`function Main.fibonacci 0`（無 local）。
- 演算法（費氏數列遞迴定義）：

```
fib(n) =  n,                 若 n < 2
        = fib(n-1) + fib(n-2)，否則
```

- 對應 C 語言：

```c
int fibonacci(int n) {
    if (n < 2) return n;
    return fibonacci(n-1) + fibonacci(n-2);
}
```

- 由 `Sys.init`（見 `Sys.vm.md`）呼叫，初始 `fibonacci(4)`。

## 原理：遞迴如何用堆疊框架實現

`Main.fibonacci` 呼叫自己時，同樣遵守框架協定：每一次呼叫都把
retAddr、LCL、ARG、THIS、THAT 推上堆疊，ARK = SP−5−1，LCL = SP，
然後跳回 `(Main.fibonacci)`。因此每一層遞迴都有**獨立的 argument 0**
（各自的 n）與獨立的框架，各層互不干擾。`add` 把兩次遞迴回傳值相加，
再把和回傳——這正是高階語言裡的 `return f(n-1)+f(n-2)`。

### 為什麼 `function Main.fibonacci 0`？

此函式只用參數不用 local；每一次呼叫只 push 參數（n−2 或 n−1）與回傳值，
故不需 local 初始化。注意遞迴層數多時，堆疊會成長，最終在基底案例
（n<2）時逐一 unwinding。

## 實作細節（逐段解說）

```
function Main.fibonacci 0
  push argument 0
  push constant 2
  lt                    // n < 2 ?
  if-goto N_LT_2        // 條件成立（n<2）→ 回傳 n
  goto N_GE_2           // 否則處理 n>=2

label N_LT_2            // if n < 2 return n
  push argument 0
  return                // 回傳 n（基底案例）

label N_GE_2            // return fib(n-2) + fib(n-1)
  push argument 0
  push constant 2
  sub                   // n - 2
  call Main.fibonacci 1 // 第一次遞迴：fib(n-2)
  push argument 0
  push constant 1
  sub                   // n - 1
  call Main.fibonacci 1 // 第二次遞迴：fib(n-1)
  add                   // 兩個結果相加
  return
```

### 呼叫鏈實例（fib(4)）

`fib(4) = fib(3)+fib(2)`；`fib(3)=fib(2)+fib(1)`；`fib(2)=fib(1)+fib(0)`；
`fib(1)=1`、`fib(0)=0`。結果 3（0-based 的 fib(4)=3；若 1-based 則為 5，
端看測試設定）。

## 測試與驗證

1. `Sys.vm` 先 `push constant 4; call Main.fibonacci 1`。
2. 三檔合一翻譯：`./vm2asm FibonacciElement.asm Sys.vm Main.vm`（多檔模式
   會先產生 bootstrap）。
3. VM Emulator 執行，最後堆疊頂應為期望的費氏值（對照 `FibonacciElement.cmp`）。
4. 觀察 return 標籤 `Main.fibonacci$ret.1/2/3` 重複使用：每次遞迴都產生
   新的框架，但標籤在不同層共用（各自有各自 SP 位置）。

## 延伸討論

- 這是「用堆疊模擬高階呼叫」的最佳示範：一套框架協定，不需任何特例就支援
  遞迴——reentrant（可重入）正是協定的先天性質。
- 對照前一章的 `FibonacciSeries.vm`（迭代版），可見同一問題的兩種解法；
  遞迴版講述「堆疊成長 → 基底 → 回溯」，迭代版講述「指標遷移」。
- 真實編譯器中，遞迴也依賴這條 call stack；只是深度有限（stack overflow
  風險），本測試規模小，無此顧慮。