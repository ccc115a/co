# StaticTest.vm 程式說明

這是 Nand2Tetris 官方第 7 章 MemoryAccess 專案的測試檔，出處為 projects/7/MemoryAccess/StaticTest。它測試 `static` 段的 push/pop——這是第 7 章唯一一個**以「檔名」作用域**存在的記憶體段。

## 概述

- 功能：把三個常數依序存進 `static 8`、`static 3`、`static 1`，再把它們讀回堆疊做 `sub`、`add`。
- 測驗重點：static 段的符號命名規則——`@檔名.index`（例如 `@StaticTest.3`），以及「後 pop 先拿走堆疊頂端」的 LIFO 順序。
- 不需要任何基底暫存器初始化：static 段由組譯器把符號 `Xxx.N` 配置到 RAM[16] 起的記憶體，程式自身即可完成測試。

## 原始碼逐段解說

```vm
push constant 111
push constant 333
push constant 888
pop static 8
pop static 3
pop static 1
```

三個 push 之後堆疊為 `[111, 333, 888]`（888 在頂端）。接著依序：

- `pop static 8`：頂端 888 寫入 `StaticTest.8`。
- `pop static 3`：頂端 333 寫入 `StaticTest.3`。
- `pop static 1`：頂端 111 寫入 `StaticTest.1`。

**不是 index 8 拿到 111、index 1 拿到 888**——堆疊後進先出，先 pop 的 index 8 會先拿到最後 push 的 888。這正是測驗常見的陷阱區。

`pop static N` 的翻譯骨架（沒有 R13、沒有基底，因為符號本身就直接是位址）：

```asm
@SP
AM=M-1
D=M
@StaticTest.8
M=D
```

翻譯器在 `write_pop` 中對 static 段輸出：

```c
fprintf(out, "@SP\nAM=M-1\nD=M\n@%s.%d\nM=D\n", current_file, index);
```

其中 `current_file` 就是 vm2asm.c 在 `translate_file` 裡去掉路徑與副檔名後存下的檔名（此例為 `StaticTest`）。

```vm
push static 3
push static 1
sub
push static 8
add
```

計算過程：

- `push static 3`：推入 333；
- `push static 1`：推入 111；
- `sub`：`x−y = 333 − 111 = 222`，堆疊 `[222]`；
- `push static 8`：推入 888；
- `add`：`222 + 888 = 1110`。

`push static 3` 的翻譯骨架：

```asm
@StaticTest.3
D=M
@SP
A=M
M=D
@SP
M=M+1
```

## 對照表

| VM 指令 | 對應 Hack 符號 |
|---------|----------------|
| pop static 8 | `@StaticTest.8` |
| pop static 3 | `@StaticTest.3` |
| pop static 1 | `@StaticTest.1` |
| push static 3 | `@StaticTest.3` |
| push static 1 | `@StaticTest.1` |
| push static 8 | `@StaticTest.8` |

## 測試與驗證

- 最終 `RAM[0]`（SP）= 257、`RAM[256]` = 1110，符合官方 StaticTest.tst 斷言。
- 透過 VM Emulator 可觀察：`StaticTest.1` 落在 RAM[16]、`.3` 落在 RAM[18]（組譯器的變數配置是依「符號首次出現順序」指派 RAM[16] 起，並非照 index）；不同索引佔連續空位。
- 用本專案 vm2asm.c 產出的 StaticTest.asm（本目錄）執行亦同。

## 延伸討論

- static 的「檔名.索引」命名精巧地解決了多檔程式的命名衝突：`Foo.vm` 與 `Bar.vm` 都有 static 0，但符號變成 `Foo.0` 與 `Bar.0`，互不干擾。這模擬了 Java 這類語言「每個類別有自己的一份 static 變數」。
- 在翻譯器實作上，static 段是唯一需要「得知目前處理哪個檔」的段，因此 `current_file` 全域變數的存在是為了它而生。
- 若同一個檔同時被翻譯兩次（例如 `vm2asm out.asm Foo.vm Foo.vm`），組譯器會視為同一組符號，只配置一份記憶體——這是「重複翻譯同一 file」時才需要注意的邊角案例。