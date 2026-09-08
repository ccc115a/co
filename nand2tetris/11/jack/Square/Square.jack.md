# Square.jack 程式說明 — Square 專案

實作一個可在螢幕上移動、縮放的圖形方塊，是物件導向程式設計在 Jack 語言中的完整示範。

## 概述

`Square` 是一個典型的圖形物件類別：擁有位置（x, y）和大小（size）等屬性，提供繪製（draw）、擦除（erase）、移動（moveUp/Down/Left/Right）和縮放（incSize/decSize）等操作。移動方法使用「先擦後畫」的增量更新策略，而非每次重繪整個螢幕，這是低階圖形編程的常見技巧。

## 架構總覽

```
class Square {
    field int x, y;         ← 方塊左上角座標
    field int size;          ← 方塊邊長（像素）

    constructor Square new(int Ax, int Ay, int Asize)   ← 建構
    method void dispose()                                ← 釋放記憶體
    method void draw()                                   ← 繪製
    method void erase()                                  ← 擦除
    method void incSize()                                ← 放大 2px
    method void decSize()                                ← 縮小 2px
    method void moveUp()                                 ← 上移 2px
    method void moveDown()                               ← 下移 2px
    method void moveLeft()                               ← 左移 2px
    method void moveRight()                              ← 右移 2px
}
```

### 成員變數

| 變數 | 型別 | 角色 | 說明 |
|------|------|------|------|
| `x` | int | field | 方塊左上角的水平座標（0～511） |
| `y` | int | field | 方塊左上角的垂直座標（0～255） |
| `size` | int | field | 方塊邊長（像素），每次增減 2 |

### 螢幕邊界

| 方向 | 邊界值 | 原因 |
|------|--------|------|
| 右 | 510 | `x + size < 510`，確保方塊不超出 512 像素寬的螢幕 |
| 下 | 254 | `y + size < 254`，確保方塊不超出 256 像素高的螢幕 |
| 左 | 1 | `x > 1`，避免方塊跑到負座標 |
| 上 | 1 | `y > 1`，同上 |

## 原理

### 繪製與擦除

方塊的繪製使用 `Screen.drawRectangle`，以左上角 `(x, y)` 和右下角 `(x+size, y+size)` 定義矩形。擦除的方法是設定顏色為 false 後再畫一次同一個矩形（黑色方塊在黑色背景上擦除，或白色方塊在白色背景上擦除）。

```jack
method void draw() {
    do Screen.setColor(true);                          // 設定前景色（黑色）
    do Screen.drawRectangle(x, y, x + size, y + size); // 畫矩形
}

method void erase() {
    do Screen.setColor(false);                         // 設定背景色（白色）
    do Screen.drawRectangle(x, y, x + size, y + size); // 用白色覆蓋
}
```

### 增量更新（非全域重繪）

移動方法不使用 `erase() → 改座標 → draw()` 的全域重繪，而是只更新變化的一行像素：

**向上移動 `moveUp()`：**
```
1. 擦除最底行：矩形 (x, y+size-1) → (x+size, y+size)     ← 消失的行
2. 座標上移 2px：y = y - 2
3. 畫出新頂行：矩形 (x, y) → (x+size, y+1)                ← 出現的行
```

**向下移動 `moveDown()`：**
```
1. 擦除最頂行：矩形 (x, y) → (x+size, y+1)
2. 座標下移 2px：y = y + 2
3. 畫出新底行：矩形 (x, y+size-1) → (x+size, y+size)
```

左右移動的邏輯完全對稱，只是改動 x 座標並更新最左/最右行。

這種增量更新的效能優勢：每次移動只需繪製 2 像素寬的長條，而非整個方塊（可能數千像素）。

### 縮放的邊界檢查

```jack
method void incSize() {
    if (((y + size) < 254) & ((x + size) < 510)) {  // 確保放大後不超出螢幕
        do erase();
        let size = size + 2;
        do draw();
    }
}

method void decSize() {
    if (size > 2) {    // 確保縮小後至少 2×2 像素
        do erase();
        let size = size - 2;
        do draw();
    }
}
```

## 實作細節

### constructor 與 destructor

```jack
constructor Square new(int Ax, int Ay, int Asize) {
    let x = Ax;             // 複製參數到 field
    let y = Ay;
    let size = Asize;
    do draw();              // 建立後立即繪製
    return this;            // constructor 必須回傳 this
}

method void dispose() {
    do Memory.deAlloc(this);  // 釋放物件佔用的記憶體
    return;
}
```

### 每次移動的步長

所有移動方法都以 2 像素為單位。這不是巧合：`incSize`/`decSize` 也以 2 為單位，確保方塊始終保持偶數邊長，不會因奇數座標導致繪製錯位。

## 測試與驗證

編譯三個 .jack 檔後在 VM Emulator 中執行。操作方式：
- **方向鍵**：上下左右移動方塊
- **x 鍵**：放大方塊（+2px）
- **z 鍵**：縮小方塊（-2px）
- **q 鍵**：退出遊戲

觀察方塊在邊界處是否正確停止（不超出螢幕），縮放是否平滑。

## 延伸討論

- **與 C 語言/OpenGL 對照**：C 中的矩形繪製通常用 `glRecti(x, y, x+w, y+h)` 或 SDL 的 `SDL_RenderFillRect`。Jack 的 `Screen.drawRectangle` 是最底層的像素操作，沒有硬體加速。
- **為何每次移動 2 像素**：可能是為了與方塊大小的增量（也是 2）保持一致，避免出現半像素的對齊問題。
- **改進方向**：可加入旋轉、顏色變化、或多個方塊的碰撞偵測。但 Jack 的 OS 沒有提供旋轉 API，所以旋轉需自行實作像素級運算。
- **Screen API 的效能瓶頸**：`drawRectangle` 是逐像素設定，在大型方塊上會有明顯延遲。真實遊戲引擎會使用雙緩衝或 DMA 傳輸。
