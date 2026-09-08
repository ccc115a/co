# Class2.vm 程式說明（StaticsTest）

這是 StaticsTest 測試集的 `Class2.vm`，內容結構與 `Class1.vm` 完全相同：
`Class2.set` 存入 static、`Class2.get` 讀出相減回傳。兩檔放在一起的意義
就在「**檔名前綴不同，static 符號因此隔離**」。

## 概述

- 目的：驗證「不同 `.vm` 檔（類別）的 static 段各自獨立」。
- 對應 C 語言：

```c
// Class2 的 static 全域變數（與 Class1 無關）
static int s0, s1;

void Class2_set(int a, int b) { s0 = a; s1 = b; }
void Class2_get() { return s0 - s1; }
```

## 原理

`Class1.vm` 的 static 會產生符號 `Class1.0`、`Class1.1`；`Class2.vm` 的
static 則產生 `Class2.0`、`Class2.1`。這四個符號在組譯後是四個**不同位址**
的 RAM 變數。所以即使 `Class2.set(23, 15)` 把 `Class2.0` 設為 23，也不會
汙染 `Class1.0`（後者維持 6）。

回到第 7 章的 `StaticTest` 是「單一檔內多 static」；這裡是「多檔內各自的
static」——合起來才是完整測驗。

## 實作細節（逐段解說）

```
function Class2.set 0
  push argument 0
  pop static 0    // Class2.0 = arg0
  push argument 1
  pop static 1    // Class2.1 = arg1
  push constant 0
  return

function Class2.get 0
  push static 0   // Class2.0
  push static 1   // Class2.1
  sub             // Class2.0 - Class2.1
  return
```

兩函式皆無 local（`function ... 0`），call 時框架只佔基本 5 值。

## 測試與驗證

1. `./vm2asm StaticsTest.asm Sys.vm Class1.vm Class2.vm`。
2. 由 `Sys.init` 執行（見 `Sys.vm.md`）；`Class2.get` 回傳 23 − 15 = 8。
3. 組譯後檢查符號表有獨立的 `Class2.0`/`Class2.1`（位址與 `Class1.0`
   `Class1.1` 不同）。
4. 對照 `StaticsTest.cmp`。

## 延伸討論

- 若翻譯器只用「static.i」當符號（不含檔名），兩檔的 static 就會「撞名」，
  `Class1.set` 與 `Class2.set` 將共用同一記憶體——這是本測試存在的唯一理由。
- 真實語言中，「類別變數」與「全域變數」的命名空間分隔，正是如此靠
  編譯器/翻譯器把符號加上類別前綴來達成。