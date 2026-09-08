# StaticTest.asm 程式說明

這是以 vm2asm.c 翻譯 StaticTest.vm 後存檔的 Hack 組合語言原始碼，共 80 行。它是觀察 static 段符號命名的最佳樣本：檔案中出現的 `@StaticTest.1`、`@StaticTest.3`、`@StaticTest.8` 三個符號，依序被組譯器配置成 RAM[16]、RAM[17]、RAM[18] 的變數。

## 檔案總覽

| 對應 vm 指令 | .asm 行數 | 摘要 |
|--------------|-----------|------|
| push constant 111 / 333 / 888 | 第 3–26 行 | 標準 push constant 骨架 |
| pop static 8 | 第 27–32 行 | 堆疊頂 888 → StaticTest.8 |
| pop static 3 | 第 33–38 行 | 堆疊頂 333 → StaticTest.3 |
| pop static 1 | 第 39–44 行 | 堆疊頂 111 → StaticTest.1 |
| push static 3 | 第 45–52 行 | 333 入堆疊 |
| push static 1 | 第 53–60 行 | 111 入堆疊 |
| sub | 第 61–66 行 | 333 − 111 = 222 |
| push static 8 | 第 67–74 行 | 888 入堆疊 |
| add | 第 75–80 行 | 222 + 888 = 1110 |

## static 的 pop 樣板（第 27–32 行）

```asm
@SP
AM=M-1
D=M
@StaticTest.8
M=D
```

這六行是「pop 家族中最短的成員」（比 base+index 段的 12 行少一半）：因為 static 符號在組譯階段就決定了絕對位址，`A` 指令可以直接把 `StaticTest.8` 當目標，不需要先用 R13 計算位址。

注意符號名的來源：vm2asm.c 的 `write_pop` 輸出 `@%s.%d`，`%s` 是全域變數 `current_file`（該 .vm 檔去掉副檔名後的檔名）、`%d` 是 index。因此三個符號是 `StaticTest.8`、`StaticTest.3`、`StaticTest.1`——**順序與 index 無關，由組譯器依出現先後配置位址**。

## static 的 push 樣板（第 45–52 行）

```asm
@StaticTest.3
D=M
@SP
A=M
M=D
@SP
M=M+1
```

與 pop 對稱：直接讀符號所指記憶體、推入堆疊。

## 空間配置對照

組譯器（第 6 章）會把檔案中所有符號依「首次出現」順序配置：

| 符號 | RAM 位址 | 內容 |
|------|----------|------|
| StaticTest.8 | 16 | 888 |
| StaticTest.3 | 17 | 333 |
| StaticTest.1 | 18 | 111 |

**陷阱提醒**：`.8` 不一定在 RAM[24]、`.3` 不一定在 RAM[19]——Hack 組譯器配置符號是照出現順序，不是照 index。

## 執行結果

| 指令段 | 堆疊 / 記憶體 |
|--------|---------------|
| 三個 push constant | 堆疊 [111, 333, 888] |
| pop static 8 | RAM[16]=888 |
| pop static 3 | RAM[17]=333 |
| pop static 1 | RAM[18]=111 |
| push st3 / push st1 / sub | 堆疊 [222] |
| push st8 / add | 堆疊 [1110]，SP=257 |

最終 `RAM[256]=1110`，與官方 StaticTest.tst 斷言一致。

## 對照原始 .vm 的除錯技巧

- 一份 .asm 中「同一個 static 符號出現兩次」非常正常（一次 push、一次 pop），例如 `@StaticTest.3` 在 pop（第 37 行）與 push（第 46 行）各出現一次。
- 只要找到 `// pop static N` 或 `// push static N` 註解，其下的 `@StaticTest.N` 一定能互相呼應；若符號變成別的名字，就是在翻譯別的 .vm 檔（`current_file` 改變所致）。