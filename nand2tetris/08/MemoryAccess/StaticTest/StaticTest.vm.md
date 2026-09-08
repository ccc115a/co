# StaticTest.vm 程式說明

StaticTest.vm 是第 7 章 MemoryAccess 測試集中最後的測試檔，專門驗證
`static` 段。`static` 段的特別之處在於它不靠任何基底暫存器，而是直接映射到
組合語言層的「具名變數」——由組合器過兩 pass 符號表來分配位址。

## 概述

- 目的：測試 push/pop static，確認符號（`StaticTest.0`、`StaticTest.1`、
  `StaticTest.3`、`StaticTest.8`）被正確產生。
- 對應 C 語言（static 全域變數）：

```c
static int s[9];
s[1] = 888;  // 依堆疊順序，見下
s[3] = 333;
s[8] = 111;
result = s[3] - s[1] + s[8];
       = 333 - 888 + 111 = -444
```

## 原理

VM 的 `static i` 在翻譯層被換成符號 `基底檔名.i`（例如 `StaticTest.8`）。
這不是直接定址某個 RAM 位子，而是**符號定址**：組合器在組譯時，把這些符號
視為自訂變數，依出現順序配置到 RAM 16、17、18…。因為翻譯器把「檔名」寫進
符號裡，不同 `.vm` 檔的 static 彼此不會撞名。

堆疊順序的關鍵在 pop 的 LIFO 特性：壓入 111、333、888 後再依序
`pop static 8`、`pop static 3`、`pop static 1`，所以是：

- `static[8] = 888`（先 pop 到最頂）
- `static[3] = 333`
- `static[1] = 111`

## 實作細節（逐段解說）

```
push constant 111
push constant 333
push constant 888
pop static 8      // StaticTest.8 = 888
pop static 3      // StaticTest.3 = 333
pop static 1      // StaticTest.1 = 111
```

計算：

```
push static 3     // 333
push static 1     // 111
sub               // 222
push static 8     // 888
add               // 1110
```

最終堆疊頂為 1110（而不是 -444），因為 `push static 3; push static 1; sub`
算的是「333 − 111 = 222」，再加 888。

## 測試與驗證

1. `./vm2asm StaticTest.asm StaticTest.vm`。
2. 在產出的 asm 中搜尋符號 `StaticTest.0`…`StaticTest.8`，確認組合器會為
   它們分配 RAM 16+ 的連續位址。
3. VM Emulator 執行後堆疊頂應為 1110；對照 `StaticTest.cmp`。

## 延伸討論

- **static 名稱來自檔案而非函式**：翻譯器在第 8 章的 `FunctionCalls/StaticsTest`
  中，會用 `Class1.0`、`Class2.0` 這類符號，保證同一個函式在不同 class 中
  的 static 各自獨立——這是第 8 章的重要測試點（見 `StaticsTest/Sys.vm.md`）。
- static 段大致對應高階語言的「靜態/全域變數」；它在所有函式呼叫之間共享生命週期，
  不像 local 會隨函式呼叫被建置/銷毀。