# Main.jack 程式說明 — Average 專案

從鍵盤輸入 n 個整數，計算並印出它們的算術平均值。本範例示範 Jack 語言的輸入/輸出、陣列操作與迴圈控制。

## 概述

Average 是一個典型的「輸入→處理→輸出」流程範例。它展示如何使用 `Keyboard` 類別讀取使用者輸入、以 `Array` 類別動態配置記憶體存放資料，並用 `while` 迴圈完成累加與計算。這是理解 Jack 語言陣列語意（Array 本質上是指標）的最佳入門。

## 架構總覽

```
class Main {
    function void main()        ← 程式進入點
}
```

| 元素 | 說明 |
|------|------|
| `var Array a` | 區域變數，型別為 `Array`（本質上是記憶體位址，即指標） |
| `var int length, i, sum` | 區域整數變數 |
| `Keyboard.readInt(...)` | OS 服務：印出提示字串，等待使用者輸入整數並回傳 |
| `Array.new(length)` | OS 服務：配置 length 個 word 的連續記憶體，回傳起始位址 |
| `a[i]` | 陣列索引取值（等同於 `*(a + i)`，指標語意） |

## 原理

### 陣列在 Jack 中的本質

Jack 的 `Array` 是一個包裝過的指標。`Array.new(n)` 配置 n 個 word 的連續記憶體並回傳起始位址。`a[i]` 實際上是 `*(a + i)`，即從基底位址偏移 i 個 word 取值。這與 C 語言的陣列語意完全相同。

```
Array.new(5)   → 配置 5 個 word → 回傳位址（例如 3000）
a[0]            → Memory[3000]
a[1]            → Memory[3001]
...
a[4]            → Memory[3004]
```

### 算術平均值

平均值公式：`average = (Σ a[i]) / n`，其中 n = length。程式使用兩次 `while` 迴圈：第一次讀取輸入填入陣列，第二次累加所有元素。

## 實作細節

### 第一階段：讀取輸入

```jack
let length = Keyboard.readInt("How many numbers? ");  // 印出提示、讀入 n
let a = Array.new(length);                            // 配置 n 個 word 的陣列
let i = 0;

while (i < length) {
    let a[i] = Keyboard.readInt("Enter the next number: ");  // 逐一讀入
    let i = i + 1;
}
```

- `Keyboard.readInt` 會先在螢幕上印出括號內的字串，再等待使用者輸入並按 Enter，回傳對應的整數。
- `let a[i] = ...` 是對陣列元素的寫入，編譯器會將其翻譯為 `push a`, `push i`, `add`, `pop pointer 1`, `pop that 0` 等 VM 指令。

### 第二階段：累加求和

```jack
let i = 0;
let sum = 0;

while (i < length) {
    let sum = sum + a[i];   // 累加
    let i = i + 1;
}
```

### 第三階段：輸出結果

```jack
do Output.printString("The average is: ");
do Output.printInt(sum / length);   // 整數除法
do Output.println();                // 換行
```

注意 `sum / length` 是整數除法（Jack 沒有浮點數），結果會捨去小數部分。

### 變數一覽

| 變數 | 型別 | 作用域 | 用途 |
|------|------|--------|------|
| `length` | int | 區域 | 使用者輸入的數字個數 |
| `a` | Array | 區域 | 動態配置的整數陣列 |
| `i` | int | 區域 | 迴圈計數器 |
| `sum` | int | 區域 | 累加總和 |

## 測試與驗證

在 VM Emulator 中載入 `Average/` 目錄下所有 `.vm` 檔。程式執行後：
1. 螢幕顯示 "How many numbers? "，輸入例如 `3`
2. 依序顯示 "Enter the next number: "，分別輸入 `10`, `20`, `30`
3. 最終印出 "The average is: 20"

可嘗試不同組合（含負數、邊界值如 1 個數字）驗證正確性。

## 延伸討論

- **整數除法的限制**：`10 / 3 = 3` 而非 `3.33`。若需精確平均，可先乘以 10 或 100 再除，或擴充 OS 加入浮點支援。
- **記憶體洩漏**：Jack 沒有自動記憶體回收（垃圾收集），`Array.new` 配置的記憶體需對應呼叫 `Memory.deAlloc` 才能釋放。本例因程式即將結束所以省略。
- **與 C 語言對照**：C 版本為 `scanf("%d", &a[i])` + `printf("%d", sum/n)`；Jack 用 `Keyboard.readInt` 和 `Output.printInt` 替代，概念一致。
- **為何用 `var` 而非 `let`**：`var` 宣告一個新的局部變數並配置其棧空間；`let` 是對已存在變數的賦值。
