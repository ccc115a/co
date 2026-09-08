# BasicTest.asm 程式說明

這是以 vm2asm.c 翻譯 BasicTest.vm 後存檔的 Hack 組合語言原始碼，共 235 行。它完整示範了 five 種記憶體段的 pop/push 骨架長相：local、argument 共用「base+index」寫法，this/that 與其全同，只有 temp 段是直接位址。

## 檔案總覽

| 對應 vm 指令 | .asm 行數 | 結構 |
|--------------|-----------|------|
| push constant | 每段 8 行 | N → D → RAM[SP] → SP++（5 條） |
| pop local/argument/this/that | 每段 12 行 | 算位址存 R13 → 取堆疊值 → 寫回 |
| pop temp | 每段 6 行 | 取堆疊值 → 寫 RAM[5+i] |
| push local/that/argument/this/temp | 每段 10 行 | base+index 讀值入堆疊 |
| add/sub | 每段 6 行 | pop 骨架 |

行數規律很有用：**pop local/argument/this/that 都是 12 行、pop temp 只有 6 行、push base+index 是 10 行、push temp 也是 10 行（因為同樣是 `@11 D=M ...` 的讀值入堆疊）**。

## pop 的翻譯樣板

以 `pop argument 2`（第 40–52 行）為例：

```asm
@2
D=A
@ARG
D=D+M       // D = ARG + 2（目標位址）
@R13
M=D         // R13 = 目標位址
@SP
AM=M-1      // 取堆疊頂端
D=M         // D = 堆疊值
@R13
A=M         // A = 目標位址
M=D         // RAM[ARG+2] = D
```

**為什麼不用 `@ARG A=D+M` 直接定址？** 因為 pop 是把「堆疊頂端」搬到運算元位址：算出位址後還要把堆疊頂端讀進 D，此時 A 暫存器會先被 `@SP/AM=M-1` 覆蓋。所以翻譯器先把「運算元位址」存在 R13，之後再取回。這是 pop 與 push 骨架不對稱的根源。

對照 `pop temp 6`（第 137–142 行）：

```asm
@SP
AM=M-1
D=M
@11
M=D
```

temp 段位址是「硬編碼的常數位址」，`@11` 本身就可直接寫，不需要先算位址，因此短一半。

## push 的翻譯樣板

以 `push that 5`（第 154–164 行）為例：

```asm
@5
D=A
@THAT
A=D+M       // A = THAT + 5
D=M         // 讀值
@SP
A=M
M=D         // 寫入堆疊頂端
@SP
M=M+1
```

與 pop 相反：push 是「把基底段的位址算出來直接當 A 用、立刻讀值」，A 沒有被中斷，不需要 R13。

而 `push temp 6`（第 222–229 行）：

```asm
@11
D=M
@SP
A=M
M=D
@SP
M=M+1
```

基底 5＋index 6＝11 直接寫死在 A 指令裡。

## 執行結果（配合 BaseTest 前置設定）

假設 TestScript 先設定 `LCL=RAM[300]`、`ARG=RAM[400]`、`THIS=RAM[3000]`、`THAT=RAM[3010]`，執行到最後：

| 記憶體位置 | 最終值 |
|------------|--------|
| RAM[300]（LCL+0） | 10 |
| RAM[400+2]=402 | 22 |
| RAM[400+1]=401 | 21 |
| RAM[3000+6]=3006 | 36 |
| RAM[3010+5]=3015 | 45 |
| RAM[3010+2]=3012 | 42 |
| RAM[11] | 510 |
| RAM[256]（堆疊） | 472 |
| RAM[0]（SP） | 257 |

堆疊最後的值 472 來自 `(10+45−21) − (36+36) + 510`，官方 BasicTest.tst/CMP 檔對應斷言相同結果。

## 對照原始 .vm 的除錯技巧

- 找到 `// pop xxx` 註解：其下方若看到 `@R13` 就是 base+index 段；若直接看到 `@11` 則為 temp。
- 找到 `// push xxx` 註解：`@LCL A=D+M` 之類是間接定址；`@11 D=M` 是直接定址。
- 所有 `//` 註解都來自 vm2asm.c 的 `fprintf(out, "// %s\n", trimmed)`，逐行狀態完全對應 BasicTest.vm。