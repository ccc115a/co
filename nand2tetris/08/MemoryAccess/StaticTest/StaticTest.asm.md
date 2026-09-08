# StaticTest.asm 程式說明

這是 `StaticTest.vm` 的 Hack 組合語言翻譯輸出，共 80 行。它的教學重點在
「pop/push static」：用 `@StaticTest.N` 這類符號定址，而符號的實際位址由
組合器在組譯時配置。

## 概述

- 來源：`StaticTest.vm`（見該檔說明）。
- 流程：`StaticTest.8=888、StaticTest.3=333、StaticTest.1=111`，然後
  333 − 111 + 888 = 1110。

## 架構總覽

| 行號 | VM 指令 | Hack 關鍵動作 |
|------|---------|---------------|
| 3–26 | `push constant 111,333,888` | 依序壓入三個值 |
| 27–44 | `pop static 8,3,1` | `@StaticTest.8 / M=D` 等 |
| 45–61 | `push static 3,1 / sub` | 讀符號值、相減 |
| 62–80 | `push static 8 / add` | 再加得 1110 |

## 原理

`pop static i` 翻譯成「把堆疊頂寫進符號 `檔名.i`」：

```
// pop static 8
@SP
AM=M-1
D=M
@StaticTest.8
M=D
```

`push static i` 翻譯成：

```
// push static 3
@StaticTest.3
D=M
@SP
A=M
M=D
@SP
M=M+1
```

這兩個模板完全不需要 R13：符號本身就是目標位址的「名字」。組合器會在
組譯時，以「第一 pass 收集變數符號、第二 pass 解析」的方式，把 `StaticTest.1`、
`StaticTest.3`、`StaticTest.8` 依出現順序配置到 RAM 16 起算的位址。

## 實作細節（代表性片段）

### pop static 3（第 33–38 行）

```
@SP
AM=M-1
D=M
@StaticTest.3
M=D
```

### sub（第 61–66 行）

```
@SP
AM=M-1
D=M
A=A-1
M=M-D    // 333 - 111
```

### add 收尾（第 75–80 行）

```
@SP
AM=M-1
D=M
A=A-1
M=D+M    // 222 + 888 = 1110
```

## 測試與驗證

- 這支 asm 需要組合器（Assembler）先組譯成 `.hack`，再以 CPU Emulator 或
  Hardware Simulator 執行；或直接用 VM Emulator 跑原 `.vm`。
- 檢查符號表：`StaticTest.1 → RAM 16`、`StaticTest.3 → RAM 17`、
  `StaticTest.8 → RAM 18`（依出現順序）。
- 執行後堆疊頂為 1110。

## 延伸討論

- 與第 8 章 `FunctionCalls/StaticsTest/StaticsTest.asm` 對照，可看到
  `Class1.0`、`Class2.0` 等符號：它們產自不同 `.vm` 檔，故檔名前綴不同，
  兩個類別的 static 也因此互相隔離。
- 這個「具名符號 → RAM 位址」的機制，正是組合器符號表的應用；也是
  連結器（linker）解析「可見名稱」的最小雛形。