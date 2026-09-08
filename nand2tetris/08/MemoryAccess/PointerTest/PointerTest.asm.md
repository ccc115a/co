# PointerTest.asm 程式說明

這是 `PointerTest.vm` 的 Hack 組合語言翻譯輸出，共 128 行。它的教學重點
在 `push/pop pointer` 的翻譯：直接操作 `THIS`/`THAT` 暫存器，完全不需要
「算位址 + R13」模板。

## 概述

- 來源：`PointerTest.vm`（見該檔說明）。
- 流程：設定 THIS=3030、THAT=3040 → 寫 this[2]、that[6] → 累加得到 6084。

## 架構總覽

| 行號 | VM 指令 | Hack 動作 |
|------|---------|-----------|
| 3–16 | `push constant 3030` | 壓入 3030 |
| 12–16 | `pop pointer 0` | `@SP / AM=M-1 / D=M / @THIS / M=D` |
| 17–30 | `push constant 3040 / pop pointer 1` | 寫入 THAT |
| 31–72 | `pop this 2`、`pop that 6` | 基底間接寫入 |
| 73–128 | 計算主體 | push pointer + add/sub |

## 原理

`pop pointer 0` 翻譯成直接把 `THIS` 暫存器（RAM 3）覆寫：

```
@SP
AM=M-1   // SP 減一、指向堆疊頂
D=M      // 取出值
@THIS
M=D      // THIS = 值
```

`pop pointer 1` 則把 `M=D` 換成 `@THAT`。因為 `pointer` 只有兩個可能值，
翻譯器在 `write_pop` 中直接用 `index==0 ? "THIS" : "THAT"` 選字串（C 程式的
`const char* ptr = (index == 0) ? "THIS" : "THAT"`），省去條件展開。

`push pointer 0` 是反向：

```
@THIS
D=M      // 讀暫存器
@SP
A=M
M=D
@SP
M=M+1
```

## 實作細節（代表性片段）

### pop pointer 0 / 1（第 11–16、25–30 行）

```
// pop pointer 0
@SP
AM=M-1
D=M
@THIS
M=D
```

### pop this 2（第 39–51 行）

與 BasicTest 的模板相同，基底換成 `@THIS`：

```
@2
D=A
@THIS
D=D+M
@R13
M=D        // 目標 = THIS + 2
@SP
AM=M-1
D=M
@R13
A=M
M=D
```

### push that 6（第 112–122 行）

```
@6
D=A
@THAT
A=D+M
D=M        // 讀 RAM[THAT+6] = 46
@SP
A=M
M=D
@SP
M=M+1
```

### 計算收尾（第 89–127 行）

`add`、`sub`、`add` 依序把 3030+3040−32+46 算成 6084。

## 測試與驗證

- CPU Emulator 載入執行；結束時可檢查 RAM[3]（THIS）=3030、RAM[4]（THAT）=3040、
  RAM[3032]=32、RAM[3046]=46、RAM[256]=6084。
- 對照 `PointerTest.cmp`。

## 延伸討論

對比 BasicTest 能明確看出 pointer 的位置：它操作的是「基底指標」本身而非
「基底所指的資料」，因此翻譯結果短得多，也毋需 R13。學會分辨
`@THIS 後接 M=D`（寫基底）與 `@THIS 後接 A=D+M`（間接定址資料）的差異，
就掌握了整個第 7 章記憶體段的精髓。