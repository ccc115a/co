# Main.jack 程式說明 — Pong 專案

Pong 遊戲的進入點，負責建立遊戲實例（singleton 模式）並啟動遊戲。

## 概述

這是 Pong 遊戲四個類別中最簡短的一個。與 Square 專案的 `Main.jack` 不同，Pong 的 Main 使用 singleton 模式管理遊戲實例：先呼叫 `newInstance()` 建立物件，再用 `getInstance()` 取得參照。這反映了更正式的物件管理策略，適用於大型遊戲中可能有多個類別需要存取同一個遊戲實例的場景。

## 架構總覽

```
class Main {
    function void main()   ← 程式進入點
}
```

## 原理

### Singleton 模式

PongGame 採用 singleton（單例）模式，確保整個程式只有一個遊戲實例：

```jack
function void main() {
    var PongGame game;

    do PongGame.newInstance();           // 建立唯一的 PongGame 實例，存入 static 變數
    let game = PongGame.getInstance();   // 取得該實例的參照
    do game.run();                       // 啟動遊戲
    do game.dispose();                   // 釋放記憶體
    return;
}
```

`newInstance()` 和 `getInstance()` 都是 `PongGame` 的 `static function`（類別方法），不屬於任何實例。`newInstance()` 內部會呼叫 `PongGame.new()`（constructor）並把結果存入 `static PongGame instance`。

### 與 Square 的對比

| 方面 | Square/Main.jack | Pong/Main.jack |
|------|------------------|----------------|
| 物件建立 | `let game = SquareGame.new()` | `newInstance()` + `getInstance()` |
| 模式 | 直接建立 | Singleton |
| 原因 | 只有一個類別需要遊戲物件 | 可能有多個類別需存取同一遊戲實例 |

## 實作細節

```jack
class Main {
    function void main() {
        var PongGame game;              // 區域變數，型別為 PongGame

        do PongGame.newInstance();      // static function call，無回傳值
        let game = PongGame.getInstance();  // static function call，回傳物件參照
        do game.run();                  // method call，啟動遊戲迴圈
        do game.dispose();              // method call，釋放記憶體

        return;
    }
}
```

注意 `do` vs `let` 的使用：
- `do PongGame.newInstance()`：`newInstance()` 回傳 `void`，所以用 `do`
- `let game = PongGame.getInstance()`：`getInstance()` 回傳物件參照，所以用 `let` 接收

## 測試與驗證

編譯 `Main.jack`、`Ball.jack`、`Bat.jack`、`PongGame.jack` 後在 VM Emulator 中載入。程式執行後應顯示：
- 螢幕底部有一條白色水平線（分隔線）
- 一個球拍（Bat）在底部中央
- 一個球（Ball）從中央向某方向移動
- 螢幕下方顯示 "Score: 0"
- 按左右方向鍵移動球拍，ESC 鍵結束

## 延伸討論

- **為何用 singleton 而非直接 new**：PongGame 的 `static PongGame instance` 讓其他類別（如 Ball、Bat）可以透過 `PongGame.getInstance()` 取得遊戲實例，存取計分、遊戲狀態等資訊。這在 Square 中不需要，因為 SquareGame 和 Square 的關係很簡單。
- **static function vs static method**：`newInstance()` 和 `getInstance()` 是 `static function`（不綁定實例），而非 `static method`。在 Jack 中，`static function` 用 `function` 宣告，`static method` 不存在（所有 `method` 都需要 `this`）。
- **與 Java 的對照**：Java 的 `public static void main(String[] args)` 與此類似，但 Java 的 main 可以接收命令列參數，Jack 的不行。
