# BasicTest.vm 程式說明

這是 Nand2Tetris 官方第 7 章 MemoryAccess 專案的測試檔，出處為 projects/7/MemoryAccess/BasicTest。它測試 VM 翻譯器對**記憶體段的 push/pop**——除了 constant、pointer、static 之外的 local、argument、this、that、temp 五個段全部測到，最後再用四則運算把結果組合成一個數字。

## 概述

- 功能：執行一系列 pop 與 push，把常數存進各記憶體段、再把它們讀回堆疊做算術。
- 測驗重點：每個 segment 的「base+index」定址是否正確。翻譯器必須輸出 `@index D=A @基底 A=D+M`（push 讀值）或 `@index D=A @基底 D=D+M @R13 ...`（pop 寫值）兩套固定骨架。
- 前提：**執行前 LCL/ARG/THIS/THAT 必須指向正確的 RAM 位址**。純粹的 BasicTest.vm 沒有初始化這些暫存器，因此官方搭配的 BasicTest.tst 會在 VM Emulator 的 .tst 裡先設定各基底（例如讓 LCL 指向 RAM[300]、ARG 指向 RAM[400]、THIS 指向 RAM[3000]、THAT 指向 RAM[3010]），再執行。用官方 VM Emulator 或先寫 bootstrap 初始化基底後才可得到有意義的結果。

## 原始碼逐段解說

### 第一階段：寫入各記憶體段

```vm
push constant 10
pop local 0
```

把 10 存到 `LCL[0]`。`pop local 0` 的翻譯骨架：

```asm
@0
D=A
@LCL
D=D+M       // 算出目標位址 = LCL + 0
@R13
M=D         // 暫存目標位址
@SP
AM=M-1
D=M         // 取出堆疊頂端 = 10
@R13
A=M
M=D         // LCL[0] = 10
```

之所以要先把目標位址暫存到 R13，是因為 pop 之後 D 暫存器要用來搬運堆疊值；若先算 A 位址再 pop，位址會寫死在暫存器裡，順序上不允許。

```vm
push constant 21
push constant 22
pop argument 2
pop argument 1
```

- `ARG[2] = 22`、`ARG[1] = 21`。「先 push 21 再 push 22、pop 時倒序」正好驗證堆疊的 LIFO 特性：**後放進的 22 透過 `pop argument 2`（較高的 index）取出**，21 再進 `argument 1`。

```vm
push constant 36
pop this 6     // THIS[6] = 36
push constant 42
push constant 45
pop that 5     // THAT[5] = 45
pop that 2     // THAT[2] = 42
```

同樣利用 LIFO 順序，`pop that 5` 先接走 45、`pop that 2` 再接走 42。this 段的 index 6、that 段的 index 2/5 說明 index 是「基底暫存器內容 + 偏移」，不要求連續。

```vm
push constant 510
pop temp 6
```

`temp` 段固定在 RAM[5..12]，`pop temp 6` 直接寫入 RAM[11]（=5+6）。它的翻譯不經過任何基底暫存器，是**最簡短的 pop**：

```asm
@SP
AM=M-1
D=M
@11
M=D
```

### 第二階段：讀回並運算

```vm
push local 0    // RAM[LCL] = 10
push that 5     // RAM[THAT+5] = 45
add             // 10 + 45 = 55
push argument 1 // 21
sub             // 55 - 21 = 34
push this 6     // 36
push this 6     // 36
add             // 72
sub             // 34 - 72 = -38
push temp 6     // 510
add             // -38 + 510 = 472
```

`push local 0`/`push that 5` 等是 base+index 的讀值骨架：

```asm
@0
D=A
@LCL
A=D+M      // A = LCL + 0
D=M        // D = LCL[0]
@SP
A=M
M=D
@SP
M=M+1
```

整個第二階段等價於下列 C 語言式子：

```c
result = (local[0] + that[5] - argument[1]) - (this[6] + this[6]) + temp[6];
       = (10 + 45 - 21) - (36 + 36) + 510
       = 34 - 72 + 510
       = 472;
```

## 測試重點總結

| segment | 測試的指令 | 對應 RAM |
|---------|-----------|----------|
| local | pop local 0 / push local 0 | LCL + 0 |
| argument | pop argument 1,2 / push argument 1 | ARG + 1、ARG + 2 |
| this | pop this 6 / push this 6×2 | THIS + 6 |
| that | pop that 2,5 / push that 5 | THAT + 2、THAT + 5 |
| temp | pop temp 6 / push temp 6 | RAM[11] |

至此五大段的 pop 與 push 都走過一輪，最後的結果 472 是五個段共同作用的檢查值。

## 延伸討論

- BasicTest 沒有碰 pointer/static——那是 PointerTest 與 StaticTest 的任務，三個檔合起來才是第 7 章記憶體存取的完整測試。
- 「pop 用 R13 暫存目標位址」這個設計是翻譯器教科書級的細節：R13 是 Hack 架構刻意保留的三個自由暫存器（R13/R14/R15）之一，呼叫/返回協定也會用到。