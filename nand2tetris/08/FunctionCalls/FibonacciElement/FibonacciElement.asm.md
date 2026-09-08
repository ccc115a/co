# FibonacciElement.asm 程式說明

這是 FibonacciElement 測試集（`Sys.vm` + `Main.vm`）翻譯產出的完整 Hack
組合語言檔，共 434 行。它是最能展示「遞迴 + bootstrap」的譯本：檔頭有一段
bootstrap，接著是 `Sys.init`、`Main.fibonacci`，而 `Main.fibonacci` 內部
自行 call 自己三次（產生 `Main.fibonacci$ret.1/2/3` 三個返回標籤）。

## 概述

- 來源：多檔翻譯；輸入順序 `Sys.vm`、`Main.vm`（因 argc>3 故含 bootstrap）。
- 結構：bootstrap（1–57 行）→ Sys.vm 段（59–125）→ Main.vm 段（127–434）。
- 功能：計算 `fibonacci(4)` 並留在 `(END)` 無窮迴圈。

## 架構總覽

| 行號 | 內容 |
|------|------|
| 1–57 | **bootstrap**：`SP=256` + `call Sys.init 0`（完整 5+ 步驟框架） |
| 59–61 | `(Sys.init)` |
| 62–69 | `push constant 4` |
| 70–120 | `call Main.fibonacci 1` → 到 `(Main.fibonacci$ret.1)` |
| 121–125 | `label END / goto END` |
| 127–129 | `(Main.fibonacci)` 標籤 |
| 130–166 | `push argument 0; push constant 2; lt` → `TRUE_0/END_0` |
| 167–175 | `if-goto N_LT_2` → `D;JNE` |
| 176–177 | `goto N_GE_2` → `0;JMP` |
| 178–231 | `label N_LT_2`：push arg0 + return（基底案例） |
| 232–391 | `label N_GE_2`：push n−2 → **call** → push n−1 → **call** → add → return |
| 392–434 | return 六階段收尾 |

## 原理：遞迴的 call 標籤

遞迴呼叫靠每次產生唯一返回標籤來區分層級。此檔中的三個 call 各自產生：

```
(Main.fibonacci$ret.1)   // Sys.init → Main.fibonacci
(Main.fibonacci$ret.2)   // fib(n) 對 fib(n-2) 的呼叫
(Main.fibonacci$ret.3)   // fib(n) 對 fib(n-1) 的呼叫
```

雖然標籤名稱固定，但每次執行到同一 call 位置，堆疊上壓入的是不同的
返回位址實例（依 SP 位置區分）；return 時由 `R14=*(frame-5)` 取出各自的正確
回程點。這就是遞迴不需特例的原因。

## 實作細節（代表性片段）

### bootstrap（第 3–57 行）

```
@256
D=A
@SP
M=D          // SP = 256
@Sys.init$ret.0
D=A
...          // 推 retAddr, LCL, ARG, THIS, THAT
@SP
D=M
@5
D=D-A
@0
D=D-A
@ARG
M=D          // ARG = SP-5-0
@SP
D=M
@LCL
M=D
@Sys.init
0;JMP
(Sys.init$ret.0)
```

### 遞迴本體（第 232–391 行）

N_GE_2 分支先算 `n-2` 再 `call Main.fibonacci 1`（左側遞迴），回到
`(Main.fibonacci$ret.2)` 後算 `n-1` 再 `call ...`（右側遞迴），回到
`(Main.fibonacci$ret.3)` 後 `add` 相加、`return`。

```
// ... push argument 0 push constant 2 sub（＝n-2）
@Main.fibonacci$ret.2
D=A  ...（五值框架）...
@Main.fibonacci
0;JMP
(Main.fibonacci$ret.2)
// ... push argument 0 push constant 1 sub（＝n-1）
@Main.fibonacci$ret.3
D=A  ...（五值框架）...
@Main.fibonacci
0;JMP
(Main.fibonacci$ret.3)
// add
...
// return
```

## 測試與驗證

- VM Emulator 載入產生的 asm，逐步執行。
- 可在 call 邊界停下來，觀察 SP 步步上升（每層遞迴多佔 6 格：5 框架 + 1 參數）。
- 結束時堆疊頂為 `fibonacci(4)`（0-based 為 3、1-based 為 5，依測試腳本
  期望；官方 .cmp 以 bootstrap 設定為準）。
- 對照 `FibonacciElement.cmp`。

## 延伸討論

- 對比 NestedCall（靜態 3 層），本檔是「動態多層」：同一段函式碼被多次
  進入。觀察 `(Main.fibonacci$ret.2/3)` 被重複執行的次數，可體會 call stack
  的成長與收縮。
- 三檔模式的輸出順序（bootstrap、Sys.vm、Main.vm）反映翻譯器的檔案處理
  順序；此與 VM Emulator 的「bootstrap → Sys.init」啟動流程完全一致。