# Ball.jack 程式說明 — Pong 專案

實作 Pong 遊戲中的球物件：6×6 像素的方塊球，使用 Bresenham 直線演算法移動，並實作基於幾何的反彈邏輯。

## 概述

`Ball` 是 Pong 遊戲中最複雜的類別。它不僅要管理球的位置與繪製，還要用整數運算模擬直線移動（類似 Bresenham 演算法），並在碰到牆壁或球拍時計算反彈方向。這是 Nand2Tetris 中展示「用整數算術模擬連續運動」的經典案例。

## 架構總覽

```
class Ball {
    field int x, y;                   ← 球的螢幕座標（左上角）
    field int lengthx, lengthy;       ← 目前的位移向量（dest - current）
    field int d, straightD, diagonalD; ← Bresenham 演算法參數
    field boolean invert, positivex, positivey; ← 移動方向旗標
    field int leftWall, rightWall, topWall, bottomWall; ← 牆壁邊界
    field int wall;                   ← 最近碰到的牆壁（1=左,2=右,3=上,4=下）

    constructor Ball new(int Ax, int Ay, int AleftWall, int ArightWall, int AtopWall, int AbottomWall)
    method void dispose()
    method void show() / hide() / draw()
    method int getLeft() / getRight()
    method void setDestination(int destx, int desty)
    method int move()
    method void bounce(int bouncingDirection)
}
```

### 成員變數分類

| 類別 | 變數 | 用途 |
|------|------|------|
| 位置 | `x`, `y` | 球左上角的螢幕座標 |
| 位移向量 | `lengthx`, ` lengthy` | 目前移動方向的向量分量 |
| Bresenham 參數 | `d`, `straightD`, `diagonalD` | 直線補間的決策變數 |
| 方向旗標 | `invert`, `positivex`, `positivey` | 控制 x/y 軸的移動方向 |
| 邊界 | `leftWall`, `rightWall`, `topWall`, `bottomWall` | 四面牆的座標 |
| 狀態 | `wall` | 最近碰到的牆壁編號 |

## 原理

### Bresenham 直線演算法

球的移動使用整數運算的直線補間演算法（Bresenham's line algorithm），完全不使用浮點數。核心概念：

給定起點 `(x, y)` 和終點 `(destx, desty)`，計算從起點到終點的直線路徑上每個「步進點」的座標。

**步驟一：計算位移向量**

```
dx = |destx - x|
dy = |desty - y|
```

若 `dx < dy`（斜率大於 1），則交換 dx 和 dy 並設定 `invert = true`——這表示「以 y 軸為主掃描軸」，最終移動時再把 x/y 交換回來。

**步驟二：初始化 Bresenham 參數**

```
d        = 2 * dy - dx       ← 初始決策變數
straightD = 2 * dy           ← 「只走一步」時 d 的增量
diagonalD = 2 * (dy - dx)    ← 「走對角」時 d 的增量
```

**步驟三：每一步的移動決策**

每一步根據 `d` 的值決定：

```
if (d < 0) {
    d += straightD;          // d < 0 → 走水平步（只沿主軸走一步）
} else {
    d += diagonalD;          // d ≥ 0 → 走對角步（主軸和副軸各走一步）
    // 同時沿副軸移動一步
}
// 每一步都沿主軸移動一步
```

### 移動步長

球的每一步移動 **4 像素**（不是 1 像素）。這是為了讓球有足夠的速度，同時保持整數運算的簡潔。在 `move()` 方法中，每次 x 或 y 的增減都是 `±4`。

### move()：完整的步進邏輯

```jack
method int move() {
    do hide();                    // 擦除目前的球

    // Bresenham 決策
    if (d < 0) {
        let d = d + straightD;    // 沿副軸方向：只更新 d
    }
    else {
        let d = d + diagonalD;    // 沿對角方向：更新 d + 沿副軸走一步

        // 副軸移動（由 positivex/positivey 和 invert 控制方向）
        if (positivey) {
            if (invert) { let x = x + 4; }
            else        { let y = y + 4; }
        }
        else {
            if (invert) { let x = x - 4; }
            else        { let y = y - 4; }
        }
    }

    // 主軸移動（每一步都走）
    if (positivex) {
        if (invert) { let y = y + 4; }
        else        { let x = x + 4; }
    }
    else {
        if (invert) { let y = y - 4; }
        else        { let x = x - 4; }
    }

    // 牆壁碰撞偵測
    if (~(x > leftWall))   { let wall = 1; let x = leftWall; }
    if (~(x < rightWall))  { let wall = 2; let x = rightWall; }
    if (~(y > topWall))    { let wall = 3; let y = topWall; }
    if (~(y < bottomWall)) { let wall = 4; let y = bottomWall; }

    do show();                    // 重繪球
    return wall;                  // 回傳碰撞的牆壁編號
}
```

**關於 `invert` 的語意：**
- `invert = false`：x 軸是主掃描軸，y 軸是副軸
- `invert = true`：y 軸是主掃描軸，x 軸是副軸（交換角色）

`positivex` 和 `positivey` 控制正負方向。在 `setDestination` 中，當 `invert = true` 時，`positivex` 和 `positivey` 的角色會互換，因為 x/y 的意義被反轉了。

### setDestination()：初始化移動參數

```jack
method void setDestination(int destx, int desty) {
    var int dx, dy, temp;

    let lengthx = destx - x;        // 位移向量
    let lengthy = desty - y;
    let dx = Math.abs(lengthx);
    let dy = Math.abs(lengthy);
    let invert = (dx < dy);         // 斜率 > 1 → 交換掃描軸

    if (invert) {
        let temp = dx; dx = dy; dy = temp;    // 交換 dx, dy

        let positivex = (y < desty);          // 注意：invert 時 x/y 角色互換
        let positivey = (x < destx);
    }
    else {
        let positivex = (x < destx);
        let positivey = (y < desty);
    }

    let d = (2 * dy) - dx;          // Bresenham 初始值
    let straightD = 2 * dy;
    let diagonalD = 2 * (dy - dx);

    return;
}
```

### bounce()：反彈邏輯

```jack
method void bounce(int bouncingDirection) {
    var int newx, newy, divLengthx, divLengthy, factor;

    // 先除以 10 避免整數溢位
    let divLengthx = lengthx / 10;
    let divLengthy = lengthy / 10;

    // 決定 factor：控制反彈後的移動距離
    if (bouncingDirection = 0) {
        let factor = 10;        // 正面反彈（不偏移）
    }
    else {
        // 反彈方向是否與球的行進方向一致？
        if ((~(lengthx < 0) & (bouncingDirection = 1)) |
            ((lengthx < 0) & (bouncingDirection = (-1)))) {
            let factor = 20;    // 一致：大力反彈
        }
        else {
            let factor = 5;     // 不一致：小力反彈
        }
    }

    // 根據碰觸的牆壁計算新目標點
    if (wall = 1) {              // 左牆
        let newx = 506;
        let newy = (divLengthy * (-50)) / divLengthx;
        let newy = y + (newy * factor);
    }
    else if (wall = 2) {         // 右牆
        let newx = 0;
        let newy = (divLengthy * 50) / divLengthx;
        let newy = y + (newy * factor);
    }
    else if (wall = 3) {         // 上牆
        let newy = 250;
        let newx = (divLengthx * (-25)) / divLengthy;
        let newx = x + (newx * factor);
    }
    else {                       // 下牆（wall = 4）
        let newy = 0;
        let newx = (divLengthx * 25) / divLengthy;
        let newx = x + (newx * factor);
    }

    do setDestination(newx, newy);  // 設定新的移動目標
    return;
}
```

**反彈幾何推導：**

以左牆反彈為例。球從右向左撞到左牆，新的目標是螢幕右側（x = 506）。位移向量的 x 分量從負值翻轉為正值（506 - 0 = 506），而 y 分量保持方向但按比例縮放：

```
newy = (divLengthy * (-50)) / divLengthx
     = (lengthy/10 * -50) / (lengthx/10)
     = lengthy * (-50) / lengthx
```

這裡用 `divLengthx` 而非 `lengthx` 做除法，是為了避免整數乘法溢位（16 位元整數最大值為 32767）。`factor` 控制 y 方向的偏移量——factor=10 時偏移適中，factor=20 時偏移更大（球的角度更陡），factor=5 時偏移更小（球更「平」）。

**bouncingDirection 的含義：**
- `0`：球拍正中央接球，不偏移
- `-1`：球拍左側接球，球向左偏
- `1`：球拍右側接球，球向右偏

## 實作細節

### 繪製：6×6 方塊

```jack
method void draw() {
    do Screen.drawRectangle(x, y, x + 5, y + 5);   // 6×6 像素
}
```

球是 6×6 像素的實心方塊（不是圓形），因為 Hack 畫面的繪圖 API 只支援矩形。

### 牆壁邊界的調整

```jack
constructor Ball new(...) {
    let rightWall = ArightWall - 6;    // 減去球的寬度（6px）
    let bottomWall = AbottomWall - 6;  // 減去球的高度（6px）
}
```

因為球的座標是左上角，而 `rightWall` 和 `bottomWall` 代表的是球的右下角不能超過的邊界，所以要減去球的尺寸（6 像素）。

### show() / hide() 模式

```jack
method void show() {
    do Screen.setColor(true);
    do draw();
}

method void hide() {
    do Screen.setColor(false);
    do draw();
}
```

`show` 和 `hide` 透過 `Screen.setColor` 切換前景/背景色後呼叫同一個 `draw()`。移動時先 `hide()` 擦除舊位置，計算新位置後再 `show()` 繪製新位置。

## 測試與驗證

Ball 的行為透過 PongGame 的遊戲迴圈間接測試。在 VM Emulator 中：
1. 球應從中央向某方向直線移動
2. 碰到左/右/上牆應反彈
3. 碰到下方球拍應反彈（球拍接住時）
4. 碰到下方牆（球拍未接住）應結束遊戲

可透過修改 `setDestination` 的初始目標觀察不同角度的移動。

## 延伸討論

- **Bresenham 演算法的歷史**：這個演算法於 1962 年由 Jack E. Bresenham 在 IBM 發明，用於控制墨水印表機的列印頭移動。它的核心優勢是只用整數加法和比較，不需要浮點除法，非常適合硬體實作。
- **4 像素步長的影響**：每步 4 像素意味著球的最小移動單位是 4px，可能導致與球拍的碰撞偵測不精確。真實 Pong 遊戲通常用 1px 步長或連續物理模擬。
- **溢位防護**：`divLengthx / divLengthy` 的除法可能產生 0（當分母很大時），導致除以零。程式假設不會發生這種邊界情況。
- **與 C 語言對照**：C 版本的 Bresenham 會用 `for` 迴圈遍歷每個像素：`for (i = 0; i < steps; i++) { ... }`。Jack 用 `while` + 狀態變數（`d`, `positivex` 等）達成相同效果，因為 Jack 沒有 `for` 迴圈。
