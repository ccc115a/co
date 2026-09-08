# PointerTest.asm 程式說明

這是以 vm2asm.c 翻譯 PointerTest.vm 後存檔的 Hack 組合語言原始碼，共 128 行。它示範 pointer 段的 push/pop 翻譯（短到只有 6 條指令）以及 this/that 段如何被「重新指派的基底」影響。整份檔案的亮點是：**THIS 與 THAT 不是文字，而是會被程式內容改寫的 RAM 位址**。

## 檔案總覽

| 對應 vm 指令 | .asm 行數 | 指令數 |
|--------------|-----------|--------|
| push constant | 每段 8 行 | 5 |
| pop pointer 0 / 1 | 第 11–16 / 25–30 行 | 6 |
| pop this 2 / pop that 6 | 每段 12 行 | 11 |
| push pointer 0 / 1 | 每段 10 行 | 7 |
| push this 2 / push that 6 | 每段 10 行 | 7 |
| add / sub / add | 每段 6 行 | 5 |

## pointer 段翻譯

### pop pointer 0（第 11–16 行）

```asm
@SP
AM=M-1
D=M
@THIS
M=D
```

`pop pointer 0` 把堆疊頂端直接寫入 THIS（RAM[3]）。它不需要算位址——pointer 的「位址」就是暫存器本身。

### pop pointer 1（第 25–30 行）

同上，目標改成 `@THAT`。**這是翻譯器中唯一「因 index 而改變目標符號」的段**：vm2asm.c 用 `(index == 0) ? "THIS" : "THAT"` 選擇。

### push pointer 0（第 73–82 行）

```asm
@THIS
D=M
@SP
A=M
M=D
@SP
M=M+1
```

`push pointer 0`＝把 THIS 的**內容**（不是 THIS 的位址）當值推入堆疊，是標準讀值骨架，只是來源變成 `@THIS`。

## this/that 段的「動態基底」

`pop this 2`（第 39–51 行）沿用先前 BasicTest 看過的 R13 樣板：

```asm
@2
D=A
@THIS
D=D+M       // 目標位址 = THIS + 2
@R13
M=D
@SP
AM=M-1
D=M
@R13
A=M
M=D
```

關鍵在於：**THIS 在前面已被設成 3030**，所以這次 `pop this 2` 真正寫入的是 RAM[3032]。同樣，`pop that 6` 在 THAT=3040 的前提下寫入 RAM[3046]（第 60–72 行）。

而 `push this 2`（第 95–105 行）則反過來——`A=D+M` 算出 THIS+2、`D=M` 讀出 RAM[3032]。

| 指令 | 定址 |
|------|------|
| THIS | R3 = 3030 |
| THAT | R4 = 3040 |
| this 2 | RAM[3030+2] = RAM[3032] |
| that 6 | RAM[3040+6] = RAM[3046] |

## 執行結果追蹤

| 指令 | 相關記憶體 |
|------|-----------|
| push 3030 / pop pointer 0 | R3 = 3030 |
| push 3040 / pop pointer 1 | R4 = 3040 |
| push 32 / pop this 2 | RAM[3032] = 32 |
| push 46 / pop that 6 | RAM[3046] = 46 |
| push pointer 0 | 推入 3030 |
| push pointer 1 | 推入 3040 |
| add | 6070 |
| push this 2 | 推入 32 |
| sub | 6070 − 32 = 6038 |
| push that 6 | 推入 46 |
| add | 6038 + 46 = 6084 |

最終 `SP=257`、`RAM[256]=6084`，與官方 PointerTest.tst 斷言一致。

## 對照原始 .vm 的除錯技巧

- 出現 `@THIS` 或 `@THAT` 且前方有 `@SP AM=M-1` 的是 pop pointer；出現 `@THIS` 後接 `D=M` 的是 push pointer。
- 出現 `@2 D=A ... @THIS D=D+M` 的是以 THIS 為基底的 this 段——注意五行中 `THIS` 角色的轉換：先當「段基底」參與加法，再當「被指派的值」被堆疊取代。