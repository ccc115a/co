# vm2asm.c 程式說明

這個 C 程式是「VM 翻譯器」（Virtual Machine Translator）：它把第 8 章
（虛擬機 II）的 VM 程式（`.vm`）翻譯成 Hack 組合語言（`.asm`）。
它同時支援第 7 章（堆疊與記憶體存取）與第 8 章（程式控制與函式呼叫）的
全部 VM 指令，是從「高階堆疊機器」通往「真實硬體組合語言」的關鍵橋樑。

> 註：本章的 `vm2asm.c` 與第 7 章資料夾中的 `vm2asm.c` **逐位元組完全相同**
> （可用 `diff` 驗證）。它在第 7 章就被完整寫出，涵蓋了 label/goto/if-goto 與
> function/call/return；第 8 章直接沿用同一支程式來驗證新指令集的翻譯結果。

## 概述

- **輸入**：一或多個 `.vm` 檔（堆疊機器的中間碼）。
- **輸出**：一個 `.asm` 檔（Hack 組合語言，含 `//` 註解標示每個指令對應的原 VM 指令）。
- **地位**：位於 Nand2Tetris 第 7/8 章軟體堆疊的底層，介於「高階語言編譯器輸出」
  與「組合器/Hardware Simulator」之間。
- **組成**：指令剖析（`process_command`）、算術產生（`write_arithmetic`）、
  記憶體存取產生（`write_push` / `write_pop`）、流程控制產生
  （`write_label` / `write_goto` / `write_if_goto`）、函式呼叫框架產生
  （`write_function` / `write_call` / `write_return`），以及開機程式碼（bootstrap）。

## 架構總覽

| 模組 | 對應函式 | 職責 |
|------|----------|------|
| 字串前處理 | `trim` / `remove_comment` | 去除空白與 `//` 註解 |
| 主迴圈 | `main` / `translate_file` | 讀檔、逐行呼叫指令處理 |
| 指令分派 | `process_command` | 依指令首字分派到各產生器 |
| 算術/邏輯 | `write_arithmetic` | add/sub/neg/and/or/not/eq/gt/lt |
| push | `write_push` | 依 segment 產生對應讀取碼 |
| pop | `write_pop` | 依 segment 產生對應寫入碼 |
| 流程控制 | `write_label` / `write_goto` / `write_if_goto` | label/goto/if-goto |
| 函式呼叫 | `write_function` / `write_call` / `write_return` | 堆疊框架協定 |
| 開機 | `write_bootstrap` | `SP=256` 後呼叫 `Sys.init` |

### 全域變數

- `label_count`：比較指令（eq/gt/lt）產生 `TRUE_n` / `END_n` 標籤的唯一編號。
- `return_count`：產生 `函式名$ret.n` 返回位址標籤的唯一編號。
- `current_file`：目前的基底檔名，用來產生 `static` 段的符號（`檔名.i`）。

## 原理

VM 是一台「堆疊機器」（stack machine）：幾乎所有運算都作用在一個被
`SP`（Stack Pointer）指向的堆疊上。第 8 章在其上加入「函式呼叫」能力，讓
不同函式能安全地儲存各自的區域變數（local）、參數（argument）與執行環境
（THIS/THAT），彼此互不干擾。為了達成這件事，整個系統依賴一套固定的
**堆疊框架協定**（stack frame protocol），並用硬體暫存器 `LCL`、`ARG`、
`THIS`、`THAT`、`SP` 來追蹤每個作用中的框架。

本程式的工作，就是把每一條 VM 指令「機械式地」展開成一串等價的 Hack
指令。其核心思想是：**VM 是抽象機，Hack 是具體機器**——VM 的前瞻性在於把
複雜的記憶體段（local/argument/this/that/temp/static/pointer）與函式呼叫都
「虛擬化」；翻譯器的任務就是把這些虛擬抽象映射回真實的 RAM 位址。

### 記憶體段對應表

| VM 段 | 對應的 Hack RAM |
|-------|-----------------|
| constant | 直接載入立即值，不佔 RAM |
| local | `RAM[LCL + i]` |
| argument | `RAM[ARG + i]` |
| this / that | `RAM[THIS + i]` / `RAM[THAT + i]` |
| temp | `RAM[5 + i]`（5..12） |
| pointer 0 / 1 | `THIS` / `THAT` 暫存器本身 |
| static i | 符號 `檔名.i`（由組合器配置位址） |

### 堆疊框架協定（第 8 章重點）

呼叫一個函式時，呼叫者（caller）在堆疊上依序壓入五個「框架值」：
返回位址、`LCL`、`ARG`、`THIS`、`THAT`；然後設定新的 `ARG`（指向參數區起點）
與新的 `LCL`（指向新的框架起點），再跳到被呼叫函式。被呼叫者（callee）先
初始化其 local 變數，執行函式體，最後用 `return` 把框架還原、跳回返回位址。

### call 的五個階段

1. **push return-address**：壓入 `函式名$ret.n` 的位址。
2. **push LCL / ARG / THIS / THAT**：把呼叫者目前的四個環境暫存器值壓入堆疊。
3. **ARG = SP − nArgs − 5**：讓新 `ARG` 指向參數區（`SP` 減去已壓入的 5 個
   框架值與 nArgs 個參數）。
4. **LCL = SP**：新框架起點。
5. **goto 函式 + 定義返回標籤** `(函式名$ret.n)`。

### return 的六個階段

1. **frame = LCL**（存到 `R13`）。
2. **retAddr = *(frame − 5)**（存到 `R14`）。
3. **\*ARG = pop()**：儲存回傳值到參數區起點。
4. **SP = ARG + 1**：把堆疊指標縮回呼叫者的堆疊頂。
5. **回復 THAT / THIS / ARG / LCL**（由 `frame−1` 到 `frame−4` 依序取出）。
6. **goto retAddr**。

## 實作細節

### 字串前處理

`remove_comment` 用 `strstr(line, "//")` 砍掉整行從 `//` 以後的內容；
`trim` 先抹掉開頭空白，再從尾端往回抹掉 `isspace` 的空白字元。
這保證翻譯器對空行、註解行、含縮排的指令都能正常處理。

### 算術指令的 Hack 序列

二元指令（add/sub/and/or/eq/gt/lt）都是「取頂 → 退一格 → 運算 → 存回」：

```c
// add
@SP
AM=M-1   // SP 減一，並把 A 指向新的堆疊頂
D=M      // y = RAM[*SP]
A=A-1    // A 指向第二個元素
M=D+M    // RAM[*SP-1] = x + y
```

關鍵技巧是用 `AM=M-1` 同時「取值並減指標」，一行完成「pop 出 y」。
一元指令（neg/not）只需改堆疊頂：

```c
// neg
@SP
A=M-1
M=-M     // RAM[SP-1] = -RAM[SP-1]
```

### 比較指令產生永真/永假（-1/0）

Hack 沒有布林，怎表示比較結果？比較結果固定是 **-1（true）** 或 **0（false）**。
做法是先取頂並算 `x − y`，再依條件跳轉到不同的分支：

```c
// eq
@SP
AM=M-1
D=M
A=A-1
D=M-D       // D = x - y
@TRUE_0
D;JEQ       // 相等就跳去設 -1
@SP
A=M-1
M=0         // 否則設 0
@END_0
0;JMP
(TRUE_0)
@SP
A=M-1
M=-1
(END_0)
```

`gt` 用 `D;JGT`、`lt` 用 `D;JLT`；每次用到的 `TRUE_n`/`END_n` 標籤由
全域 `label_count` 遞增以保證唯一，避免多個比較指令互相衝突。

### push 指令的 segment 分支

- **constant**：`@i / D=A` 直接把立即值放進 D。
- **local/argument/this/that**：先 `@i / D=A`，再 `@LCL(A?)`（或對應暫存器）
  `A=D+M`，用「間接定址」取出 `RAM[base+i]`。
- **temp**：直接對 `5 + i` 位址取值（因為 temp 固定在 RAM 5..12）。
- **pointer 0/1**：直接把 `THIS`/`THAT` 暫存器的值壓入。
- **static**：用「目前檔案名.i」的符號定址。

### pop 指令的「先算位址」手法

pop 必須「先算出目標位址」再拿堆疊頂的值，否則減堆疊指標會破壞計算用的
暫存器。因此先用 `@i / D=A / @LCL / D=D+M` 算出 `base+i`，暫存到臨時暫存器
`R13`，再 `@SP / AM=M-1 / D=M` 取出堆疊頂，最後 `@R13 / A=M / M=D` 存回目標：

```c
// pop local 0
@0
D=A
@LCL
D=D+M
@R13
M=D        // R13 = LCL + 0（目標位址）
@SP
AM=M-1
D=M        // 堆疊頂
@R13
A=M
M=D        // RAM[R13] = 堆疊頂
```

### label / goto / if-goto

- **label**：直接輸出 `(名稱)` 宣告一個標籤。
- **goto**：`@名稱 / 0;JMP` 無條件跳躍。
- **if-goto**：`@SP / AM=M-1 / D=M / @名稱 / D;JNE`，先 pop 出堆疊頂，
  非零才跳——因為 VM 的條件是「某運算式為真」，實務上非零即真。

### function 指令與區域變數初始化

`function 名稱 k` 會輸出 `(名稱)` 標籤，然後以迴圈壓入 k 個 0 來建立 k 個
local 變數：

```c
(function SimpleFunction.test 2)
(SimpleFunction.test)
@SP
A=M
M=0
@SP
M=M+1   // local[0] = 0
@SP
A=M
M=0
@SP
M=M+1   // local[1] = 0
```

### call 指令（呼叫者側）

```c
// call Sys.add12 1
@Sys.add12$ret.1     // 返回位址
D=A
@SP
A=M
M=D                  // 壓入返回位址
@SP
M=M+1
@LCL
D=M
@SP
A=M
M=D                  // 壓入 LCL
@SP
M=M+1
@ARG
D=M
...                  // 壓入 ARG
@THIS
...                  // 壓入 THIS
@THAT
...                  // 壓入 THAT
@SP
D=M
@5
D=D-A
@1
D=D-A
@ARG
M=D                  // ARG = SP - 5 - 1
@SP
D=M
@LCL
M=D                  // LCL = SP
@Sys.add12
0;JMP                // 跳到函式
(Sys.add12$ret.1)    // 返回標籤
```

### return 指令（被呼叫者側）

`write_return` 完整落實協定的六個階段，利用 `R13`（frame）與 `R14`（retAddr）
這兩個臨時暫存器依序取出框架值：

```c
// return
@LCL
D=M
@R13     // R13 = frame（LCL）
M=D
@5
A=D-A
D=M
@R14     // R14 = *(frame-5) = retAddr
M=D
@SP
AM=M-1
D=M
@ARG
A=M
M=D      // *ARG = pop()
@ARG
D=M+1
@SP
M=D      // SP = ARG + 1
@R13
AM=M-1
D=M
@THAT
M=D      // THAT = *(frame-1)
@R13
AM=M-1
D=M
@THIS
M=D      // THIS = *(frame-2)
@R13
AM=M-1
D=M
@ARG
M=D      // ARG = *(frame-3)
@R13
AM=M-1
D=M
@LCL
M=D      // LCL = *(frame-4)
@R14
A=M
0;JMP    // goto retAddr
```

注意 `AM=M-1` 的妙用：把 `R13` 當作指標逐步減一，每步取出一個框架值，
正好依序拿到 frame−1、frame−2、frame−3、frame−4 的內容。

## 測試與驗證

- 執行方式：`./vm2asm.out 輸出.asm 輸入.vm [更多.vm...]`。
  當傳入**多個** `.vm` 檔時（如 NestedCall/FibonacciElement/StaticsTest），
  `main` 會先輸出 bootstrap 程式碼（`SP=256` 後 `call Sys.init 0`），再依序
  翻譯每個檔案；單檔（如 SimpleAdd）則不輸出 bootstrap。
- 可用 VM Emulator 載入卡式 ROM，或先餵給組合器產生 `.hack` 再用 Hardware
  Simulator / CPU Emulator 驗證。
- 測試集：
  - `StackArithmetic/`（SimpleAdd、StackTest）測算術與比較。
  - `MemoryAccess/`（BasicTest、PointerTest、StaticTest）測記憶體段。
  - `ProgramFlow/`（BasicLoop、FibonacciSeries）測 label/goto/if-goto。
  - `FunctionCalls/`（SimpleFunction、NestedCall、FibonacciElement、StaticsTest）
    測函式框架協定、巢狀呼叫、遞迴、跨類別 static。

## 延伸討論

- **R13/R14 的用途**：翻譯器把 `R13`（frame）、`R14`（retAddr）當作內部暫存，
  這是標準做法；真正的解析器常把 `SP`、`LCL`、`ARG` 等假設為 RAM 0..4，
  以便在進入迴圈時臨時借用。
- **對應真實機器**：這套「呼叫者推框架、被呼叫者回推框架」的協定，幾乎就是
  x86/ARM 棧框（stack frame）的縮小版；`retAddr` 就是指令回址暫存器，
  `ARG` 就是傳參約定（calling convention）。
- **兩 pass 的必要性**：本程式採「每條 VM 指令獨立展開」，不需知道其他指令；
  若改用先掃瞄全檔再配 label，能產生更精簡的程式碼，但會失去單指令獨立的
  簡潔性。
