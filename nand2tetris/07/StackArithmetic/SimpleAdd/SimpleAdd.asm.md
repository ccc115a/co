# SimpleAdd.asm 程式說明

這是以 vm2asm.c 把 SimpleAdd.vm 翻譯後存檔的 Hack 組合語言原始碼，是官方第 7 章範例 SimpleAdd「翻譯之後的面貌」。檔案共 24 行，扣除首行空白與分隔線（第 1–2 行）與 `//` 註解行，實際可執行指令 15 條，正好是「push×2（各 5 條）+ add（5 條）」。

## 檔案結構

```asm
（空白行）
// ========== File: StackArithmetic/SimpleAdd/SimpleAdd.vm ==========
```

第一段是 vm2asm.c 在 `translate_file` 函式裡輸出的檔名分隔註解。因為只翻譯單一檔案、參數個數不足，所以**沒有** bootstrap 開機碼（不會初始化 SP、也不會呼叫 Sys.init）。

接著是三段翻譯結果，每段開頭都有 `// push constant 7`、`// push constant 8`、`// add` 這類「原始 VM 指令」註解行，是翻譯器刻意保留的對照線索。

## 逐段解讀

### push constant 7（第 3–10 行，可執行 5 條）

```asm
// push constant 7
@7
D=A
@SP
A=M
M=D
@SP
M=M+1
```

- `@7 D=A`：把立即值 7 放進 D。
- `@SP A=M`：A 指向 SP 所指的堆疊空位（執行前 SP=256，即位址 256）。
- `M=D`：RAM[256] = 7。
- `@SP M=M+1`：SP=257。

### push constant 8（第 11–18 行）

同樣 5 條。RAM[257]=8、SP=258。

### add（第 19–24 行）

```asm
// add
@SP
AM=M-1   // SP=257，A=257：指向 8
D=M      // D=8
A=A-1    // A=256：指向 7
M=D+M    // RAM[256] = 7+8 = 15
```

`AM=M-1` 是 Hack 語法的組合用法：同一個指令裡 A 暫存器與 M 都更新。執行完 RAM[256]=15、SP=257。

## 與原始 .vm 的對應

| SimpleAdd.vm | SimpleAdd.asm | 效果 |
|--------------|---------------|------|
| push constant 7 | 第 3–10 行 | RAM[256]=7, SP=257 |
| push constant 8 | 第 11–18 行 | RAM[257]=8, SP=258 |
| add | 第 19–24 行 | RAM[256]=15, SP=257 |

## 測試與驗證

用 CPU Emulator 開啟 SimpleAdd.asm 後執行（或按單步逐步執行）：

- 執行完 `RAM[0]`（SP）應為 257。
- `RAM[256]` 應為 15。
- 這正好符合官方 SimpleAdd.tst 對 VM Emulator 的斷言，驗證了「翻譯器輸出 → 組語模擬」與「VM 直譯」兩條路徑等價。

## 延伸討論

- 這份 .asm 沒有任何 `(label)` 或跳轉指令，是「直線型」程式；本目錄其他的 StackTest.asm/ BasicTest.asm 才會出現比較指令的 label 與跳轉。
- 若拿給第 6 章的組合器組譯，只有 `@SP`、`@7` 這類符號，會由符號表決議：`SP`＝RAM[0]、`7` 就是數字 7（A 指令立即值）。這個「符號即位址」的層次交錯，正是 Hack 平台精簡設計的一部分。