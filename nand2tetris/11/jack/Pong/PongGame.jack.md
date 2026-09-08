# PongGame.jack 程式說明 — Pong 專案

Pong 遊戲的核心控制器：管理遊戲迴圈、碰撞偵測、計分與遊戲結束判定。

## 概述

`PongGame` 是整個 Pong 遊戲的大腦。它整合了 `Ball`（球）和 `Bat`（球拍）兩個物件，管理遊戲狀態（分數、是否結束），處理鍵盤輸入，並在每個幀中更新球的移動與碰撞。這個檔案展示了 Jack 中最複雜的遊戲邏輯：singleton 模式、物件間的碰撞偵測、以及遊戲狀態機。

## 架構總覽

```
class PongGame {
    static PongGame instance;      ← singleton 實例（唯一的遊戲物件）

    field Bat bat;                 ← 球拍物件
    field Ball ball;               ← 球物件
    field int wall;                ← 球目前碰觸的牆壁
    field boolean exit;            ← 遊戲結束旗標
    field int score;               ← 目前得分
    field int lastWall;            ← 上一次碰觸的牆壁（避免重複反彈）
    field int batWidth;            ← 球拍目前寬度（會逐漸縮小）

    constructor PongGame new()
    method void dispose()
    function void newInstance()    ← 建立 singleton 實例
    function PongGame getInstance()← 取得 singleton 實例
    method void run()              ← 遊戲主迴圈
    method void moveBall()         ← 球的移動與碰撞處理
}
```

### 成員變數分類

| 類別 | 變數 | 用途 |
|------|------|------|
| Singleton | `static instance` | 全域唯一的遊戲實例 |
| 遊戲物件 | `bat`, `ball` | 球拍與球的參照 |
| 遊戲狀態 | `exit`, `score` | 結束旗標與計分 |
| 碰撞狀態 | `wall`, `lastWall` | 避免同一面牆重複觸發反彈 |
| 球拍狀態 | `batWidth` | 球拍寬度（每次碰撞減 2px） |

## 原理

### Singleton 模式

```jack
static PongGame instance;          // static 變數，屬於 class 而非實例

function void newInstance() {       // static function：建立實例
    let instance = PongGame.new();
}

function PongGame getInstance() {   // static function：取得實例
    return instance;
}
```

這允許任何其他類別透過 `PongGame.getInstance()` 取得遊戲實例，存取 `score`、`exit` 等狀態。在 Jack 中，`static` 變數在整個程式執行期間只有一份，所有實例共享。

### 遊戲迴圈

```jack
method void run() {
    var char key;

    while (~exit) {
        // 等待按鍵（同時持續更新球和球拍）
        while ((key = 0) & (~exit)) {
            let key = Keyboard.keyPressed();
            do bat.move();          // 球拍根據方向持續移動
            do moveBall();          // 球持續移動
        }

        // 處理按鍵
        if (key = 130) { do bat.setDirection(1); }       // ← 左
        else if (key = 132) { do bat.setDirection(2); }  // → 右
        else if (key = 140) { let exit = true; }          // ESC 結束

        // 等待按鍵釋放（同時持續更新）
        while ((~(key = 0)) & (~exit)) {
            let key = Keyboard.keyPressed();
            do bat.move();
            do moveBall();
        }
    }

    if (exit) {
        do Output.moveCursor(10, 27);
        do Output.printString("Game Over");
    }
    return;
}
```

遊戲迴圈在「等待輸入」和「等待釋放」兩個階段都會持續更新球和球拍，確保遊戲在無按鍵時仍能運行。這與 Square 的「被動移動」不同——Pong 的球會自動移動。

### moveBall()：碰撞偵測與反彈

```jack
method void moveBall() {
    var int bouncingDirection, batLeft, batRight, ballLeft, ballRight;

    let wall = ball.move();    // 球移動一步，回傳碰觸的牆壁（0=無碰撞）

    if ((wall > 0) & (~(wall = lastWall))) {   // 碰到牆壁且不是重複觸發
        let lastWall = wall;
        let bouncingDirection = 0;              // 預設：不偏移

        // 取得球拍與球的 x 範圍
        let batLeft = bat.getLeft();
        let batRight = bat.getRight();
        let ballLeft = ball.getLeft();
        let ballRight = ball.getRight();

        if (wall = 4) {    // 碰到下方牆壁（球拍所在的牆）
            // 球是否完全在球拍左邊或右邊？
            let exit = (batLeft > ballRight) | (batRight < ballLeft);

            if (~exit) {    // 球拍接住了球
                // 決定反彈偏移方向
                if (ballRight < (batLeft + 10)) {
                    let bouncingDirection = -1;    // 球在球拍左側 → 向左偏
                }
                else {
                    if (ballLeft > (batRight - 10)) {
                        let bouncingDirection = 1; // 球在球拍右側 → 向右偏
                    }
                    // 球在中間 → bouncingDirection = 0（不偏移）
                }

                let batWidth = batWidth - 2;        // 球拍縮窄
                do bat.setWidth(batWidth);
                let score = score + 1;              // 加分
                do Output.moveCursor(22, 7);
                do Output.printInt(score);          // 更新螢幕上的分數
            }
        }

        do ball.bounce(bouncingDirection);          // 執行反彈
    }
    return;
}
```

### 碰撞偵測的幾何邏輯

球拍與球的碰撞偵測使用 x 範圍比較：

```
球拍範圍：[batLeft, batRight]
球的範圍：[ballLeft, ballRight]

碰撞條件：NOT (batLeft > ballRight OR batRight < ballLeft)
         即：batLeft ≤ ballRight AND batRight ≥ ballLeft
```

這等價於數學上的「兩個區間有交集」。若碰撞成立，進一步判斷球在球拍的哪個區域：

```
球拍：|-------- 10px --------|-------- middle --------|-------- 10px --------|
      left zone               center zone              right zone

若球在 left zone → bouncingDirection = -1（向左偏）
若球在 right zone → bouncingDirection = 1（向右偏）
若球在 center zone → bouncingDirection = 0（不偏移）
```

### 遊戲結束條件

當球碰到下方牆壁（wall = 4）且球拍沒有接住（球完全在球拍外）時，`exit` 被設為 `true`。遊戲迴圈結束後在螢幕中央印出 "Game Over"。

### 球拍縮窄機制

每成功接住一次球，球拍寬度減 2 像素：

```jack
let batWidth = batWidth - 2;
do bat.setWidth(batWidth);
```

初始寬度為 50px。這讓遊戲隨時間變得越來越難，是經典 Pong 的核心機制。

## 實作細節

### constructor 的初始化

```jack
constructor PongGame new() {
    do Screen.clearScreen();                      // 清除螢幕

    let batWidth = 50;
    let bat = Bat.new(230, 229, batWidth, 7);    // 球拍：中央、底部附近、50×7px

    let ball = Ball.new(253, 222, 0, 511, 0, 229); // 球：中央、四面牆邊界
    do ball.setDestination(400, 0);               // 初始目標：向右上角移動

    do Screen.drawRectangle(0, 238, 511, 240);   // 畫底部水平線（分隔線）
    do Output.moveCursor(22, 0);                  // 游標移到第 22 行
    do Output.printString("Score: 0");           // 顯示初始分數

    let exit = false;
    let score = 0;
    let wall = 0;
    let lastWall = 0;

    return this;
}
```

注意球的初始目標是 `(400, 0)`——螢幕右上角，這使球一開始就以某個角度向右上方移動。

### dispose()：記憶體釋放

```jack
method void dispose() {
    do bat.dispose();          // 釋放球拍
    do ball.dispose();         // 釋放球
    do Memory.deAlloc(this);   // 釋放遊戲物件自身
    return;
}
```

釋放順序：先釋放子物件，再釋放自己。

## 測試與驗證

在 VM Emulator 中載入 `Pong/` 目錄下所有 .vm 檔。測試項目：

| 測試 | 預期行為 |
|------|----------|
| 程式啟動 | 螢幕清除、球拍在中央、球向右上方移動、顯示 "Score: 0" |
| 左方向鍵 | 球拍左移 |
| 右方向鍵 | 球拍右移 |
| 球碰到球拍 | 球反彈、分數 +1、球拍縮窄 2px |
| 球碰到左/右/上牆 | 球反彈、方向改變 |
| 球未被球拍接住 | 遊戲結束、顯示 "Game Over" |
| ESC 鍵 | 遊戲結束、顯示 "Game Over" |

## 延伸討論

- **singleton 的必要性**：在 Pong 中，Ball 和 Bat 不需要直接存取 PongGame 的實例。singleton 模式在此更多是為了示範設計模式，以及為未來擴展（如 Ball 需要存取分數）預留空間。
- **lastWall 的防抖機制**：若沒有 `lastWall` 檢查，球在同一面牆上短時間內可能觸發多次碰撞（因 4px 步長可能讓球「卡」在牆上）。`lastWall` 確保同一面牆只觸發一次反彈。
- **與 C 語言遊戲對照**：C 的 Pong 實作通常用 `struct` 而非 class，用函式指標表（vtable）模擬多型。Jack 沒有多型，所有型別解析都在編譯期完成。
- **遊戲平衡**：初始球速由 `setDestination(400, 0)` 決定，球拍縮窄速度為每接一次 -2px。這些常數直接影響遊戲難度，可調整以改變體驗。
- **缺少的功能**：真正的 Pong 有雙人模式、球速遞增、回合制等。本版本是簡化版，專注於展示 Jack 的物件導向與遊戲迴圈能力。
