# fill/Fill.asm 程式說明：螢幕填色（依鍵盤輸入全黑或全白）

`Fill.asm` 是 Nand2Tetris 第 4 章兩個正式作業之一。它跑一個無窮迴圈：重複檢查鍵盤，
若偵測到「有任何鍵被按下」就把整個螢幕塗成黑色（每個像素 1），否則塗成白色（每個
像素 0）。這是第一支真正動到「記憶體映射的輸出入裝置」的組合語言程式——螢幕與鍵盤
在 Hack 中只是 RAM 的兩個特定位址區段。

## 概述

- 地位：第四章輸出入作業（`projects/04/fill/Fill.asm`）。
- 行為：`forever { 若按鍵 → 全黑；否則 → 全白 }`，每一次都從螢幕第一格一直到第 8191 格。
- 涉及的第 4 章新主題：`@SCREEN` / `@KBD` 符號位址、記憶體映射 I/O、`RAM[arr+i]`
  間接定址、雙層迴圈（`FOREVER` 包著 `LOOP`）。
- 對應的 C 語言（檔案內註解的高階版）：

```c
forever:
  arr = SCREEN;     // 螢幕記憶體起點 16384
  n = 8192;         // 螢幕總共 8192 個 word
  i = 0;
  while (i < n) {
    if (*KBD != 0) arr[i] = -1;   // 有按鍵 → 黑
    else           arr[i] = 0;    // 無按鍵 → 白
    i = i + 1;
  }
goto forever;
```

## 架構總覽：記憶體映射與變數位址

### Hack 的螢幕與鍵盤

- **SCREEN = 16384**：螢幕由 512×256 = 131072 個像素組成，每個 word（16-bit）管一列
  的 16 個像素。256 列 × 32 word = **8192 個 word**，佔 RAM[16384]~RAM[24575]。
  `RAM[SCREEN]` 的 bit j 對應第一列第 j 個像素；此程式不管個別 bit，一口氣把整個 word
  填 `-1`（全 1，黑）或 `0`（白）。
- **KBD = 24576**：鍵盤映射位址。`RAM[KBD] == 0` 表示沒有按鍵；否則存的是按下那顆鍵
  的掃描碼（非零即可判斷「有按鍵」）。

### 符號與位址配置

| 符號 | 位址 | 角色 |
|------|------|------|
| `SCREEN` | 16384 | 預定義，螢幕記憶體起點 |
| `KBD` | 24576 | 預定義，鍵盤記憶體 |
| `arr` | **RAM[16]** | 指向目前的螢幕 word（從 16384 遞增） |
| `n` | **RAM[17]** | 8192，終止計數 |
| `i` | **RAM[18]** | 迴圈計數器 0..8191 |
| `(FOREVER)` / `(LOOP)` / `(ELSE)` / `(ENDIF)` / `(ENDLOOP)` | 程式位址 | 控制標籤 |

## 原理：為什麼要填 -1 而不是 1

16 位元中黑色＝「所有像素都是 1」＝ `1111111111111111`。十進位 `-1` 就是這串全 1
（二補數），所以 `RAM[i] = -1` 就能把 16 個像素一次全部點黑；填 `0` 則全滅。**把
「-1」想成位元串而不是「負一」**，是解讀這支程式的關鍵。

### 間接定址 `RAM[arr+i]`

Hack 沒有 `RAM[A+M]` 這種「雙記憶體讀取」指令，卻有 `A=D+M`：
把 ALU 算出的 `D+M`（當下 D=arr、M=RAM[位址 i 的內容]=i）直接寫進 A 暫存器。
接下來 `M=-1` 寫入的就是 `RAM[arr+i]`。所以「陣列 off by 一格」的動作拆成
`@arr D=M`、`@i A=D+M`、`M=-1` 三行，付出一格 A 暫存器當「指標」。

## 實作細節：逐段解說

### 外層迴圈 FOREVER：每回合重新設定參數

```
(FOREVER)
  @SCREEN
  D=A        // D = 16384（注意：是「位址值」，不是 RAM[16384] 的內容）
  @arr
  M=D        // arr = &SCREEN
  @8192
  D=A        // D = 8192
  @n
  M=D        // n = 8192
  @i
  M=0        // i = 0
```

**`D=A` 與 `D=M` 的差別**在本段一覽無遺：`@SCREEN D=A` 取「A 暫存器裝的值 16384」，
`@KBD D=M`（後段）取「RAM[24576] 的內容」。前者要位址、後者要內容。

### 內層迴圈 LOOP：檢查終止條件

```
(LOOP)
  @i
  D=M        // D = i
  @n
  D=D-M      // D = i - n
  @ENDLOOP
  D; JEQ     // if (i == n) 離開內層迴圈
```

### if / else：按鍵決定顏色

```
  @KBD
  D=M        // D = *KBD（讀鍵盤）
  @ELSE
  D; JEQ     // if (*KBD == 0) goto ELSE（沒按鍵 → 填白）
  @arr
  D=M        // D = arr
  @i
  A=D+M      // A = arr + i  ← 間接定址
  M=-1       // RAM[arr+i] = -1 → 全黑
  @ENDIF
  0; JMP
(ELSE)
  @arr
  D=M
  @i
  A=D+M      // A = arr + i
  M=0        // RAM[arr+i] = 0 → 全白
(ENDIF)
```

if/else 的組合語言樣式：條件跳過 then（`D;JEQ` 跳到 `ELSE`），then 尾部以
`0;JMP` 繞過 else。這是 `c2asm.md` 中「IF ELSE 改寫為 goto」的直接套用。

### i++ 與迴圈回跳

```
  @i
  M=M+1      // i++
  @LOOP
  0; JMP     // 回內層
(ENDLOOP)
  @FOREVER
  0; JMP     // 外層無窮迴圈：從頭再掃一次
```

## 測試與驗證

`fill/Fill.tst` 教你在 CPU Emulator 上手動驗證：

```
load Fill.hack;
echo "First, make sure 'No Animation' is selected. Then, select the Keyboard, click on any key, and check the screen.";
repeat { ticktock; }
```

重點：先關掉動畫（No Animation），把游標移到 Keyboard 視窗，**按著任一鍵**（如空白鍵）
看螢幕是否全黑；**放開**看是否全白。注意程式是「整輪掃完才再讀鍵盤」，若按放得很快，
一個 FOREVER 週期內可能整輪都是同一顏色。

## 延伸討論

- 本程式在「每一格」都重新讀鍵盤（8192 次/輪）。較佳寫法可把按鍵狀態讀一次放進變數，
  一輪只用一次（`fill2/Fill.asm` 也是每格讀鍵盤，可見教材並未優化此處）。
- `8192 word` 這個數字本身就暗示了螢幕電路：Chapter 3 的 `Screen.hdl` 就是一個
  「可寫 RAM，位址 16384..24575」，把 `@SCREEN` 加上偏移即可逐一寫入。
- 若把 `M=-1` 換成任意的 16 位元值，此程式就變成「整畫面填某種花樣」；第 12 章
  OS 的 clearScreen 也是類似迴圈——這支小程式是之後所有圖形程式的地基。