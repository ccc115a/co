# BasicLoop.asm 程式說明

這是 `BasicLoop.vm` 的 Hack 組合語言翻譯輸出，共 132 行。它是第 8 章
ProgramFlow 的第一份「流程控制」譯本，展示 label、無條件跳躍與條件跳躍
如何在 Hack 中落地。

## 概述

- 來源：`BasicLoop.vm`（計算 1+...+n）。
- 對應 C 語言：

```c
int sum = 0;
LOOP: sum += n;
      n -= 1;
      if (n != 0) goto LOOP;
result = sum;
```

## 架構總覽

| 行號 | VM 指令 | Hack 展開 |
|------|---------|-----------|
| 3–23 | `push/pop local 0`（sum=0） | 壓棧 + R13 pop 模板 |
| 24–25 | `label LOOP` | `(LOOP)` |
| 26–66 | `sum = sum + n` | push arg0 + push local0 + add + pop local0 |
| 67–104 | `n = n - 1` | push arg0 + push 1 + sub + pop arg0 |
| 105–121 | `if-goto LOOP` | push arg0 + `@LOOP / D;JNE` |
| 122–132 | `push local 0` | 留下 sum |

## 原理

### 條件跳躍的「先推後判」

`if-goto LOOP` 展開成：

```
// push argument 0
@0
D=A
@ARG
A=D+M
D=M
@SP
A=M
M=D
@SP
M=M+1
// if-goto LOOP
@SP
AM=M-1
D=M      // pop 出 n
@LOOP
D;JNE    // 非零跳回 LOOP
```

這裡 D;JNE 檢查的是「pop 出的值 ≠ 0」。因為 n 每次減一，一直到 n 變 0 時
`D;JNE` 不再跳，程式流落入 `push local 0`。

### label 只是「無操作」的標記

`label LOOP` 翻譯成 `(LOOP)`：Hack 的標籤宣告本身不執行任何位元，純粹是
組合器的位址記號，讓 `@LOOP` 能被解析。

## 實作細節（代表性片段）

### 迴圈本體（第 26–66 行）

```
(LOOP)
// push argument 0
@0 D=A @ARG A=D+M D=M @SP A=M M=D @SP M=M+1
// push local 0
@0 D=A @LCL A=D+M D=M @SP A=M M=D @SP M=M+1
// add
@SP AM=M-1 D=M A=A-1 M=D+M
// pop local 0
@0 D=A @LCL D=D+M @R13 M=D @SP AM=M-1 D=M @R13 A=M M=D
```

對應 VM 的 `sum += n`。`add` 把頂兩值 sum、n 相加（LIFO 順序：先推 n 再推
sum，故出來是先 pop sum 後 pop n——但加法可交換，無妨），再 pop 回 local 0。

### goto END（無此，本檔用 if-goto 直接跳出）

本迴圈刻意只用 `if-goto` 跳回 LOOP，當條件失敗時自然落入下一行，
不需要額外 goto；這是最簡潔的 while 迴圈型式。

## 測試與驗證

- 單檔模式翻譯（無 bootstrap），用 VM Emulator 或搭配呼叫者設定
  `argument[0]`。
- n=3 時，local 0（sum）依序 0、3、5、6，最後堆疊頂 6。
- 對照第 8 章專案 `BasicLoop.cmp`。

## 延伸討論

對照 `FibonacciSeries.asm` 可看到更複雜的「if-goto 配 goto」結構：
條件成立走 A 分支、條件失敗走 B 分支，正是高階語言
`if (c) A; else B;` 在低階階的樣貌。學會組合 `D;JNE` 後接 `0;JMP`，
就能拼出課堂上所有條件結構。