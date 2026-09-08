# fill2/screenclear.c 程式說明：清螢幕的偽 C 設計稿

`screenclear.c` 與 `fill2/screenclear.asm` 內容完全相同：它其實不是可以編譯的 C 程式，
而是一份「C + goto 虛擬碼」的設計稿，每一行後面附註它「打算翻成的組合語言」。
視覺化的目標：**先空轉等待鍵盤按下，一旦有按鍵就把整個畫面填成 -1（黑）**，然後結束。

由於 .c 與 .asm 兩檔內容一致，本說明重點放在「C 虛擬碼如何對照組合語言」，
以及「如何用 goto 表達 wait-迴圈與掃描迴圈」；實際組合語言翻譯請見
`screenclear.asm.md`。

## 概述

- 角色：以「可讀性優先」的偽 C 寫出演算法，作為組合語言實作的藍圖。
- 對照：本檔（.c）與 `screenclear.asm` 共用同一份內容；`.asm.md` 提供了把它變成
  合法 Hack 組合語言的翻譯結果。
- 兩層結構：外層 wait 迴圈（`WHILE1`）、內層掃描迴圈（`WHILE2`）。

```c
(WHILE1)
// while (1) {
  if (M[24576] == 0) goto WHILE1     // 沒按鍵 → 再等一圈
  int i = 16384;
(WHILE2)
  if (i >= 24576) goto EXIT          // 掃完 → 結束
  M[i] = -1;                         // 填黑
  i++;
  goto WHILE2
  goto WHILE1
(EXIT)
```

## 原理：兩個 while 的 goto 化

原始的高階構想如果用正統 C 寫是：

```c
while (1) {
  if (M[KBD] == 0) continue;   // 等鍵盤
  for (int i = SCREEN; i < KBD; i++)
    RAM[i] = -1;               // 填黑整片螢幕
  break;                       // 做完就結束
}
```

goto 化之後，兩個迴圈都有「進口 label」與「出口跳轉」：

### 外層：while(1) + 等待

```
WHILE1:          // (WHILE1)
  if (M[24576] == 0) goto WHILE1;   // 條件為真（沒按鍵）就繞回自己
  // 反之，鍵盤非零 → 往下執行填螢幕
```

C 的 `if (條件) goto WHILE1` 在前面放著，正是「直到按鍵出現」的輪詢。

### 內層：掃描 8192 格

```
WHILE2:
  if (i >= 24576) goto EXIT;   // 終止檢查放在頭
  M[i] = -1;                   // 對應 @i D=M A=D M=-1
  i++;                         // 對應 @i M=M+1
  goto WHILE2;                 // 對應 @WHILE2 0;JMP
EXIT:
```

### 行對照表

| 偽 C | 組合語言 |
|------|------|
| `if (M[24576] == 0) goto WHILE1` | `@24576 D=M`，`@WHILE1 D;JEQ` |
| `int i = 16384;` | `@16384 D=A @i M=D` |
| `if (i >= 24576) goto EXIT` | `@24576 D=A @i D=M-D @EXIT D;JGE` |
| `M[i] = -1;` | `@i D=M A=D M=-1` |
| `i++;` | `@i M=M+1` |
| `goto WHILE2 / goto WHILE1` | `@WHILE2 0;JMP`、`@WHILE1 0;JMP` |

## 實作細節

- **`M[24576]`（鍵盤）與 `M[i]`（螢幕）不可混在一起**：前者在 C 裡是「讀記憶體」，
  後者是「寫記憶體」。組合語言用 `D=M` 與 `M=...` 分開處理。
- **8192 格的來源**：i 從 16384（SCREEN）走到小於 24576（KBD 起點），正好 8192 格，
  一格格依序填 -1，也就覆蓋了整個 512×256 的畫面。
- **循環條件 `i >= 24576` 用 `D;JGE`**：組合語言 C-指令的跳轉條件有 JEQ/JNE/JGT/JGE/
  JLT/JLE/JMP 七種；「大於等於」對到 JGE，這裡是負數避免用 `>` 造成 off-by-one。
- 這份虛擬碼不是真正的 C：變數 `i`、`M[...]`、label 語法都是「半示意」，
  拿給 `cc` 編譯不會過，用意是當註解讀。

## 測試與驗證

- 以 `.asm.md` 提供的翻譯版本在 CPU Emulator 跑：靜止時 PC 卡在 `(WHILE1)`；
  按鍵後一輪掃完螢幕全黑、程式進入 `(EXIT)`。
- 檢查重點：RAM[16384..24575] 全部 = -1；`i` 在終止時 = 24576。

## 延伸討論

- `screenclear.md` 收了三種這類虛擬碼的變體（含「每格依鍵盤選色」的 `WHILE2` +
  `NEXT` 樣式），可對照 `fill2/Fill.asm` 看「選色 vs 直接填 -1」的差異。
- 把 `-1` 改成 `0` 就是真正的「清成白畫面」；這種「基址+偏移」的掃描迴圈在
  第 12 章 OS 中被封裝成 `Screen.clearScreen()`。