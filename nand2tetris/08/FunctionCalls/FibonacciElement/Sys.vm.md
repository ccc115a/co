# Sys.vm 程式說明（FibonacciElement 測試）

這是 FibonacciElement 測試集的 `Sys.vm`，只定義 `Sys.init`：它推入常數 4
當作 `Main.fibonacci` 的參數並呼叫它。依照 VM 慣例，這個函式由 bootstrap
程式碼自動呼叫（`SP=256` 後 `call Sys.init 0`）。

## 概述

- 目的：作為程式的進入點，呼叫 `Main.fibonacci(4)`。
- 對應 C 語言：

```c
void main() {
    int result = fibonacci(4);   // 1-based：fib(4)=5（若 0-based 則為 3）
    while(1);                    // 程式不結束，避免越界執行
}
```

`Sys.init` 是 VM 世界的「主程式」（main）：VM 翻譯器（多檔模式）產生的
bootstrap 會先 `SP=256`，然後 `call Sys.init`。本檔遵循這個慣例。

## 原理：進入點與無窮迴圈

- `function Sys.init 0`：宣告進入函式（0 local）。
- `push constant 4`：把參數放到堆疊頂。
- `call Main.fibonacci 1`：呼叫遞迴函式，並告知有 1 個參數。框架建立後，
  `ARG` 會指向這個 4，使 `Main.fibonacci` 的 `argument 0` = 4。
- `label END / goto END`：程式執行完畢後，若沒有無窮迴圈，Hack 會「落入
  記憶體盡頭」執行垃圾指令；無窮迴圈是 VM 程式的標準收尾方式。

## 實作細節（逐段解說）

```
function Sys.init 0
  push constant 4      // n = 4
  call Main.fibonacci 1
label END
  goto END             // 無窮迴圈：永不離開
```

呼叫的瞬間堆疊長這樣（示意，SP 約在 261）：

```
[ ... 框架五值（retAddr,LCL,ARG,THIS,THAT） | 4 ]  ← ARG 指向“4”
```

`Main.fibonacci` 用 `@ARG / A=D+M / D=M`（offset 0）讀到 4。

## 測試與驗證

1. 與 `Main.vm` 一起翻譯：`./vm2asm FibonacciElement.asm Sys.vm Main.vm`。
2. **注意輸入檔案順序**：多檔模式會先產生 bootstrap，把 `Sys.init` 設為
   第一個被 call 的函式；此測試的順序為 `Sys.vm Main.vm`。
3. VM Emulator 執行；`Sys.init` 呼叫 `fibonacci(4)` 後一直停在 `(END)`，
   結束時堆疊頂為回傳值。
4. 對照 `FibonacciElement.cmp`。

## 延伸討論

- 「`Sys.init` 自動被呼叫」是 VM 的啟動慣例（Entry Point）；bootstrap 程式碼
  相當於真實作業系統/執行時的「startup stub」。
- lambda/直譯器領域常把主程式也當第一個函式呼叫；本檔正是這個抽象的正確
  示範——`Sys.init` 之後整支程式都是「函式呼叫」，沒有特例的「main」。
- 無窮迴圈 `(END)` 也提醒我們：VM 程式不是「結束」而是「停在原地」，以免
  執行到有效記憶體之外。