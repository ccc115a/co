# BasicTest.asm 程式說明

這是 `BasicTest.vm` 的 Hack 組合語言翻譯輸出，共 235 行。它是觀察
「pop 指令如何在 Hack 層面實現」的最佳範例檔案：同一個「算位址 → 存 R13 →
取堆疊頂 → 寫入」模板重複出現在 local/argument/this/that 四種段。

## 概述

- 來源：`BasicTest.vm`（見該檔說明）。
- 結構：前半段（第 3–142 行）是各種 pop，後半段（第 143–235 行）是
  push/add/sub 計算。

## 架構總覽

| 行號 | VM 指令 | 展開模式 |
|------|---------|----------|
| 3–10 | `push constant 10` | 立即值壓棧 |
| 11–23 | `pop local 0` | 算位址 + 寫 R13 模板 |
| 24–53 | `push 21,22 / pop argument 2,1` | 壓棧 + argument 模板 |
| 54–86 | `push 36 / pop this 6` | this 模板 |
| 87–128 | `push 42,45 / pop that 5,2` | that 模板 |
| 129–142 | `push 510 / pop temp 6` | 直接定址 RAM[11] |
| 143–235 | 計算主體 | push 段讀取 + add/sub |

## 原理

### 四種「基底+偏移」段的三步模板

local/argument/this/that 都只是不同的基底暫存器，展開方式完全一致。以
**pop local 0**（第 11–23 行）為例：

```
@0
D=A
@LCL
D=D+M
@R13
M=D        // 1. R13 = 目標位址
@SP
AM=M-1
D=M        // 2. 取堆疊頂
@R13
A=M
M=D        // 3. 寫入目標
```

`@R13` 是 Hack 的定址捷徑：R13 就是 RAM 13，`A=M`/`M=D` 讓 R13 當作
「指標」使用。比較 `pop argument 2`（第 40–52 行）與 `pop this 6`
（第 74–86 行），唯一差別是 `@LCL`、`@ARG`、`@THIS`、`@THAT`。

### temp 段的差別

`pop temp 6`（第 137–142 行）因為目標固定是 RAM 11（5+6），不需要算位址：

```
@SP
AM=M-1
D=M
@11
M=D
```

## 實作細節（代表性片段）

### push that 5（第 154–164 行）

```
@5
D=A
@THAT
A=D+M    // A = THAT + 5
D=M      // D = RAM[THAT+5] = 42
@SP
A=M
M=D
@SP
M=M+1    // 壓入
```

### push local 0（第 143–153 行）

同樣模板，把 `@THAT` 換成 `@LCL`，讀出 RAM[LCL+0] = 10 壓入。

### add/sub 的連鎖（第 165–236 行）

```
add  → @SP / AM=M-1 / D=M / A=A-1 / M=D+M   // 10+42 = 52
sub  → @SP / AM=M-1 / D=M / A=A-1 / M=M-D   // 52-22 = 30
add  → 36+36 = 72
sub  → 30-72 = -42
add  → -42+510 = 468
```

## 測試與驗證

- 以 CPU Emulator 載入；也可搭配 Hardare Simulator 觀察 RAM。
- 執行後 RAM 內容（假設 LCL=300、ARG=400、THIS=3000、THAT=3010）：
  - RAM[300]=10、RAM[402]=21、RAM[401]=22、RAM[3006]=36、
    RAM[3015]=42、RAM[3012]=45、RAM[11]=510。
  - 堆疊頂 RAM[256]=468，`SP=257`。

## 延伸討論

注意「先算位址」是 pop 的必要條件，卻不是 push 的必要條件：push 從基底
取讀只用到 A/D 暫存器（`A=D+M; D=M`），不會互相覆寫；pop 需要同時算位址
與取堆疊頂，才必須借用 R13 暫存。這是翻譯器設計上的關鍵長處，也是
`R13/R14` 在後續第 8 章函式框架中再次出現的原因。