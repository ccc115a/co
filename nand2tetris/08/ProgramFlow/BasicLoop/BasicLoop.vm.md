# BasicLoop.vm 程式說明

BasicLoop.vm 是第 8 章 ProgramFlow 測試集的第一個程式，完整示範
label / goto / if-goto 三條流程控制指令。它計算 `1 + 2 + ... + n` 的總和，
`n` 由呼叫者放在 `argument[0]`。

## 概述

- 目的：測試 `label`、`goto`、`if-goto` 三條新 VM 指令的翻譯。
- 演算法：

```c
int sum = 0;            // local 0
while (n > 0) {
    sum = sum + n;
    n = n - 1;
}
// 把 sum 留在堆疊頂
```

- 對應 C 語言：`for (; n>0; n--) sum += n;`

## 原理

VM 在三條流程指令中扮演「高階控制流」的角色：

- `label X`：定義一個程式碼標記點，翻譯成 Hack 的 `(X)`。
- `goto X`：無條件跳躍，翻譯成 `@X / 0;JMP`。
- `if-goto X`：**先 pop 出堆疊頂**，若非零（true）則跳到 X，翻譯成
  `@SP / AM=M-1 / D=M / @X / D;JNE`。

關鍵：VM 的 `if-goto` 帶有「side effect」——它會消耗堆疊頂的一個值。
高階語言裡的 `if (condition) goto X` 中，condition 在 VM 層要先被計算並
推上堆疊，`if-goto` 再把它取走判斷。因此迴圈的典型寫法是在 `if-goto`
前先 `push 某條件式`。

## 實作細節（逐段解說）

```
push constant 0
pop local 0          // sum = 0

label LOOP
push argument 0      // 推入 n
push local 0         // 推入 sum
add
pop local 0          // sum = sum + n

push argument 0      // 推入 n
push constant 1
sub
pop argument 0       // n = n - 1

push argument 0      // 推入 n
if-goto LOOP         // 若 n != 0 繼續迴圈

push local 0         // n 歸零後，把 sum 推上堆疊
```

注意 `if-goto LOOP` 前只有 `push argument 0`：它把目前的 n 推上堆疊，
`if-goto` 再 pop 出來判斷。若 n 不為零就跳回 LOOP 繼續累加；n 為零則
跳出、往下執行 `push local 0` 留下 sum。

## 測試與驗證

1. 官方測試由 caller 初始化（例如把 `argument[0]` 設為 3）。
2. `./vm2asm BasicLoop.asm BasicLoop.vm`，再用 VM Emulator 執行與比對
   `BasicLoop.cmp`（期望 sum = 6）。
3. 檢查翻譯結果：asm 中應有 `(LOOP)` 標籤、兩個 `0;JMP` 與一個 `D;JNE`。

## 延伸討論

- `if-goto` 消耗一個堆疊值，是 VM 與高階語言最大的語意落差；Jack 編譯器在
  輸出 `if (expr) ...` 時，會先 `push expr` 再 `if-goto`，兩者必須配對。
- 這裡的迴圈本體同時用到 local（sum）與 argument（n）：翻譯器以固定的
  `LCL`/`ARG` 基底暫存器定址，完整對應第 7 章的記憶體段機制。