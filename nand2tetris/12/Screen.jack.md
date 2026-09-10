# Screen.jack 程式說明

## 概述

`Screen.jack` 是 Jack OS 的圖形繪製模組，提供像素級的螢幕存取能力。它實作畫點（drawPixel）、畫線（drawLine）、畫矩形（drawRectangle）與畫圓（drawCircle）等繪圖操作，是 Pong 等圖形化程式的基礎。所有繪圖操作直接讀寫從位址 16384 開始的螢幕記憶體映射區（8192 個 word），透過位元運算精確控制每一個像素。

## 架構總覽

### 螢幕硬體規格

| 參數 | 值 |
|------|-----|
| 解析度 | 256 列 × 512 行 |
| 螢幕記憶體起始位址 | 16384 |
| 螢幕記憶體大小 | 8192 個 word（16384–24575） |
| 每列的 word 數 | 32（512 像素 ÷ 16 bits/word） |
| 計算公式 | 像素 (x, y) → word 位址 = y×32 + x÷16 |

### 靜態變數

| 變數 | 說明 |
|------|------|
| `screen` | 螢幕記憶體基底（16384），`screen[addr]` 直接存取 RAM |
| `cur_colour` | 當前繪圖顏色（true=黑、false=白） |
| `black` / `white` | 顏色常數（true/false） |
| `black_pixel` / `white_pixel` | 單像素的值（1/0） |

### Public API

| 函式 | 功能 |
|------|------|
| `init()` | 初始化螢幕基底位址與繪圖顏色 |
| `clearScreen()` | 清除整張螢幕（全部填白） |
| `setColor(b)` | 設定繪圖顏色 |
| `drawPixel(x, y)` | 畫單一像素 |
| `drawLine(x1, y1, x2, y2)` | 畫直線 |
| `drawRectangle(x1, y1, x2, y2)` | 畫實心矩形 |
| `drawCircle(cx, cy, r)` | 畫實心圓 |

## 原理

### 螢幕記憶體映射

Hack 的螢幕記憶體從位址 16384 開始，佔 8192 個 word。每個 word 對應 16 個水平像素，bit 0 是最右邊的像素。像素 (x, y) 對應的記憶體位址與位元位置：

```
address = 16384 + y × 32 + x ÷ 16     （整數除法）
bit位置 = x mod 16
```

例如像素 (100, 50)：
```
address = 16384 + 50 × 32 + 100 ÷ 16 = 16384 + 1600 + 6 = 17990
bit = 100 mod 16 = 4
```

### drawPixel(x, y) — 位元遮罩操作

```jack
function void drawPixel(int x, int y) {
    var int address;
    var int mask;
    let address = (y * 32) + (x / 16);
    let mask = Math.two_to_the(x & 15);
    if( cur_colour ) {
        let screen[address] = screen[address] | mask;      // 畫黑：OR 設位元
    } else {
        let screen[address] = screen[address] & ~mask;     // 畫白：AND 清位元
    }
}
```

**位元遮罩（bitmask）原理：**

`x & 15` 取得 x 除以 16 的餘數（即在 word 中的 bit 位置，0–15）。`Math.two_to_the(x & 15)` 產生對應的遮罩值：第 n 位為 1，其餘為 0。

- **畫黑像素：** `screen[addr] | mask` — 用 OR 將目標位元設為 1，不影響其他位元
- **畫白像素：** `screen[addr] & ~mask` — 用 AND 將目標位元清為 0，不影響其他位元

這是記憶體映射 I/O 中最基本的位元操作模式，廣泛用於嵌入式系統和作業系統的 framebuffer 驅動中。

### drawLine(x1, y1, x2, y2) — Bresenham 直線演算法

```jack
function void drawLine(int x1, int y1, int x2, int y2) {
    // 確保 x1 ≤ x2
    if( x1 > x2 ) { 交換 x1/y1 與 x2/y2 }
    let dx = x2 - x1;
    let dy = y2 - y1;
    if( dx = 0 ) → drawVerticalLine
    else if( dy = 0 ) → drawHorizontalLine
    else → drawDiagonalLine
}
```

首先統一處理方向（確保 `x1 ≤ x2`），再根據直線類型分派到三個專用函式。

**垂直線（drawVerticalLine）：** 從 `y1` 到 `y2` 逐像素呼叫 `drawPixel`。先確保 `y1 ≤ y2`。

**水平線（drawHorizontalLine）：** 這是效能最優化的部分。利用記憶體 word 的結構，一次寫入整個 word：

```jack
function void drawHorizontalLine(int x1, int x2, int y) {
    let start_addr = (y * 32) + (x1 / 16);
    let end_addr = (y * 32) + (x2 / 16) + (x2 mod 16 = 0);
    // 同一個 word 內的短線段
    if( start_addr = end_addr ) → draw_short_horizontal_line
    else {
        // 處理起始端（不對齊 word 邊界時）
        if( x1 mod 16 ≠ 0 ) → 畫起始段並推進 start_addr
        // 處理結尾端
        if( x2 mod 16 ≠ 0 ) → 畫結尾段並回退 end_addr
        // 中間完整 word 直接填入 cur_colour
        while( start_addr ≤ end_addr ) {
            screen[start_addr] = cur_colour;
            start_addr = start_addr + 1;
        }
    }
}
```

中間完整的 word 直接以 `cur_colour`（true=-1 全黑或 false=0 全白）填入，不需要逐位元操作，大幅提升了繪製粗水平線的效率。只有兩端不對齊 word 邊界的部分才需要逐像素繪製。

**斜線（drawDiagonalLine）— Bresenham 演算法：**

```jack
function void drawDiagonalLine(int x1, int y1, int x2, int y2, int dx, int dy) {
    var int a, b, adyMinusbdx, y_incr;
    let a = 0; let b = 0; let adyMinusbdx = 0;
    let y_incr = (dy < 0) ? -1 : 1;
    while( a ≤ dx 且 b 未超出 dy 範圍 ) {
        drawPixel(x1+a, y1+b);
        if( adyMinusbdx < 0 ) {
            let a = a + 1;
            let adyMinusbdx = adyMinusbdx + (dy × y_incr);
        } else {
            let b = b + y_incr;
            let adyMinusbdx = adyMinusbdx - dx;
        }
    }
}
```

**Bresenham 演算法原理：**

Bresenham 演算法是數位直線光柵化的核心演算法。其目標是：給定起點和終點，決定哪些像素最接近數學上的理想直線。

數學推導：理想的直線方程為 `y = (dy/dx) × a`，其中 `a` 是 x 方向的偏移。我們需要決定每走一步 x，是否也需要走一步 y。

定義誤差項 `e = a·dy - b·dx`：
- 當 `e < 0` 時，像素偏離直線下方，需要推進 a（x 方向）
- 當 `e ≥ 0` 時，像素偏離直線上方，需要推進 b（y 方向）

每次更新：
- 推進 a：`e ← e + dy`（因為 a 增 1，誤差增加 dy）
- 推進 b：`e ← e - dx`（因為 b 增 1，誤差減少 dx）

程式中的 `adyMinusbdx` 就是這個誤差項 `e = a·dy - b·dx`。

時間複雜度為 O(dx + dy)，每個像素只做一次 `drawPixel` 呼叫。

### drawRectangle(x1, y1, x2, y2) — 實心矩形

```jack
function void drawRectangle(int x1, int y1, int x2, int y2) {
    var int y;
    let y = y1;
    while( ~(y > y2) ) {
        do Screen.drawHorizontalLine(x1, x2, y);
        let y = y + 1;
    }
}
```

逐列呼叫 `drawHorizontalLine`，從 `y1` 到 `y2` 填滿每一列。利用水平線的最佳化（中間完整 word 直接寫入），矩形的繪製效率相當高。

### drawCircle(cx, cy, r) — 實心圓

```jack
function void drawCircle(int cx, int cy, int r) {
    var int dy, r_squared;
    let dy = -r;
    let r_squared = r * r;
    while( ~(dy > r) ) {
        let dx = Math.sqrt(r_squared - (dy * dy));
        do Screen.drawHorizontalLine(cx - dx, cx + dx, cy + dy);
        let dy = dy + 1;
    }
}
```

**原理：** 圓的方程 `x² + y² = r²`。對於每一個 y 偏移 `dy`（從 -r 到 +r），計算對應的 x 範圍 `dx = √(r² - dy²)`，然後畫一條水平線從 `(cx-dx, cy+dy)` 到 `(cx+dx, cy+dy)`。

時間複雜度 O(r)，每列做一次 `Math.sqrt` 和一次水平線繪製。`Math.sqrt` 的結果取整數，可能在圓邊緣產生微小的鋸齒（aliasing），但在教學平台的解析度下不明顯。

## 實作細節

### clearScreen()

```jack
function void clearScreen() {
    var int i;
    let i = 0;
    while( i < 8192 ) {
        let screen[i] = white;    // white = false = 0
        let i = i + 1;
    }
}
```

遍歷全部 8192 個 word，逐一設為 0（白色）。在實際硬體上，可以用 DMA（直接記憶體存取）或區塊搬移指令大幅加速，但在 Jack 中只能逐 word 寫入。

> 注意：官方 nand2tetris 的 Screen.jack 原文少了 `let i = i + 1;`，會造成無窮迴圈（clearScreen 永遠無法結束）。此處已修正；教學時常以此當作「官方 OS 也有 bug」的例子。

### drawHorizontalLine 的位址計算技巧

`end_addr` 的計算包含 `(x2mod16 = 0)` 項目。這是處理 `x2` 恰好在 word 邊界上的情況：若 `x2` 是 16 的倍數（如 16、32），`x2/16` 已經指向正確的 word，但後面的中間 word 迴圈不需要重繪這個 word，所以需要調整。這個細節體現了位元運算與記憶體對齊的微妙交互。

## 測試與驗證

Screen 模組的驗證：

1. 編譯所有 OS 模組
2. 在 CPU Emulator 中執行 Pong 或其他圖形測試程式
3. 在 RAM 觀察面板中查看 16384–24575 區域的記憶體變化
4. 使用 `Screen.tst` 測試腳本自動驗證特定像素是否被正確設定

## 延伸討論

此模組使用的是**直接記憶體映射**（memory-mapped I/O）——螢幕記憶體與一般 RAM 共用相同的位址空間，CPU 寫入特定範圍的位址就會自動反映在螢幕上。這是 Hack 硬體的簡化設計。真實的 GPU 使用命令緩衝區（command buffer）和 DMA 來避免 CPU 逐像素寫入的瓶頸。Bresenham 演算法自 1962 年提出以來，仍是硬體掃描轉換器（scan converter）和嵌入式圖形系統的核心演算法。此實作中的水平線最佳化（整 word 填充）是位元圖形系統中的經典技巧，在真實的 framebuffer 驅動中也被廣泛使用。
