# BasicTest.vm 程式說明

BasicTest.vm 是第 7 章 MemoryAccess 測試集的代表檔，被複製到第 8 章資料夾
繼續使用。它完整掃過五種記憶體段：local、argument、this、that、temp，
並在最後做一連串的 push/add/sub 計算，驗證「pop 到哪個段的哪個位置」在
翻譯後完全正確。

## 概述

- 目的：測試 `pop segment i` 的「先算位址再寫入」機制，以及五種段的位址映射。
- 對應 C 語言（可視為一個有全域指標的程式）：

```c
RAM[LCL+0] = 10;
RAM[ARG+2] = 21; RAM[ARG+1] = 22;
RAM[THIS+6] = 36;
RAM[THAT+5] = 42; RAM[THAT+2] = 45;
RAM[11] = 510;    // temp[6]
sum = RAM[LCL+0] + RAM[THAT+5];        // 10 + 42 = 52
sum = sum - RAM[ARG+1];                // 52 - 22 = 30
sum = sum - (RAM[THIS+6] + RAM[THIS+6]); // 30 - 72 = -42
sum = sum + RAM[11];                   // -42 + 510 = 468
```

## 原理

### pop 的位址預算

`pop local i` 在 Hack 層做三件事：算出 `LCL+i` 的目標位址、取出堆疊頂、
寫入該位址。翻譯器的標準手法是**先把目標位址暫存到 `R13`**，再動堆疊
指標，否則減指標時會把「計算位址所需的暫存器」弄丟：

```
@i
D=A
@LCL
D=D+M
@R13
M=D        // R13 = LCL + i
@SP
AM=M-1
D=M        // 堆疊頂
@R13
A=M
M=D        // RAM[R13] = 堆疊頂
```

### temp 段直接定址

`temp` 段固定對應 RAM 5..12，不需基底暫存器：`pop temp 6` 直接寫位址 11
（5+6），`push temp 6` 直接讀位址 11。

## 實作細節（逐段解說）

### 初始化五個段（第 8–31 行）

```
push constant 10
pop local 0        // RAM[LCL+0] = 10
push constant 21
push constant 22
pop argument 2     // RAM[ARG+2] = 21
pop argument 1     // RAM[ARG+1] = 22
push constant 36
pop this 6         // RAM[THIS+6] = 36
push constant 42
push constant 45
pop that 5         // RAM[THAT+5] = 42
pop that 2         // RAM[THAT+2] = 45
push constant 510
pop temp 6         // RAM[11] = 510
```

注意 `push constant 21; push constant 22; pop argument 2; pop argument 1`
的堆疊順序：pop 依「後進先出」取捨，所以 22 先被 pop 到 argument[1]、
21 後被 pop 到 argument[2]。這正好測驗讀者對堆疊順序的理解。

### 計算主體（第 32–47 行）

```
push local 0      // 10
push that 5       // 42
add               // 52
push argument 1   // 22
sub               // 30
push this 6       // 36
push this 6       // 36
add               // 72
sub               // -42
push temp 6       // 510
add               // 468
```

最後堆疊頂為 468。

## 測試與驗證

1. `./vm2asm BasicTest.asm BasicTest.vm`。
2. 以 VM Emulator 執行；測試腳本會先設定 `local/argument/this/that` 的基底
   暫存器（LCL=300、ARG=400、THIS=3000、THAT=3010），並驗證每個段位置
   的寫入值。
3. 官方 `.cmp` 檔案列出最後各段位址的期望值；堆疊頂應為 468。

## 延伸討論

- BasicTest 是唯一同時涵蓋五種段的單一測驗，重複出現多次的 `@R13` 模式
  是理解 pop 的鑰匙。
- 在真實編譯器中，`local/argument/this/that` 對應到「區域變數表、參數表、
  物件的資料成員」；此刻你用固定基底暫存器的間接定址模擬了 C 語言指標
  的整套行為。