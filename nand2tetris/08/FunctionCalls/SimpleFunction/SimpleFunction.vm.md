# SimpleFunction.vm 程式說明

SimpleFunction.vm 是第 8 章 FunctionCalls 測試集中最基礎的檔案，示範
`function` 與 `return` 兩條指令的最小用法：宣告函式、建置 local 變數、
做一點運算、把結果回傳。

## 概述

- 函式宣告：`function SimpleFunction.test 2`（2 個 local 變數）。
- 計算：`result = NOT(local0 + local1) + argument0 - argument1`
- 對應 C 語言：

```c
int SimpleFunction_test() {   // 2 個區域變數（初始 0）
    int local0, local1;
    return ~(local0 + local1) + arg0 - arg1;
}
return;
```

## 原理

### function / return / call 的分工

- `function 名稱 k`：宣告一個函式入口，翻譯成 `(名稱)` 標籤，並在堆疊上
  推入 k 個 0 當做 k 個 local 變數（堆疊指標順帶上移 k 格）。
- `call`（呼叫者側）：把返回位址與 LCL/ARG/THIS/THAT 依框架協定推上堆疊，
  設好新 ARG/LCL 再跳過去（`SimpleFunction` 本身由測試腳本直接 call）。
- `return`（被呼叫者側）：把堆疊頂當回傳值，反推框架、跳回呼叫者。

因為 local 變數由 function 指令「推 0」建立，這是為什麼本函式的
`local0 + local1 = 0 + 0`。測試腳本的 caller 則負責設定 argument0、argument1
再由 return 取回結果。

### return 傳回誰？

`return` 的語意是「把堆疊頂的值回傳」（`*ARG = pop()`），所以函式要在
最後把欲回傳的值準備在堆疊頂部。這裡最後一行的運算結果正是堆疊頂。

## 實作細節（逐段解說）

```
function SimpleFunction.test 2
    // local0 = 0, local1 = 0（由 function 指令建立）
push local 0     // 0
push local 1     // 0
add              // 0
not              // -1
push argument 0  // arg0
add              // arg0 - 1
push argument 1  // arg1
sub              // (arg0-1) - arg1
return           // 回傳堆疊頂
```

若 caller 設 `arg0=2`、`arg1=3`：0+0=0 → not= -1 → +2 = 1 → −3 = -2，
回傳 -2。

## 測試與驗證

1. 官方 `SimpleFunction.tst` 先 push 2、push 3，再 `call SimpleFunction.test 2`。
2. `./vm2asm SimpleFunction.asm SimpleFunction.vm`。
3. VM Emulator 執行：初始推入的 2、3 成為本函式的 argument0、argument1。
4. 期望回傳值 -2；對照 `SimpleFunction.cmp`。

## 延伸討論

- 這個測試完全不處理巢狀呼叫或要保存的 THIS/THAT（因為只有一層），因此它是
  學習框架協定的第一課：先弄懂「function 推 0」、「return 回推」兩端，
  再接續 `NestedCall` 的「call 中 call」。
- 注意 local 變數是**開在堆疊上**的：`function 2` 讓堆疊多出兩格 zero，這
  兩個位置就是 local0、local1。呼叫結束後被 `return` 一併丟棄——這就是
  區域變數生命週期的來源。