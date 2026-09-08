# Class1.vm 程式說明（StaticsTest）

這是 StaticsTest 測試集的 `Class1.vm`，定義 `Class1.set` 與 `Class1.get`
兩個函式。它的目的是測試 **static 段跨函式的存取**：`set` 把兩個參數存進
`static[0]`、`static[1]`，`get` 再把它們讀出來相減回傳。

## 概述

- 目的：驗證「同一檔 `.vm` 內，static 段是共享的」。
- 對應 C 語言：

```c
// Class1 的 static 全域變數
static int s0, s1;

void Class1_set(int a, int b) { s0 = a; s1 = b; }
void Class1_get() { return s0 - s1; }
```

## 原理：static 如何跨函式共享？

翻譯器把 `push/pop static i` 變成符號 `Class1.i`。因為 `Class1.set` 與
`Class1.get` 都位於同一檔（檔名前綴都是 `Class1`），兩個函式用的是同一個
符號 `Class1.0` / `Class1.1`，因此能共享這兩個 static 變數。

加上本測試是與 `Class2.vm` 同場演出，組譯後會看到 `Class1.0`、`Class1.1`
與 `Class2.0`、`Class2.1` 四個不同符號——前綴不同，彼此乾淨隔離
（見 `StaticsTest.asm.md` 與 `Sys.vm.md`）。

## 實作細節（逐段解說）

```
// 本檔兩個函式都是 0 local
function Class1.set 0
  push argument 0
  pop static 0    // Class1.0 = arg0
  push argument 1
  pop static 1    // Class1.1 = arg1
  push constant 0
  return          // set 回傳 0（慣例；呼叫者會忽略）

function Class1.get 0
  push static 0   // Class1.0
  push static 1   // Class1.1
  sub             // Class1.0 - Class1.1
  return
```

`pop static 0` 翻譯為 `@SP / AM=M-1 / D=M / @Class1.0 / M=D`——直接在
組合語言符號層寫入，不需基底暫存器、不需 R13。

## 測試與驗證

1. 三檔合一翻譯：`./vm2asm StaticsTest.asm Sys.vm Class1.vm Class2.vm`
2. 由 `Sys.init` 依序 `call Class1.set 6 8`、`call Class2.set 23 15`、
   `call Class1.get`、`call Class2.get`（見 `Sys.vm.md`）。
3. 預期 `Class1.get` 回傳 6 − 8 = −2、`Class2.get` 回傳 23 − 15 = 8。
4. 對照官方 `StaticsTest.cmp`。

## 延伸討論

- 在 Jack 高階語言中，static 變數屬於「類別」：`Class1` 的 static 與
  `Class2` 的 static 是不同儲存。本測試正是讓 VM 翻譯器的「檔名前綴」
  扮演這個隔離角色的關鍵驗證。
- 對比 `MemoryAccess/StaticTest`（單檔、多符號），這裡示範「多檔、各自
  符號」，兩者合成完整的 static 段映像。