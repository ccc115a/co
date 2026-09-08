# StaticsTest.asm 程式說明

這是 StaticsTest 測試集（`Sys.vm`、`Class1.vm`、`Class2.vm` 三檔合一）翻譯
產出的完整 Hack 組合語言檔，共 626 行。它是「多檔翻譯 + static 符號隔離」
的最佳教材：bootstrap 之後，同一份 asm 中出現 `Class1.0`、`Class1.1`、
`Class2.0`、`Class2.1` 四個彼此不同的 static 符號。

## 概述

- 來源：輸入順序 `Sys.vm`、`Class1.vm`、`Class2.vm`（多檔 ⇒ 含 bootstrap）。
- 功能：`Sys.init` 依次 call `Class1.set(6,8)`、`Class2.set(23,15)`、
  `Class1.get`、`Class2.get`；最後堆疊頂 = 8、次頂 = −2。
- 壓軸：return 六階段模板在檔中出現四次（Class1.set / Class1.get /
  Class2.set / Class2.get 各一）。

## 架構總覽

| 行號 | 內容 |
|------|------|
| 1–57 | **bootstrap**：`SP=256` + `call Sys.init 0` |
| 59–61 | `(Sys.init)` |
| 62–128 | `call Class1.set 2`（含四處 cat 的框架碼）→ 到 `(Class1.set$ret.1)` |
| 129–134 | pop temp 0 |
| 135–201 | `call Class2.set 2` → `(Class2.set$ret.2)` |
| 202–207 | pop temp 0 |
| 208–258 | `call Class1.get 0` → `(Class1.get$ret.3)` |
| 259–309 | `call Class2.get 0` → `(Class2.get$ret.4)` |
| 310–314 | `label END / goto END` |
| 316–404 | `(Class1.set)` 與 `(Class1.get)` 函式本體 |
| 405–470 | Class1.get 的函式體（push static + sub + return） |
| 472–626 | `(Class2.set)` 與 `(Class2.get)` 函式體 |

## 原理：static 符號與巢狀 call 在同一檔共演

### 符號隔離

- `Class1.set` 的 `pop static 0` → `@Class1.0 / M=D`（第 330–335 行）。
- `Class2.set` 的 `pop static 0` → `@Class2.0 / M=D`（第 486–491 行）。
- 組譯時兩者配置到不同 RAM 位址，實現「類別變數隔離」。

### 巢狀 call

`Sys.init` 執行 `call Class1.set 2` 時（第 62–128 行），完整的五值框架
加上 `ARG=SP-5-2` 的設定，讓 `Class1.set` 的 `argument 0/1` 正確指到 6、8。
回傳後 `pop temp 0`（第 129–134 行，RAM 5）清掉回傳值。

## 實作細節（代表性片段）

### call Class1.set 2 的核心（第 78–128 行）

```
@Class1.set$ret.1
D=A
@SP
A=M
M=D
@SP
M=M+1     // 推 retAddr
@LCL  D=M 推入
@ARG  D=M 推入
@THIS D=M 推入
@THAT D=M 推入
@SP
D=M
@5
D=D-A
@2
D=D-A
@ARG
M=D      // ARG = SP - 5 - 2
@SP
D=M
@LCL
M=D      // LCL = SP
@Class1.set
0;JMP
(Class1.set$ret.1)
```

### pop static（第 330–335 行）

```
@SP
AM=M-1
D=M
@Class1.0
M=D      // Class1.0 = argument 0（=6）
```

### Class2.get 的 return（第 584–626 行）

再次使用六階段模板，回傳 `Class2.0 − Class2.1 = 8`。

## 測試與驗證

- VM Emulator 執行（或組譯後 CPU Emulator）。
- 觀看符號表：`Class1.0`、`Class1.1`、`Class2.0`、`Class2.1` 是四個不同
  位址（依出現順序 16、17、18、19 起）。
- 結束時 `RAM[SP-1] = 8`、`RAM[SP-2] = -2`。
- 對照 `StaticsTest.cmp`。

## 延伸討論

- 這份譯本把「三章的全部本領」一次集齊：bootstrap、push/pop 各段、
  call/return 框架、static 符號、巢狀呼叫。
- return 模板出現四次而非兩次，正好對應「一個類別兩個函式 × 兩個類別」；
  每一份 return 都逆著自己的 call 把 R13/R14 作為臨時暫存還原環境。
- 若拿掉檔名前綴，`Class1.0` 與 `Class2.0` 會合併成同一個符號，測試即失敗；
  這正是第 7 章 `StaticTest` 與第 8 章 `StaticsTest` 一前一後、由簡入繁的
  教學序列。