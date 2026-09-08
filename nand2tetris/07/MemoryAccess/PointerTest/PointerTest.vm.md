# PointerTest.vm 程式說明

這是 Nand2Tetris 官方第 7 章 MemoryAccess 專案的測試檔，出處為 projects/7/MemoryAccess/PointerTest。它測試 `pointer` 段以及它與 `this`/`that` 段的互動——**透過 pop pointer 0/1 改變 THIS/THAT 指向的 RAM 位址，再對 this/that 段寫值，證明記憶體段是真的「透過基底暫存器來定址」**。

## 概述

- 功能：先把 THIS 設成 RAM[3030]、THAT 設成 RAM[3040]，再往 this[2] 與 that[6] 寫值，最後把 THIS/THAT 的值與這兩個槽位的值做算術。
- 測驗重點：`pointer` 的 index 0 必須對到 THIS、index 1 必須對到 THAT；此測驗不依賴任何外部初始化，**基底暫存器是在程式內用 constant 直接指定的**，因此任何翻譯器都能自行跑出確定結果。

## 原始碼逐段解說

### 設定基底暫存器

```vm
push constant 3030
pop pointer 0
```

`pop pointer 0` 的翻譯為「把堆疊頂端值寫進 THIS」：

```asm
@SP
AM=M-1
D=M
@THIS
M=D
```

執行後 `THIS = 3030`。

```vm
push constant 3040
pop pointer 1
```

同上，寫進 THAT：

```asm
@SP
AM=M-1
D=M
@THAT
M=D
```

執行後 `THAT = 3040`。至此 THIS、THAT 成為兩個「指向任意 RAM 區域」的指標。

### 經由 this/that 槽位寫值

```vm
push constant 32
pop this 2
```

`pop this 2`＝把值 32 寫到 `THIS + 2 = RAM[3032]`。使用的是標準 base+index 骨架（先算位址存 R13、再取堆疊值寫回）。

```vm
push constant 46
pop that 6
```

把 46 寫到 `THAT + 6 = RAM[3046]`。

### 讀回並運算

```vm
push pointer 0     // push THIS 的值 → 3030
push pointer 1     // push THAT 的值 → 3040
add                // 3030 + 3040 = 6070
push this 2        // RAM[3032] = 32
sub                // 6070 - 32 = 6038
push that 6        // RAM[3046] = 46
add                // 6038 + 46 = 6084
```

`push pointer 0` 的翻譯為「把 THIS 內容當資料推入堆疊」：

```asm
@THIS
D=M
@SP
A=M
M=D
@SP
M=M+1
```

最終結果 6084 同時見證了「THIS/THAT 的指標值」與「經由指標存取的槽位」都被正確處理。

## 關鍵對照表

| VM 指令 | 翻譯到的目標 | 效果 |
|---------|--------------|------|
| pop pointer 0 | `@THIS M=D` | THIS = 3030 |
| pop pointer 1 | `@THAT M=D` | THAT = 3040 |
| pop this 2 | RAM[THIS+2]=RAM[3032] | = 32 |
| pop that 6 | RAM[THAT+6]=RAM[3046] | = 46 |
| push pointer 0 | 讀 `@THIS D=M` | 3030 入堆疊 |
| push pointer 1 | 讀 `@THAT D=M` | 3040 入堆疊 |
| push this 2 | 讀 RAM[3032] | 32 入堆疊 |
| push that 6 | 讀 RAM[3046] | 46 入堆疊 |

## 測試與驗證

PointerTest.tst 斷言最終 `RAM[0]==257`、`RAM[256]==6084`，並可在執行過程中觀察 THIS/THAT（R3/R4）變為 3030/3040、RAM[3032]=32、RAM[3046]=46。本專案 vm2asm.c 產生的 PointerTest.asm 可用 CPU Emulator 直接重現。

## 延伸討論

- `this`/`that` 的用途是存取「目前物件所屬的欄位」與「陣列元素」等動態資料；pointer 段讓編譯器可以修改 THIS/THAT 去切換目前處理的物件或陣列。這在 Operating System（第 12 章）的陣列實作中扮演關鍵角色。
- THIS/THAT 其實就是 RAM[3]/RAM[4]。VM 的「段」不是記憶體本身，而是「基底暫存器 + 偏移」的定址模式；PointerTest 正是在驗證「換掉基底，段就把舊地址拋棄、改用新地址」。