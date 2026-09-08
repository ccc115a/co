# Sys.vm 程式說明（StaticsTest）

這是 StaticsTest 測試集的 `Sys.vm`，定義進入點 `Sys.init`。它依序呼叫
`Class1.set`、`Class2.set`、`Class1.get`、`Class2.get`，把兩個類別的
static 變數「存入後讀回」，檢驗它們彼此不汙染。

## 概述

- 目的：以 `Sys.init` 當 orchestrator（編排者），串起兩類別的 set/get。
- 對應 C 語言：

```c
void main() {
    Class1_set(6, 8);
    Class2_set(23, 15);
    int r1 = Class1_get();   // 6 - 8 = -2
    int r2 = Class2_get();   // 23 - 15 = 8
    while(1);
}
```

## 原理：測試清單

1. `call Class1.set 2` → 把 6、8 存進 `Class1.0/Class1.1`。
2. `call Class2.set 2` → 把 23、15 存進 `Class2.0/Class2.1`。
3. `call Class1.get 0` → 回傳 6 − 8 = −2（證明 Class1 未被 Class2 覆寫）。
4. `call Class2.get 0` → 回傳 23 − 15 = 8（證明 Class2 存的是自己的值）。

`pop temp 0 // dumps the return value` 只是把 set 的回傳值丟掉（set 慣例
回傳 0），temp 0 即 RAM 5。

## 實作細節（逐段解說）

```
function Sys.init 0
  push constant 6
  push constant 8
  call Class1.set 2     // 兩個參數 → Class1
  pop temp 0            // 丟掉回傳值
  push constant 23
  push constant 15
  call Class2.set 2     // 兩個參數 → Class2
  pop temp 0            // 丟掉
  call Class1.get 0     // → -2（留在堆疊）
  call Class2.get 0     // → 8（留在堆疊）
label END
  goto END
```

呼叫 `Class1.set` 前，堆疊已先有 6、8；`call ... 2` 讓 `ARG` 指向這兩個
值，`Class1.set` 的 `argument 0/1` 即 6、8。`pop temp 0` 清掉 set 的回傳 0，
讓堆疊回到乾淨狀態，避免污染後續呼叫的參數位置。

呼叫 `Class1.get`、`Class2.get` 後，堆疊頂依序堆著 −2 與 8——這是測試
腳本最後的檢查點。

## 測試與驗證

1. 三檔合一翻譯：`./vm2asm StaticsTest.asm Sys.vm Class1.vm Class2.vm`。
2. VM Emulator 執行；結束時堆疊頂 = [−2, 8]（−2 在下面、8 在上面）。
3. 對照官方 `StaticsTest.cmp`（期望 RAM[SP−1]=8、RAM[SP−2]=−2）。

## 延伸討論

- 本測試同時考驗「巢狀 call（Sys.init → Class.set/get）」與「跨類別 static」；
  兩者看似無關，卻在同一份輸出中共存（見 `StaticsTest.asm.md`）。
- 若 `Class1.get` 讀到的是 `Class2.get` 的 23/15，就代表符號衝突——這正是
  翻譯器以「檔名.i」為前綴所防堵的錯誤。