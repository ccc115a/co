# SquareGame.jack 程式說明 — Square 專案

Square Dance 遊戲的控制器，管理遊戲迴圈、處理鍵盤輸入並控制方塊的移動方向。

## 概述

`SquareGame` 是遊戲的主迴圈管理器。它持有 `Square` 物件的參照，持續監聽鍵盤輸入，根據使用者按鍵決定方塊的移動方向或大小變化。這個檔案展示了 Jack 中典型的「事件驅動遊戲迴圈」模式：等待輸入→處理輸入→更新畫面→重複。

## 架構總覽

```
class SquareGame {
    field Square square;       ← 被控制的方塊物件
    field int direction;       ← 目前移動方向（0=停止, 1=上, 2=下, 3=左, 4=右）

    constructor SquareGame new()    ← 建構：建立方塊並初始化
    method void dispose()           ← 釋放記憶體
    method void run()               ← 遊戲主迴圈
    method void moveSquare()        ← 根據方向移動方塊
}
```

## 原理

### 遊戲迴圈模式

Jack 的遊戲迴圈遵循經典的「 poll → process → render → repeat 」模式：

```
while (遊戲未結束) {
    while (無按鍵) {           ← 等待輸入
        輪詢鍵盤
        移動方塊（持續移動效果）
    }
    處理按鍵 → 設定方向/大小/退出
    while (按鍵未釋放) {       ← 等待按鍵放開
        輪詢鍵盤
        移動方塊
    }
}
```

這種「等待釋放」的設計避免了一次按鍵觸發多次動作。`direction` 是一個持久狀態，一旦設定就會持續生效，直到被改變或程式結束。

### 按鍵碼對照表

| 按鍵 | ASCII/掃描碼 | 動作 |
|------|-------------|------|
| `q` | 81 | 結束遊戲 |
| `z` | 90 | 縮小方塊 (`decSize`) |
| `x` | 88 | 放大方塊 (`incSize`) |
| ← | 130 | 方向設為左 (3) |
| → | 132 | 方向設為右 (4) |
| ↑ | 131 | 方向設為上 (1) |
| ↓ | 133 | 方向設為下 (2) |

方向鍵使用掃描碼（130-133）而非 ASCII，因為 Jack 的 `Keyboard.keyPressed()` 對方向鍵回傳的是掃描碼而非字元碼。

## 實作細節

### constructor

```jack
constructor SquareGame new() {
    let square = Square.new(0, 0, 30);  // 在左上角建立 30×30 的方塊
    let direction = 0;                    // 初始方向：停止
    return this;
}
```

### run()：遊戲主迴圈

```jack
method void run() {
    var char key;
    var boolean exit;

    let exit = false;

    while (~exit) {
        // 等待按鍵
        while (key = 0) {
            let key = Keyboard.keyPressed();
            do moveSquare();           // 持續移動（即使無新按鍵）
        }

        // 處理按鍵
        if (key = 81) { let exit = true; }          // q → 退出
        if (key = 90) { do square.decSize(); }       // z → 縮小
        if (key = 88) { do square.incSize(); }       // x → 放大
        if (key = 131) { let direction = 1; }        // ↑ → 上
        if (key = 133) { let direction = 2; }        // ↓ → 下
        if (key = 130) { let direction = 3; }        // ← → 左
        if (key = 132) { let direction = 4; }        // → → 右

        // 等待按鍵釋放
        while (~(key = 0)) {
            let key = Keyboard.keyPressed();
            do moveSquare();
        }
    }
    return;
}
```

注意所有 `if` 都用獨立判斷而非 `if/else if`。這是刻意的：若使用者同時按住多個鍵，所有對應的 `direction` 設定都會執行（最後一個生效）。在本例中因為鍵盤輪詢的速度，這不會造成問題。

### moveSquare()：方向分派

```jack
method void moveSquare() {
    if (direction = 1) { do square.moveUp(); }
    if (direction = 2) { do square.moveDown(); }
    if (direction = 3) { do square.moveLeft(); }
    if (direction = 4) { do square.moveRight(); }

    do Sys.wait(5);    // 5ms 延遲，控制移動速度
    return;
}
```

`Sys.wait(5)` 在每次移動後加入 5 毫秒的延遲，避免方塊移動過快。這是遊戲中「幀率控制」的最簡單形式。

### dispose()：記憶體釋放

```jack
method void dispose() {
    do square.dispose();              // 先釋放 Square 物件
    do Memory.deAlloc(this);          // 再釋放 SquareGame 自身
    return;
}
```

釋放順序很重要：先釋放持有的物件，再釋放自己。若順序顛倒，`this` 指標可能已經無效。

## 測試與驗證

在 VM Emulator 中載入三個 .jack 編譯後的 .vm 檔。測試項目：
1. 方向鍵移動方塊（上下左右各測試）
2. x 鍵放大、z 鍵縮小（確認不超出螢幕邊界）
3. 持續按住方向鍵→方塊持續移動（moveSquare 在等待迴圈中也被呼叫）
4. q 鍵退出→程式正常結束

## 延伸討論

- **與 C 語言遊戲迴圈對照**：C 的 SDL/NCurses 遊戲使用 `while(running) { handle_events(); update(); render(); }`，與此結構完全相同。差異在於 Jack 沒有多執行緒，所有操作都是同步阻塞的。
- **方向鍵掃描碼**：130-133 是 Hack 平台的鍵盤掃描碼（對應 arrow keys），不是 ASCII。`Keyboard.keyPressed()` 在無按鍵時回傳 0。
- **改進空間**：可加入加速度（按住越久移動越快）、碰撞偵測（方塊不能重疊）、或多個方塊。目前的 `direction` 只記最後一次按鍵，不支援斜向移動。
- **Sys.wait 的精度**：`Sys.wait(5)` 的實際延遲取決於 VM 的執行速度，在不同硬體上可能有差異。
