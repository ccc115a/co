# SimpleAdd.vm 程式說明

這是最經典的 VM 入門範例：把常數 7 與 8 壓入堆疊後相加。
它來自 Nand2Tetris 專案第 7 章的 StackArithmetic 測試集，被原封不動地
複製到第 8 章資料夾裡，用來確認翻譯器在算術層面依然正確。

## 概述

- 目的：測試 `push constant` 與 `add` 兩個最基礎的 VM 指令。
- 完整內容（不含註解）：

```
push constant 7
push constant 8
add
```

- 對應 C 語言：`int x = 7 + 8;`

## 原理

VM 是堆疊機器。每次 `push constant` 都在「堆疊頂」放一個值並推進 `SP`；
`add` 取出頂端兩個值相加，把結果放回堆疊頂。執行結束時堆疊中只剩
`7 + 8 = 15`。

## 實作細節（VM → Hack 對照）

參考同目錄的 `SimpleAdd.asm` 輸出：

| VM 指令 | Hack 展開 | 註解 |
|---------|-----------|------|
| `push constant 7` | `@7 D=A @SP A=M M=D @SP M=M+1` | 立即值載入並壓棧 |
| `push constant 8` | `@8 D=A @SP A=M M=D @SP M=M+1` | 同上 |
| `add` | `@SP AM=M-1 D=M A=A-1 M=D+M` | 頂兩值相加 |

`push` 的關鍵是「先取堆疊指標所指的位置」，因為 `@SP` 後接 `A=M` 會把
`RAM[SP]` 當位址，再 `M=D` 寫入值後 `M=M+1` 推進指標。
`add` 則用 `AM=M-1` 一步完成「指標減一 + 指向新頂」，取出 y、指向 x、相加寫回
（注意 Hack 的 `M=D+M` 是「加法並儲存到 M」，方向不影響結果）。

## 測試與驗證

1. 執行 `./vm2asm SimpleAdd.asm SimpleAdd.vm` 產生輸出檔。
2. 用 VM Emulator 載入 `SimpleAdd.vm`，或以 CPU Emulator 執行產生的 `.asm`。
3. 檢查堆疊頂最後為 15，`SP` 回到 257。

## 延伸討論

SimpleAdd 雖短，卻是「Hello, World」等級的整合測試：它一次驗證了定址模式
（立即值、間接定址）與堆疊指標的遞增/遞減。所有第 7 章的測驗程式
（StackTest、BasicTest 等）都以相同的機制為基礎，理解它就能讀懂後續
所有輸出的 `.asm` 檔。