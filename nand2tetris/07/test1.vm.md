# test1.vm 程式說明

這是一個最小的 VM 測試檔，只有三條指令，用途是驗證 vm2asm.c 翻譯器的「算術 + push/pop」最基本路徑是否正確。

## 概述

- 內容：push 兩個常數，再相加。
- 對應章節：第 7 章 StackArithmetic 系列，等同 SimpleAdd 的迷你版。
- 用處：跑 `vm2asm test1.asm test1.vm` 後，可快速目測翻譯結果的每個欄位是否正確。

## 原始碼逐條解說

```vm
push constant 7
```

把常數 7 推進虛擬堆疊。`constant` 段沒有對應 RAM 位址，值是立即常數。翻譯後：

```asm
@7
D=A
@SP
A=M
M=D
@SP
M=M+1
```

`@7 D=A` 產生值 7；`@SP A=M` 讓 A 指向堆疊頂端（SP 所指的空位）；`M=D` 寫入；`@SP M=M+1` 讓 SP 上移。

```vm
push constant 8
```

同上，把 8 放上堆疊。此時堆疊為 `[7, 8]`，SP 指向 8 之上的空位。

```vm
add
```

二元加法：pop 出兩個運算元相加，結果留在堆疊頂端。翻譯後：

```asm
@SP
AM=M-1    // SP 減一，A 指向 8
D=M       // D = 8（y）
A=A-1     // A 指向 7（x）
M=D+M     // RAM[7 的位置] = 7 + 8 = 15
```

## 執行結果

| 指令 | 堆疊內容（執行前 → 後） |
|------|----------------------|
| push constant 7 | `[]` → `[7]` |
| push constant 8 | `[7]` → `[7, 8]` |
| add | `[7, 8]` → `[15]` |

最終堆疊頂端為 15。由於沒有 bootstrap、沒有 pop 到記憶體段，程式結束時 SP=257、RAM[256]=15。

## 測試重點

- 確認 `push constant` 的 5 條指令序列無誤。
- 確認 `add` 的 5 條指令序列（先 pop y、再就地加 x）無誤，且 SP 只減一次。
- 這是所有進階測試（StackTest、BasicTest 等）的基礎範例。