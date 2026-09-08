# StackTest.vm 程式說明

這是 Nand2Tetris 官方第 7 章 StackArithmetic 專案的測試檔，出處為 projects/7/StackArithmetic/StackTest。它測試 VM 翻譯器對**所有算術、邏輯與比較指令**的處理——依序測 `eq`、`lt`、`gt`、`add`、`sub`、`neg`、`and`、`or`、`not`，共 9 種指令、15 段測試。

## 概述

- 功能：對堆疊做一連串算術與邏輯運算。
- 測驗重點：
  1. 三個比較指令（eq/gt/lt）能否正確產生 -1（真）或 0（假）；
  2. 連續執行多次比較時，翻譯器產生的 label（`TRUE_N`/`END_N`）是否**互相不衝突**；
  3. 一元/二元算術指令的堆疊深度管理是否正確。
- 每段測試都遵循「push a、push b、比較」的三明治結構，方便判斷預期結果。

## 原始碼逐段解說

### 等於（eq）測試：3 組

```vm
push constant 17
push constant 17
eq
```

17 == 17 為真 → 結果 -1。

```vm
push constant 17
push constant 16
eq
```

為假 → 結果 0。注意 VM 的 eq 是「pop 出 y、與下方的 x 比」：x=17、y=16，17==16 為假。

```vm
push constant 16
push constant 17
eq
```

x=16、y=17，為假 → 0。這組用意是確認次序：顛倒之後相等性依然（16≠17）為假，值雖同為 0，但實作上是 `D=M-D` 判零，方向不影響。

翻譯後的 eq 大致長這樣（以第一組為例，label 編號隨 `label_count` 遞增）：

```asm
// eq
@SP
AM=M-1     // 指向 y（=17）
D=M
A=A-1      // 指向 x（=17）
D=M-D      // D = 17-17 = 0
@TRUE_0
D;JEQ
@SP
A=M-1
M=0        // 假：0
@END_0
0;JMP
(TRUE_0)
@SP
A=M-1
M=-1       // 真：-1
(END_0)
```

第二、三組的 label 變成 `TRUE_1/END_1`、`TRUE_2/END_2`，證明 `label_count` 遞增機制的作用。

### 小於（lt）測試：3 組

```vm
push constant 892
push constant 891
lt
```

x=892、y=891，892<891 為假 → 0。

```vm
push constant 891
push constant 892
lt
```

891<892 為真 → -1。

```vm
push constant 891
push constant 891
lt
```

相等，為假 → 0。

翻譯上 `lt` 與 eq 完全相同，只把 `D;JEQ` 換成 `D;JLT`。注意「先取 D=y、再算 x−y」，所以 `D=M-D` 為負表示 x<y，方向正確無需反轉。

### 大於（gt）測試：3 組

```vm
push constant 32767
push constant 32766
gt   → 真（-1）
push constant 32766
push constant 32767
gt   → 假（0）
push constant 32766
push constant 32766
gt   → 假（0）
```

這裡特別挑 32767（16 位元有號整數最大值）與 32766 這組**接近溢位邊界**的常數，驗證翻譯器在極值附近仍能正確做減法比較。gt 的跳轉條件是 `D;JGT`。

### 混合算術測試

```vm
push constant 57
push constant 31
push constant 53
add       // 31+53=84，堆疊：[57, 84]
push constant 112
sub       // 84-112=-28，堆疊：[57, -28]
neg       // 28，堆疊：[57, 28]
and       // 57 AND 28 = 24
push constant 82
or        // 24 OR 82 = 90
not       // NOT 90 = -91
```

逐步追蹤：

| 指令 | 堆疊變化 |
|------|----------|
| push 57, 31, 53 | `[57, 31, 53]` |
| add | `[57, 84]` |
| push 112 | `[57, 84, 112]` |
| sub | `[57, -28]`（84−112） |
| neg | `[57, 28]` |
| and | `[24]`（57 & 28 = 0b111001 & 0b011100 = 0b011000） |
| push 82 | `[24, 82]` |
| or | `[90]`（24 \| 82 = 0b0011000 \| 0b1010010 = 0b1011010） |
| not | `[-91]`（90 的 16 位元補數 = −91） |

翻譯後 add/sub/and/or 共用同一骨架，差別只在最後 `M=D+M` `M=M-D` `M=D&M` `M=D|M`；neg 是 `@SP A=M-1 M=-M`，not 是 `@SP A=M-1 M=!M`。

## 測試與驗證

官方 StackTest.tst 最後斷言 `RAM[0]==257` 且 `RAM[256]==-91`。也就是堆疊只剩下一個元素：-91。用本專案 vm2asm.c 產出的 StackTest.asm（本目錄）執行後應得到相同結果，間接驗證翻譯器等價於官方 VM Emulator。

## 延伸討論

- 每一組比較指令都佔一段獨立的「假→真」跳轉序列，若沒有唯一 label，翻譯器產出的程式會串到別組的 TRUE/END 段，結果變成不可預測。這是 `label_count` 存在的原因。
- `not`/`neg` 是唯一的一元指令，翻譯時 SP 不動、只改頂端值；而二元指令 SP 淨減 1。」
- 比較結果用「-1 代表 TRUE」是 VM 的固定決策（回傳 -1 而非 1），與第 12 章作業系統的布林處理一致。