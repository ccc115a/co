# SimpleFunction.asm 程式說明

這是 `SimpleFunction.vm` 的 Hack 組合語言翻譯輸出，共 123 行。它是第 8 章
「堆疊框架協定」最重要的教學標本：演練了 `function`（推 0 初始化 local）、
`return`（六階段反推框架）的完整機器碼，因為函式本身最簡單，讀者可以
一次看懂 framework 的每個步驟。

## 概述

- 來源：`SimpleFunction.vm`（見該檔說明）。
- 結構：`(SimpleFunction.test)` 標籤 → 推入 local 0、local 1 → 運算 → return。

## 架構總覽

| 行號 | VM 指令 | Hack 展開 |
|------|---------|-----------|
| 3–14 | `function SimpleFunction.test 2` | `(標籤)` + 兩個「推 0」塊 |
| 15–36 | `push local 0,1 / add` | 基底定址 + add |
| 43–46 | `not` | `@SP / A=M-1 / M=!M` |
| 47–80 | push arg0、add、push arg1、sub | 計算主體 |
| 81–123 | `return` | 六階段框架回推 |

## 原理：function 的「推 0」擴充

`function SimpleFunction.test 2` 展開成一個標籤定義，後面緊接兩段相同的
「寫 0 並推棧」碼（第 5–14 行）：

```
(SimpleFunction.test)
@SP
A=M
M=0      // RAM[SP] = 0
@SP
M=M+1    // 建立 local0
@SP
A=M
M=0
@SP
M=M+1    // 建立 local1
```

這兩個 0 就是 local0、local1。因為它們現在正好位於 `LCL+0`、`LCL+1`，
後續 `push local 0` 用 `@LCL / A=D+M / D=M` 就能讀到。

## 實作細節：return 的六階段

第 81–123 行的 `return` 是框架協定的精華，每一步都有註解可循：

```
@LCL
D=M
@R13
M=D        // 1. frame(R13) = LCL
@5
A=D-A
D=M
@R14
M=D        // 2. retAddr(R14) = *(frame-5)
@SP
AM=M-1
D=M
@ARG
A=M
M=D        // 3. *ARG = pop()（放回傳值）
@ARG
D=M+1
@SP
M=D        // 4. SP = ARG + 1
@R13
AM=M-1
D=M
@THAT
M=D        // 5. THAT = *(frame-1)
@R13
AM=M-1
D=M
@THIS
M=D        //    THIS = *(frame-2)
@R13
AM=M-1
D=M
@ARG
M=D        //    ARG = *(frame-3)
@R13
AM=M-1
D=M
@LCL
M=D        //    LCL = *(frame-4)
@R14
A=M
0;JMP      // 6. goto retAddr
```

這裡反推的順序（THAT→THIS→ARG→LCL）正是呼叫時「壓入 THAN→THIS→ARG→LCL→
retAddr」的反向；`AM=M-1` 讓 R13 指標邊減邊取，一次拿到一層。

## 測試與驗證

- 與 `.vm` 檔相同測試流程；可用 CPU Emulator 觀察 R13/R14 與 SP 的
  逐步變化。
- 呼叫者若設 arg0=2、arg1=3，則回傳 -2。對照 `SimpleFunction.cmp`。

## 延伸討論

注意此檔單靠 function/return 就能成形，並未使用 `call`（由測試腳本扮演
caller）。看懂這份譯本後，把「call 的 5 步驟」加到前頭、加入巢狀壓棧，
就是完整的 NestedCall 行為；此檔是所有 FunctionCalls 測驗的「最小完備集」。