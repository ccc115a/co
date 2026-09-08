# Main.jack 程式說明 — Square 專案

Square Dance 遊戲的進入點，負責建立遊戲物件並啟動遊戲迴圈。

## 概述

這是 Square 遊戲三部曲（`Main.jack`、`Square.jack`、`SquareGame.jack`）中最簡短的一個。它的唯一職責是建立 `SquareGame` 實例、呼叫 `run()` 啟動遊戲，結束後釋放記憶體。這個檔案展示了 Jack 中物件導向程式的標準啟動模式。

## 架構總覽

```
class Main {
    function void main()   ← 程式進入點
}
```

| 元素 | 說明 |
|------|------|
| `var SquareGame game` | 區域變數，型別為 `SquareGame`（物件指標） |
| `SquareGame.new()` | 呼叫 `SquareGame` 的 constructor，建立並回傳新實例 |
| `game.run()` | 呼叫 method，啟動遊戲主迴圈（阻塞直到使用者按 q） |
| `game.dispose()` | 呼叫 method，釋放遊戲物件佔用的記憶體 |

## 原理

### Jack 的物件生命週期

```
建立：SquareGame.new()     → 呼叫 constructor，配置記憶體，初始化 field
使用：game.run()           → 呼叫 method，遊戲執行中
釋放：game.dispose()       → 呼叫 method，釋放記憶體
```

這與 C++ 的 `new/delete` 或 Java 的 `new`（但 Java 有垃圾回收所以不需要 dispose）概念相同。在 Jack 中，程式設計師必須手動管理所有記憶體。

### Main 的角色

`Main` 是 OS 的進入點。Jack 編譯器會為每個 `.jack` 檔產生一個 `.vm` 檔，OS 的 bootstrap 程式會尋找 `Main.main()` 並呼叫它。因此 `Main` class 本身不需要被其他程式實例化。

## 實作細節

```jack
function void main() {              // static function，無 this
    var SquareGame game;            // 宣告區域變數

    let game = SquareGame.new();    // 建立遊戲實例（constructor 回傳 this）
    do game.run();                  // 啟動遊戲（阻塞式迴圈）
    do game.dispose();              // 釋放遊戲物件

    return;                         // 結束程式
}
```

注意 `game.run()` 使用 `do` 呼叫（因為 `run()` 回傳 `void`），而 `SquareGame.new()` 使用 `let` 接收回傳值（因為 constructor 回傳物件指標）。

## 測試與驗證

編譯 `Main.jack`、`Square.jack`、`SquareGame.jack` 為 VM 程式碼後，在 VM Emulator 中載入。程式執行後應在螢幕左上角顯示一個黑色方塊（30×30 像素），可透過方向鍵移動、z/x 縮放、q 結束。

## 延伸討論

- **與 SquareGame.new() vs PongGame.newInstance() 的對比**：Square 用 `let game = SquareGame.new()` 直接建立；Pong 用 singleton 模式（`newInstance()` + `getInstance()`），這反映了不同的物件管理策略。
- **為何需要 dispose()**：Jack 沒有垃圾回收器，所有 `new` 配置的記憶體都必須手動釋放。不呼叫 `dispose()` 會導致記憶體洩漏，在 VM Emulator 中因程式結束所以影響不大，但在模擬真實硬體時會耗盡記憶體。
- **遊戲迴圈設計**：`run()` 是阻塞式的——程式會停在裡面直到使用者按 q。這是小遊戲的典型做法。
