# Main.jack 程式說明 — Seven 專案

計算 `1 + (2 × 3)` 並將結果顯示在螢幕左上角，是整個 Jack 語言體系中最簡單的「Hello World」級範例。

## 概述

這是 Nand2Tetris 第 11 章的入門範例，示範一個最小可運行的 Jack 程式。整個程式只有一個 class、一個 function、一行印出指令。它的價值不在演算法，而在於讓初學者理解 Jack 程式的基本骨架以及作業系統（OS）提供的輸出服務如何被呼叫。

## 架構總覽

```
class Main {
    function void main()   ← 程式進入點（static function）
}
```

| 元素 | 說明 |
|------|------|
| `class Main` | Jack 程式的最外層容器，與 Java 不同，Jack 的 class 不需要 `public` 修飾詞 |
| `function void main()` | static function（不是 method），由 OS 的啟動碼呼叫，是整個程式的進入點 |
| `do Output.printInt(...)` | 呼叫 OS 內建類別 `Output` 的 function，將整數印到螢幕 |
| `return;` | void function 的結束語句 |

## 原理

### 運算式求值

`1 + (2 * 3)` 是一個常數運算式，編譯器會在編譯期直接計算出結果 `7`（或在 VM 層級產生 push 常數再做加法的指令）。最終產出的 VM 程式碼大致等價於：

```
push constant 7
call Output.printInt 1
```

### Jack 的程式進入流程

1. 硬體啟動後，OS 的 bootstrap 程式（由編譯器自動生成）會呼叫 `Main.main()`。
2. `main()` 是 `static function`，不綁定任何物件實例（隱含的 `this` 參數為 0）。
3. 執行完畢後，程式停在無限迴圈中（OS 負責），不會回到「作業系統」。

### `do` 與 `let` 的語法角色

| 關鍵字 | 用途 |
|--------|------|
| `do` | 呼叫回傳值為 `void` 的 function/method（有副作用但不需接收回傳值） |
| `let` | 給變數賦值（本例未使用，但後續範例會大量使用） |
| `return` | 結束 function 並回傳控制權；若為 `void` 則不帶回傳值 |

## 實作細節

這個程式只有五行有效程式碼（不含註解與空白），逐行對應：

```jack
class Main {                        // 宣告一個 class，OS 會寻找 Main.main()
   function void main() {           // static function：無需 this 指標
       do Output.printInt(1 + (2 * 3));  // 呼叫 OS 輸出服務，括號內為運算式
       return;                      // 結束 main()
   }
}
```

`Output.printInt` 是 OS 提供的 function（定義在 `Output` 類別中），它接收一個 `int` 參數，將其轉換成十進位字串後顯示在螢幕游標位置。這是 Nand2Tetris 處理作業系統時定義的十三個標準類別之一。

## 測試與驗證

在 VM Emulator 中載入 `Seven/` 目錄下所有 `.vm` 檔（由 Jack 編譯器產生），按下「Run」後應在螢幕左上角看到數字 **7**。也可透過「No Animation」模式執行後檢查 VM 的靜態記憶體區段是否正確。

## 延伸討論

- **與 C 語言比較**：C 的 `printf("%d", 1 + 2 * 3);` 會被預處理器和編譯器展開為一系列系統呼叫；Jack 的 `Output.printInt` 則呼叫 OS 提供的印刷函式，概念相同但底層是 VM 層級的呼叫。
- **為何是 function 而非 method**：`main()` 不需要物件狀態，所以用 `static function`（對應 Java 的 `static void main(String[] args)`）。Jack 省略了命令列參數，因為 OS 的啟動協定不需要。
- **擴展方向**：嘗試加入 `Keyboard.readInt` 讀取使用者輸入，或呼叫 `Screen.drawPixel` 畫點，感受更多 OS 服務。
