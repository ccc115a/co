# Keyboard.jack 程式說明

## 概述

`Keyboard.jack` 是 Jack OS 的鍵盤輸入模組，提供從硬體鍵盤讀取按鍵的功能。它透過硬體的**記憶體映射暫存器**（memory-mapped register）讀取當前按鍵狀態，並提供從「非同步等待鍵盤輸入」到「讀取一行文字」和「讀取整數」的高階輸入函式。

## 架構總覽

### 硬體介面

Hack 的鍵盤硬體只有一個 16-bit 暫存器，位於 RAM 位址 **24576**：

| 位址 | 功能 |
|------|------|
| 24576 | 鍵盤狀態暫存器：回傳當前按鍵的 ASCII 碼，無按鍵時為 0 |

與螢幕記憶體（16384–24575，共 8192 個 word）不同，鍵盤只有**一個 word**，不做持久儲存——每當有鍵被按下時，硬體自動更新這個暫存器的值。

### 靜態變數

| 變數 | 說明 |
|------|------|
| `keyboard` | 鍵盤暫存器的位址（24576），`keyboard[0]` 讀取該位址的值 |

與 `Memory.jack` 和 `Screen.jack` 的技巧相同，`keyboard` 是一個值為 24576 的 `Array`，使得 `keyboard[0]` 直接對應 RAM 位址 24576。

### 按鍵碼編碼表

| 碼值 | 按鍵 |
|------|------|
| 0 | 無按鍵 |
| 32–126 | 標準 ASCII 字元（空白到 `~`） |
| 128 | 換行（New line） |
| 129 | 退格（Backspace） |
| 130 | 左箭頭 |
| 131 | 上箭頭 |
| 132 | 右箭頭 |
| 133 | 下箭頭 |
| 134 | Home |
| 135 | End |
| 136 | Page Up |
| 137 | Page Down |
| 138 | Insert |
| 139 | Delete |
| 140 | ESC |
| 141–152 | F1–F12 |

碼值 128–152 超出了標準 ASCII 範圍（0–127），是 Jack OS 自定義的**擴展鍵碼**，與 `String.jack` 中的 `newLine()`（128）和 `backSpace()`（129）一致。

## 原理與實作細節

### init() — 初始化

```jack
function void init() {
    let keyboard = 24576;
}
```

僅設定 `keyboard` 指標指向鍵盤硬體暫存器的位址。這個初始化確保後續的 `keyboard[0]` 存取能正確對應到硬體。

### keyPressed() — 讀取當前按鍵

```jack
function char keyPressed() {
    return keyboard[0];
}
```

直接讀取 RAM 位址 24576 的值。這是一個**非阻塞**的調用——無論有沒有按鍵，函式都會立即回傳。若無按鍵，回傳 0；若有按鍵，回傳對應的鍵碼。

硬體的行為：當使用者按下某個個鍵時，鍵盤控制器自動將對應的掃描碼（scan code）轉換為 ASCII/擴展碼並寫入位址 24576。鍵被按住期間，值持續保持；鍵被釋放後，值歸零。

### readChar() — 等待並讀取一個字元

```jack
function char readChar() {
    var char key;
    while( Keyboard.keyPressed() = 0 ) {}     // 步驟一：等待按鍵
    let key = Keyboard.keyPressed();           // 步驟二：記錄按鍵
    while( ~(Keyboard.keyPressed() = 0) ) {}  // 步驟三：等待釋放
    do Output.printChar(key);                  // 步驟四：回顯到螢幕
    return key;
}
```

**流程分析：**

1. **等待按鍵（blocking wait）：** `while(keyPressed() = 0){}` 是一個空迴圈，持續輪詢鍵盤暫存器直到有鍵被按下。這是典型的**忙碌等待**（busy-waiting）模式。
2. **記錄按鍵：** 按下後立即讀取鍵碼並存入 `key`。
3. **等待釋放：** 繼續輪詢直到使用者鬆開按鍵（`keyPressed()` 回傳 0）。這一步確保一個按鍵動作只產生一個字元，避免按住鍵時連續重複輸入。
4. **回顯（echo）：** 將字元列印到螢幕上，讓使用者看到自己輸入了什麼。這模擬了終端機的「回送」（echo）功能。

**注意：** 步驟二中 `keyPressed()` 的回傳值可能與步驟一最後一次檢測時不同（如果使用者極快地按下並釋放按鍵），但這種邊界情況在實際使用中幾乎不會發生。

### readLine(message) — 讀取一行文字

```jack
function String readLine(String message) {
    var String line;
    var char c;
    do Output.printString(message);
    let line = String.new(50);
    let c = Keyboard.readChar();
    while( ~(c = String.newLine()) ) {
        if( c = String.backSpace() ) {
            do line.eraseLastChar();
        } else {
            do line.appendChar(c);
        }
        let c = Keyboard.readChar();
    }
    return line;
}
```

**流程：**

1. 印出提示訊息（`message`），如 `"Enter name: "`
2. 建立一個最大長度 50 的空字串
3. 逐字元讀取，直到收到換行字元（`String.newLine()` = 128）
4. 退格鍵（129）觸發 `eraseLastChar()`，其他字元追加到字串
5. 回傳完整的輸入字串

這是一個完整的**行編輯器**（line editor）——支援基本的退格刪除功能，模擬了終端機的行輸入行為。

### readInt(message) — 讀取整數

```jack
function int readInt(String message) {
    var String line;
    let line = Keyboard.readLine(message);
    return line.intValue();
}
```

利用 `readLine` 取得一行文字，再用 `String.intValue` 解析為整數。若輸入非數字字元，`intValue` 會在第一個非數字處停止解析。

## 測試與驗證

Keyboard 模組的測試需要與使用者互動：

1. 編譯所有 OS 模組
2. 在 CPU Emulator 中載入測試程式
3. 手動按鍵觀察輸出是否正確回顯
4. 測試退格功能是否正確刪除字元
5. 測試 `readInt` 對不同輸入的解析結果

自動化測試較難實現（因為需要模擬鍵盤輸入），通常需要在 CPU Emulator 的鍵盤模擬面板中手動操作。

## 延伸討論

此模組使用**輪詢**（polling）方式讀取鍵盤——程式主動反覆查詢硬體暫存器的狀態。這在單行程式的教學平台上是合理的，但在真實系統中，鍵盤輸入通常透過**中斷驅動**（interrupt-driven）方式處理：每當有鍵被按下，硬體觸發一個中斷信號，CPU 暫停當前工作跳轉到中斷處理程序（ISR）來讀取鍵碼。這避免了忙碌等待浪費 CPU 時脈的問題。

Hack 的鍵盤硬體非常簡化——只有一個暫存器，不區分按下與釋放事件，也不支援修飾鍵（Shift、Ctrl、Alt）的組合。真實的鍵盤控制器（如 PS/2 或 USB HID）會發送完整的掃描碼序列，包含按下（make code）和釋放（break code）事件，以及修飾鍵狀態。
