# FibonacciSeries.asm 程式說明

這是 `FibonacciSeries.vm` 的 Hack 組合語言翻譯輸出，共 235 行。它是第 8 章
ProgramFlow 的完整譯本：一個 `(LOOP)`/`(COMPUTE_ELEMENT)`/`(END)` 三標籤
迴圈，加上 `D;JNE` 與 `0;JMP` 的 if-else 組合。

## 概述

- 來源：`FibonacciSeries.vm`（把費氏數列前 n 項寫入 addr 起的記憶體）。
- 對應 C 語言：

```c
THAT = addr;
THAT[0]=0; THAT[1]=1;
n -= 2;
LOOP:
  if (n != 0) goto COMPUTE;
  goto END;
COMPUTE:
  THAT[2] = THAT[0] + THAT[1];
  THAT++;
  n--;
  goto LOOP;
END: ;
```

## 架構總覽

| 行號 | VM 指令 | Hack 展開 |
|------|---------|-----------|
| 3–19 | `push argument 1 / pop pointer 1` | `@THAT / M=D` |
| 20–61 | 設 that[0]=0、that[1]=1 | push constant + R13 pop 模板 |
| 62–99 | `n = n - 2` | push arg0 + sub + pop arg0 |
| 100–101 | `label LOOP` | `(LOOP)` |
| 102–121 | `if-goto COMPUTE_ELEMENT` + `goto END` | `D;JNE` + `0;JMP` |
| 122–123 | `label COMPUTE_ELEMENT` | `(COMPUTE_ELEMENT)` |
| 124–192 | 算新元素 + THAT++ + n-- | add、push/pop pointer 1 模板 |
| 193–233 | `goto LOOP` | `0;JMP` |
| 234–235 | `label END` | `(END)` |

## 原理

### if-else 的兩種跳躍

```
// if-goto COMPUTE_ELEMENT
@SP
AM=M-1
D=M
@COMPUTE_ELEMENT
D;JNE    // n≠0 → 算
// goto END
@END
0;JMP    // n==0 → 結束
```

`D;JNE` 是「條件成立往 A 跳」、`0;JMP` 是「不成立時無條件往 B 跳」。
兩者連在一起就是高階的 `if (c) A; else B;`。

### pointer 的遷移

`pop pointer 1`（第 187–192 行）把 `THAT` 暫存器加一：

```
// push pointer 1
@THAT
D=M
@SP
A=M
M=D
@SP
M=M+1
// push constant 1 ... add ...
@THAT    // 第 187 行
M=D      // THAT = THAT + 1
```

因為 `add` 已在堆疊算出 `THAT+1`，`pop pointer 1` 只消 `@SP / AM=M-1 / D=M /
@THAT / M=D` 四步就把基底前移，不必重新算位址——這是本翻譯與靜態陣列最大的
不同。

## 實作細節（代表性片段）

### 初始化 that[0]=0（第 21–39 行）

```
// push constant 0
@0 D=A @SP A=M M=D @SP M=M+1
// pop that 0
@0 D=A @THAT D=D+M @R13 M=D
@SP AM=M-1 D=M @R13 A=M M=D
```

（此處以簡寫示意；完整如 asm 第 20–39 行。）

### COMPUTE_ELEMENT 主體（第 124–191 行）

`add` 算出 that[0]+that[1] 後，`pop that 2` 用 R13 模板寫入 `RAM[THAT+2]`，
接著 pointer 遷移與 n-- 各用其模板。

## 測試與驗證

- VM Emulator 載入翻譯後的 asm（或直接載入 vm）。
- n=10、addr 湊定後，`RAM[addr..addr+9]` 應為
  0,1,1,2,3,5,8,13,21,34。
- 觀察各標籤在 CPU Emulator 中跳轉的次數：COMPUTE 進入 8 次（n=10、先減 2）、
  LOOP 每次迴圈檢查一次。

## 延伸討論

對照 BasicLoop，此檔在「if-else」上多花了兩個標籤與一條 `0;JMP`，但兩種
範式都只有三種翻譯模板可拼：`(標籤)`、`@標籤;Jxx`、`@標籤;0;JMP`。看完
這兩份譯本，即可讀懂第 8 章所有 ProgramFlow 輸出。