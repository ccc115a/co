# test1.vm 程式說明

這是一個最精簡的 VM 測試檔，只有三行指令：壓入兩個常數後相加。
它被用作第 8 章 VM 翻譯器（`vm2asm.c`）的第一個冒煙測試（smoke test），
驗證最基本的 `push constant` 與 `add` 兩條指令能否正確翻譯成 Hack 組合語言。

## 概述

- 用途：確認翻譯器對「常數壓棧」與「二元加法」的展開正確無誤。
- 完整內容：

```
push constant 7
push constant 8
add
```

- 對應的 C 語言：`int x = 7 + 8;` 或更貼近堆疊機器：`push(7); push(8); x = pop() + pop();`

## 原理

在 VM 堆疊機器上，`push constant 7` 把整數 7 放到堆疊頂；`push constant 8`
再放一個；`add` 則把堆疊最上面兩個值取出、相加，再把結果壓回堆疊。

最終堆疊只剩一個值 15。

## 實作細節（VM → Hack 對照）

每一條 VM 指令被展開成一串 Hack 指令。以 `test1.asm` 為例：

| VM 指令 | 展開的 Hack 組合語言 |
|---------|----------------------|
| `push constant 7` | `@7 / D=A / @SP / A=M / M=D / @SP / M=M+1` |
| `push constant 8` | `@8 / D=A / @SP / A=M / M=D / @SP / M=M+1` |
| `add` | `@SP / AM=M-1 / D=M / A=A-1 / M=D+M` |

`push constant` 的核心：把立即值放進 D，用 `@SP / A=M` 指向堆疊頂、寫入值，
最後 `@SP / M=M+1` 讓堆疊指標上移一格。

`add` 的核心：`AM=M-1` 同時把 `SP` 減一並把 A 指到新頂，`D=M` 取出 y，
`A=A-1` 指到 x，`M=D+M` 相加寫回，堆疊因此少了一個元素。

## 測試與驗證

1. 用 `vm2asm.c` 翻譯：`./vm2asm 輸出 test1.vm`。
2. 產出的 `test1.asm` 即為上表內容。
3. 交由組合器或 CPU Emulator 執行，最後堆疊頂應為 15。

## 延伸討論

這個小測試雖短，卻驗證了「定址模式」（立即值 vs 間接定址）與「二元運算」
兩套機制；把它跑通，是後面所有 `StackTest`、`MemoryAccess`、`ProgramFlow`、
`FunctionCalls` 測試集能通過的前提。
