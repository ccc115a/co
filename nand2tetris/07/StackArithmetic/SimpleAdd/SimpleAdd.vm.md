# SimpleAdd.vm 程式說明

這是 Nand2Tetris 官方第 7 章教材的招牌範例，出處為 Nisan 與 Schocken《The Elements of Computing Systems》projects/7/StackArithmetic/SimpleAdd。它的目標只有一個：**證明「push 兩個常數再相加」這件在 VM 世界裡的微小事，翻譯成 Hack 組合語言後也是一段你能親眼追完的完整程式**。

## 概述

- 功能：把常數 7 與 8 推到堆疊上，再用 `add` 相加。
- 測驗重點：`push constant` 的翻譯、`add` 的翻譯、以及「SP 指標在 push/運算中的正確增減」。
- 沒有涉及任何記憶體段、沒有函式呼叫、沒有 bootstrap，是翻譯器最乾淨的測試案例。

## 原始碼逐條解說

```vm
push constant 7
push constant 8
add
```

前面四行是被翻譯器跳過的註解（`//` 開頭，說明這是官方教材檔案、檔名路徑為何）。

逐條翻譯成 Hack 組合語言後如下：

```asm
// push constant 7
@7
D=A
@SP
A=M
M=D
@SP
M=M+1

// push constant 8
@8
D=A
@SP
A=M
M=D
@SP
M=M+1

// add
@SP
AM=M-1
D=M
A=A-1
M=D+M
```

### push constant 的翻譯邏輯

`push constant N` 對應「值取 N → 放進堆疊頂端 → SP 上移」：

```asm
@N
D=A      // D = N
@SP
A=M      // A = 堆疊空位
M=D      // 寫入
@SP
M=M+1    // SP++
```

`constant` 段是唯一沒有 RAM 對應的段——它的「位址」就是常數本身，因此用 `D=A`（把立即值當資料載入）而非 `D=M`（從記憶體讀）。

### add 的翻譯邏輯

`add` 是二元運算：堆疊頂端是 y、其下是 x，結果要覆蓋 x 的位置、SP 縮減 1。

```asm
@SP
AM=M-1   // SP--，A 指向 y
D=M      // D = y
A=A-1    // A 指向 x
M=D+M    // x = x + y
```

## 執行流程

1. `push constant 7` 後：SP=257，RAM[256]=7。
2. `push constant 8` 後：SP=258，RAM[257]=8。
3. `add`：取 D=8（y）、7（x），RAM[256] 變成 15，SP 回到 257。

## 測試與驗證

官方配套的 SimpleAdd.tst 用 VM Emulator 載入 SimpleAdd.asm，檢查 `RAM[0]==257` 且 `RAM[256]==15`。也可以直接用 CPU Emulator 跑翻譯產生的 .asm 檔（本目錄的 SimpleAdd.asm）觀察相同結果。

## 延伸討論

- 這是所有 VM 程式的最小公約數：任何程式最終都會拆成「push → 運算 → pop 回記憶體」的組合。
- 記憶體堆疊生長方向向上（位址遞增），與某些真實機器的「堆疊向下生長」相反，但原理一致。
- 若改用 jack 編譯器的輸出，`push constant 7` 這類指令背後的來源可能是 `x = 7;` 這類高階語句。