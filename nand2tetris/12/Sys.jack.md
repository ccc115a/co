# Sys.jack 程式說明

## 概述

`Sys.jack` 是 Jack OS 的系統啟動與控制模組，扮演整個作業系統的「入口點」角色。它負責初始化所有 OS 模組、啟動使用者程式、提供程式中止（halt）、錯誤報告（error）與延時等待（wait）等基本系統服務。在 Nand2Tetris 架構中，硬體重置後 CPU 從 ROM 的位址 0 開始執行 bootstrap code，最終呼叫 `Sys.init()`，由此展開整個軟體系統的執行。

## 架構總覽

`Sys` 是一個純 `class`（不含 instance 欄位），所有成員皆為 `function`（靜態方法）。它呼叫的初始化順序有嚴格的先後依賴：

```
Sys.init()
  ├── Math.init()      ← 建立 powers_of_two 陣列
  ├── Output.init()    ← 初始化螢幕基底位址、游標、字元映射表
  ├── Screen.init()    ← 初始化繪圖顏色
  ├── Keyboard.init()  ← 初始化鍵盤記憶體位址
  ├── Memory.init()    ← 初始化 free list 記憶體配置器
  ├── Main.main()      ← 執行使用者主程式
  └── Sys.halt()       ← 使用者程式結束後中止
```

初始化順序中 `Memory.init()` 放在較後面，是因為前面幾個模組的 `init()` 可能需要配置記憶體（如 `Math.init` 建立 `powers_of_two` 陣列、`Output.init` 建立 `charMaps` 與 `charMasks`），而 `Memory.init` 必須先設定好可用記憶體範圍才能被呼叫。不過在某些實作版本中，`Memory.init()` 會先於其他模組執行，此處的順序代表一種可行的安排。

## 原理

### 程式中止（halt）

在大多數作業系統中，「停機」是透過特殊硬體指令或系統呼叫實現的。然而 Hack 硬體沒有 `HALT` 指令。Jack OS 的解法極為簡潔：

```jack
function void halt() {
    while(true){}
    return;
}
```

`while(true){}` 產生一個空的無限迴圈，CPU 會永遠執行 `goto` 回到迴圈條件判斷， effectively 停止了任何有意義的運算。因為 Hack 沒有中斷機制也沒有電源管理，這是唯一可行的「停機」方式。`return` 永遠不會被執行到，寫在那裡只是為了滿足 Jack 語法對 `void` 函式的格式要求。

### 延時等待（wait）

`wait(duration)` 透過空迴圈消耗 CPU 時脈來模擬毫秒級延時：

```jack
function void wait(int duration) {
    var int i, j;
    let i = 0;
    while( i < duration ) {
        let j = 0;
        while( j < 200 ) { let j = j + 1; }
        let i = i + 1;
    }
}
```

外層迴圈跑 `duration` 次，內層迴圈固定跑 200 次空運算。在 Hack 硬體上，每條 VM 指令對應約 5–13 個時脈週期，內層 200 次迭代大約消耗數千個時脈，在標準 50 MHz 模擬器下約等於 1 毫秒。這是一個「校準過的忙碌等待」（busy-waiting），精確度取決於模擬器速度，但足以用於簡單的延時需求。

### 錯誤報告（error）

```jack
function void error(int errorCode) {
    do Output.printString("Err");
    do Output.printInt(errorCode);
    do Sys.halt();
}
```

錯誤代碼以 `"Err"` 加數字的形式顯示在螢幕上，然後停機。這在沒有除錯器的環境下是最基本的錯誤診斷方式——使用者看到錯誤代碼後可查表定位問題模組。

## 實作細節

`Sys.init()` 的 `return` 語句同樣不會被執行到——`Main.main()` 正常返回後會接著執行 `Sys.halt()`，而 `halt()` 是無限迴圈。這意味著一個正確的 Jack 程式不應該從 `Main.main()` 正常返回，否則會進入 halt 狀態。在實務上，`Main.main()` 通常是無限迴圈的遊戲主迴圈。

## 測試與驗證

在 Nand2Tetris 的 Jack 編譯器與 VM 翻譯器專案中，`Sys.jack` 通常是編譯順序中最先被編譯的檔案。可以透過以下步驟驗證：

1. 編譯所有 `.jack` 檔為 `.vm` 檔。
2. 在 CPU Emulator 中載入對應的 `.tst` 測試腳本（如 `Pong.tst`），觀察程式是否能正常初始化並執行。

## 延伸討論

在真實作業系統中，系統初始化遠比這裡複雜得多——涉及中斷向量表設定、記憶體保護頁面配置、處理器模式切換等。`Sys.halt()` 在真實硬體上對應的是 `HLT` 指令或 `ACPI` 關機序列。Jack OS 的 `wait()` 使用忙碌等待，真實 OS 則會使用硬體計時器中斷來實現非阻塞的睡眠。這些簡化是教學上的刻意選擇，讓學生先建立「系統軟體如何管理硬體資源」的基本概念。
