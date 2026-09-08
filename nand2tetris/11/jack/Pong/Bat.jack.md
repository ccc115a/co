# Bat.jack 程式說明 — Pong 專案

實作 Pong 遊戲的球拍物件：可左右移動的長條形圖形，使用增量更新策略高效繪製。

## 概述

`Bat` 是 Pong 遊戲中的球拍類別，管理一個水平長條的螢幕繪製與移動。與 Square 的 `moveUp/Down/Left/Right` 四方向不同，Bat 只需左右移動，且使用更高效的增量繪製策略：每次只重繪變化的一小段區域，而非整個球拍。

## 架構總覽

```
class Bat {
    field int x, y;              ← 球拍左上角座標
    field int width, height;     ← 球拍寬度與高度
    field int direction;         ← 移動方向（0=停止, 1=左, 2=右）

    constructor Bat new(int Ax, int Ay, int Awidth, int Aheight)
    method void dispose()
    method void show() / hide() / draw()
    method void setDirection(int Adirection)
    method int getLeft() / getRight()
    method void setWidth(int Awidth)
    method void move()
}
```

### 成員變數

| 變數 | 型別 | 說明 |
|------|------|------|
| `x` | int | 球拍左上角的水平座標 |
| `y` | int | 球拍左上角的垂直座標（固定不動） |
| `width` | int | 球拍寬度（像素），遊戲中會逐漸縮小 |
| `height` | int | 球拍高度（像素），固定為 7 |
| `direction` | int | 移動方向：0=停止, 1=左, 2=右 |

### 螢幕邊界

球拍在 512 像素寬的螢幕上移動，邊界為 x ≥ 0 且 x + width ≤ 511。

## 原理

### 增量繪製策略

Bat 的 `move()` 方法是整個 Pong 遊戲中最精妙的繪圖邏輯之一。它不使用全域重繪，而是根據移動方向只更新必要的像素列：

**向左移動（direction = 1）：**

```
1. x 座標左移 4px：x = x - 4（邊界檢查：x ≥ 0）
2. 擦除最右邊 4 列：矩形 (x+width+1, y) → (x+width+4, y+height)
3. 繪製最左邊 4 列：矩形 (x, y) → (x+3, y+height)
```

```
  擦除區（白色）    保留區（黑色）   繪製區（黑色）
 ┌────┬────────────┬────┐
 │ 新 │  原有球拍  │ 舊 │  ← 移動前
 └────┴────────────┴────┘
         ↓ 向左移 4px
 ┌────┬────────────┐
 │████│  原有球拍  │    ← 移動後（右側 4 列被擦除，左側 4 列被繪製）
 └────┴────────────┘
```

**向右移動（direction = 2）：**

```
1. x 座標右移 4px：x = x + 4（邊界檢查：x + width ≤ 511）
2. 擦除最左邊 4 列：矩形 (x-4, y) → (x-1, y+height)
3. 繪製最右邊 4 列：矩形 (x+width-3, y) → (x+width, y+height)
```

這種策略的效率：每次移動只需繪製 4×height 像素（約 28 像素），而非 width×height 像素（約 350 像素）。在低階繪圖系統中，這能顯著提升效能。

### 碰撞偵測用的邊界查詢

```jack
method int getLeft()  { return x; }
method int getRight() { return x + width; }
```

`PongGame` 在碰撞偵測時呼叫這兩個方法，判斷球是否碰到了球拍。球拍的 y 座標是固定的（由 constructor 設定），碰撞偵測只比較 x 範圍。

## 實作細節

### constructor

```jack
constructor Bat new(int Ax, int Ay, int Awidth, int Aheight) {
    let x = Ax;
    let y = Ay;
    let width = Awidth;
    let height = Aheight;
    let direction = 2;       // 預設方向：右
    do show();               // 建立後立即繪製
    return this;
}
```

### setWidth()：動態調整寬度

```jack
method void setWidth(int Awidth) {
    do hide();               // 先擦除目前的球拍
    let width = Awidth;     // 更新寬度
    do show();               // 以新寬度重繪
    return;
}
```

`PongGame` 每次球碰到球拍後會呼叫 `bat.setWidth(batWidth - 2)`，使球拍逐漸縮窄，增加遊戲難度。

### move()：完整的增量移動

```jack
method void move() {
    if (direction = 1) {
        let x = x - 4;                          // 左移
        if (x < 0) { let x = 0; }               // 邊界檢查
        do Screen.setColor(false);
        do Screen.drawRectangle((x + width) + 1, y, (x + width) + 4, y + height);  // 擦除右側
        do Screen.setColor(true);
        do Screen.drawRectangle(x, y, x + 3, y + height);                           // 繪製左側
    }
    else {
        let x = x + 4;                          // 右移
        if ((x + width) > 511) { let x = 511 - width; }  // 邊界檢查
        do Screen.setColor(false);
        do Screen.drawRectangle(x - 4, y, x - 1, y + height);  // 擦除左側
        do Screen.setColor(true);
        do Screen.drawRectangle((x + width) - 3, y, x + width, y + height);  // 繪製右側
    }
    return;
}
```

注意移動步長為 **4 像素**（與 Ball 的步長一致），確保兩者的速度匹配。

## 測試與驗證

透過 PongGame 的遊戲迴圈間接測試。在 VM Emulator 中：
1. 左方向鍵→球拍左移，右方向鍵→球拍右移
2. 球拍不應超出螢幕左右邊界
3. 球拍應有正確的碰撞偵測（球碰到球拍左/中/右應有不同的反彈角度）
4. 每次球碰到球拍後球拍應縮窄 2 像素

## 延伸討論

- **增量更新的風險**：若移動過程中發生中斷或錯誤，擦除區和繪製區可能不一致，導致畫面殘影。真實遊戲引擎通常使用雙緩衝（double buffering）來避免這個問題。
- **與 Square 的 move() 對照**：Square 的四個方向各擦除 1 行並繪製 1 行（步長 2px），Bat 擦除/繪製 4 列（步長 4px）。Bat 的步長更大是為了與 Ball 的速度匹配。
- **direction 的角色**：`direction` 只在 `move()` 中被使用。`setDirection()` 被 `PongGame` 呼叫以回應方向鍵輸入。`direction = 0` 時 `move()` 不做任何事（球拍停止）。
- **為何高度固定為 7**：7 像素的球拍高度在 256 像素高的螢幕上約佔 2.7%，這是 Pong 遊戲的經典設計——球拍要夠小以保持挑戰性。
