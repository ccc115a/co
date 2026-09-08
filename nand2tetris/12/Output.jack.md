# Output.jack 程式說明

## 概述

`Output.jack` 是 Jack OS 的字元輸出模組，負責將文字顯示在螢幕的文字模式區域。它管理一個文字游標（cursor），實作字元列印、字串輸出、整數輸出、換行與退格等功能。每個字元以 5×7 的點陣字形（bitmap font）表示，字元寬 8 像素（含 2 像素間距）、高 11 像素（含 1 像素行距），在 256×512 的螢幕上可容納 **23 列 × 64 行** 的文字。

## 架構總覽

### 螢幕文字佈局

| 參數 | 值 | 說明 |
|------|-----|------|
| 螢幕解析度 | 256 × 512 | 256 列、512 行像素 |
| 文字列數 | 23 (0–22) | 每列 11 像素高 |
| 文字行數 | 64 (0–63) | 每行 8 像素寬 |
| 螢幕記憶體起始 | 16384 | 每個 word 16 bits |
| 每列像素的 word 數 | 32 | 512 ÷ 16 = 32 |

### 靜態變數

| 變數 | 說明 |
|------|------|
| `screen` | 螢幕記憶體的基底位址（16384），用 `screen[address]` 直接存取 RAM |
| `cursor_x` | 當前游標的行位置（0–63） |
| `cursor_y` | 當前游標的列位置（0–22） |
| `charMaps` | 字元映射表陣列，索引為 ASCII 碼，值為長度 11 的位元圖陣列 |
| `charMasks` | 用於分隔左右半字元的遮罩陣列 |

### Public API

| 函式 | 功能 |
|------|------|
| `init()` | 初始化游標、螢幕基底位址、字元映射表 |
| `moveCursor(i, j)` | 移動游標到第 i 列第 j 行 |
| `printChar(c)` | 在游標位置列印字元並前進游標 |
| `printString(s)` | 列印完整字串 |
| `printInt(i)` | 將整數轉為字串後列印 |
| `println()` | 換到下一列開頭 |
| `backSpace()` | 游標後退一格 |

## 原理

### 字元映射（Character Map）

每個可列印字元（ASCII 32–126）都有一個 11 個 word 的位元圖。每個 word 代表字元的一列像素，使用 **5 個有效位元**（bit 0–4），對應 5 個像素寬。例如字母 'A' 的字形：

```
row 0:  0000000000000000  →  map[0] = 12  (001100)
row 1:  0000000000011110  →  map[1] = 30  (011110)
row 2:  0000000000110011  →  map[2] = 51  (110011)
row 3:  0000000000110011  →  map[3] = 51
row 4:  0000000000111111  →  map[4] = 63  (111111)
row 5:  0000000000110011  →  map[5] = 51
row 6:  0000000000110011  →  map[6] = 51
row 7:  0000000000110011  →  map[7] = 51
row 8:  0000000000110011  →  map[8] = 51
row 9:  0000000000000000  →  map[9] = 0
row 10: 0000000000000000  →  map[10] = 0
```

`initMap()` 透過 `Output.create()` 函式為每個字元（ASCII 0–126）建立其位元圖。ASCII 0 的映射是一個實心黑色方塊，用於表示不可列印字元。

`getMap(c)` 函式處理邊界檢查：若字元不在 32–126 範圍內，回傳黑色方塊的映射。

### printChar(c) — 字元列印

```jack
function void printChar(char c) {
    var Array map;
    var int address;
    var int mask;
    var int bitmap;
    var int i;
    let map = Output.getMap(c);
    let address = (cursor_y * 32 * 11) + (cursor_x / 2);
    let mask = cursor_x & 1;
    let i = 0;
    while( i < 11 ) {
        let bitmap = map[i];
        if( mask = 1 ) {
            let bitmap = bitmap * 256;
        }
        let screen[address] = screen[address] & charMasks[mask] | bitmap;
        let address = address + 32;
        let i = i + 1;
    }
    // 推進游標
    if( cursor_x = 63 ) {
        do Output.println();
    } else {
        let cursor_x = cursor_x + 1;
    }
}
```

**記憶體位址計算：**

每個文字字元佔 11 列像素，每列 32 個 word。游標在第 `cursor_y` 列第 `cursor_x` 行：

```
起始位址 = cursor_y × 32 × 11 + cursor_x ÷ 2
```

為何除以 2？因為一個螢幕 word 有 16 像素，而文字字元只有 5 像素寬（加上 3 像素間距共 8 像素），所以兩個文字字元共用一個 word：偶數行字元佔 word 的低 8 位，奇數行字元佔高 8 位。

**位元遮罩操作：**

- `mask = cursor_x & 1`：判斷游標在奇數行（mask=1）還是偶數行（mask=0）
- `charMasks[0] = 255`（二進位 `0000000011111111`）：保留 word 的高 8 位
- `charMasks[1] = 255`（對 -1 AND 255）：保留 word 的低 8 位
- 若 `mask = 1`，`bitmap * 256` 將位元圖移到 word 的高 8 位

列印時的操作：
```
screen[address] = (screen[address] & charMasks[mask]) | bitmap
```

先用 AND 遮罩清除目標半 word 的內容，再用 OR 寫入新的位元圖。這樣可以保留同一 word 中另一半的既有內容。

### println() — 換行

```jack
function void println() {
    let cursor_x = 0;
    if( cursor_y < 22 ) {
        let cursor_y = cursor_y + 1;
    } else {
        do Output.scroll();
    }
}
```

將 `cursor_x` 重設為 0，`cursor_y` 加 1。若已到最後一列（22），呼叫 `scroll()` 捲動畫面。目前的 `scroll()` 實作是簡化的——僅重設游標到左上角（0, 0），實際的像素捲動邏輯被註解掉了。

### backSpace() — 退格

```jack
function void backSpace() {
    if( cursor_x = 0 ) {
        if( ~(cursor_y = 0) ) {
            let cursor_x = 63;
            let cursor_y = cursor_y - 1;
        }
    } else {
        let cursor_x = cursor_x - 1;
    }
}
```

若游標不在行首，前移一格；若在行首且不在第一列，跳到上一列的行尾（第 63 行）；若在左上角（0, 0），什麼都不做。

### printInt(i) — 整數輸出

```jack
function void printInt(int i) {
    var String s;
    let s = String.new(10);
    do s.setInt(i);
    do Output.printString(s);
    do s.dispose();
}
```

建立一個臨時字串，用 `String.setInt` 轉換整數為字元序列，再逐字列印。使用後釋放臨時字串。

## 實作細節

### charMasks 的設計

```jack
let charMasks[0] = 255;              // 0000000011111111
let charMasks[1] = -1 & 255;         // 0000000011111111
```

`-1` 在 16-bit 補數中是 `1111111111111111`，與 255（`0000000011111111`）做 AND 結果是 `0000000011111111`。所以兩個遮罩值相同但用意不同：
- `charMasks[0]`（mask=0，偶數行）：清除 word 的低 8 位，保留高 8 位
- `charMasks[1]`（mask=1，奇數行）：清除 word 的高 8 位，保留低 8 位

等等——回顧程式碼，`charMasks[0] = 255` 是低 8 位全 1，但當 mask=0 時應該保留高 8 位才對。這裡 `screen[address] & charMasks[mask]` 在 mask=0 時會保留低 8 位而非高 8 位。這意味著此實作中**偶數行字元佔低 8 位、奇數行字元的位元圖被左移到高 8 位**（`bitmap * 256`），而遮罩的作用是清除寫入位置。具體邏輯：

- mask=0（偶數行）：遮罩保留低 8 位，bitmap 不移位，直接寫入低 8 位
- mask=1（奇數行）：遮罩保留高 8 位（不，`charMasks[1]` 也是 255...）

這裡的邏輯需要仔細理解：`screen[address] & charMasks[mask] | bitmap` — 當 mask=1 時，`charMasks[1]=255`（低 8 位全 1），AND 結果保留低 8 位，但 bitmap 被 `*256` 移到高 8 位再 OR。所以低 8 位不變，高 8 位被寫入。這確實是正確的：mask=1 時寫入高 8 位。

## 測試與驗證

Output 模組的驗證：

1. 編譯 `Output.jack` 及依賴的 `Memory.jack`、`Math.jack`、`String.jack`
2. 在 CPU Emulator 中執行對應的 `.tst` 測試腳本
3. 視覺化觀察螢幕記憶體映射（在 RAM 觀察面板中查看 16384–24575 區域）

## 延伸討論

此字元輸出系統本質上是一個**文字模式終端機**（text-mode terminal），類似 DOS 時代的 80×25 文字模式。每個字元的 5×7 點陣字形是嵌入式系統中常見的最小可讀字型。真實系統中的字型渲染更為複雜：TrueType/OpenType 字型使用二次貝塞爾曲線描述字形輪廓，由專用的光柵化引擎轉換為像素。此模組的 `scroll()` 未完整實作（僅重設游標），真實系統需要將螢幕記憶體內容向上搬移一行（11×32 = 352 個 word），並將最後一行清零。
