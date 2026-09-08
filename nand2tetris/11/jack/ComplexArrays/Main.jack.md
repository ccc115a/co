# Main.jack 程式說明 — ComplexArrays 專案

示範多維陣列模擬、巢狀索引運算以及指標語意的進階用法，透過一系列陣列操作驗證 Jack 對記憶體的精確控制。

## 概述

ComplexArrays 是陣列操作的進階練習。它透過五個測試，展示：陣列的陣列（二維陣列模擬）、以運算式作為索引、指標代入另一個指標（`c = c[0]`）等技巧。這是理解「Jack 的 Array 就是指標」這一核心概念的最佳範例。

## 架構總覽

```
class Main {
    function void main()           ← 主程式，執行五個測試
    function int double(int a)     ← 輔助函式：回傳 a * 2
    function void fill(Array a, int size) ← 輔助函式：為陣列的每個元素配置新的 Array
}
```

| 元素 | 角色 |
|------|------|
| `main()` | static function，依次執行測試並印出結果 |
| `double(int a)` | static function，示範 Jacob 呼叫另一個 static function |
| `fill(Array a, int size)` | static function，為陣列的每個元素配置子陣列（模擬二維陣列） |

## 原理

### Jack 的 Array 即指標

在 Jack 中，`Array.new(n)` 回傳的是一個指向連續 n 個 word 的指標。`a[i]` 等同於 `*(a + i)`，因此：

- `a[3]` 的值可以拿來當索引：`b[a[3]]` 等同於 `b[*(a+3)]`
- 指標本身可以被指派：`c = c[0]` 就是把 `c` 所指的第一個 word 讀出來，當作新的指標

### 二維陣列的模擬

Jack 沒有真正的二維陣列語法，但可以透過「陣列的陣列」來模擬：

```
a[0] → 指向另一個 Array（例如長度 3）
a[1] → 指向另一個 Array（例如長度 3）
...
```

`fill()` 函式正是做這件事：為 `a` 的每個元素呼叫 `Array.new(3)`，使 `a` 變成一個「每列 3 個元素」的二維結構。存取 `a[i][j]` 等同於 `a[i]` 取得子陣列指標後再 `[j]` 索引。

## 實作細節

### 測試 1～3：巢狀索引與指標操作

```jack
let a[3] = 2;          // a[3] = 2
let a[4] = 8;          // a[4] = 8
let a[5] = 4;          // a[5] = 4
let b[a[3]] = a[3] + 3;  // b[2] = 2 + 3 = 5      ← 以 a[3] 的值當索引
let a[b[a[3]]] = a[a[5]] * b[7 - a[3] - Main.double(2) + 1];
                        // a[5] = a[4] * b[7-2-4+1] = 8 * b[2] = 8 * 5 = 40
```

注意第二行的索引表達式 `7 - a[3] - Main.double(2) + 1`：
- `a[3]` = 2, `Main.double(2)` = 4
- 結果 = `7 - 2 - 4 + 1 = 2`，所以取 `b[2]` = 5

```jack
let c[0] = null;       // c 的第一個 word 設為 null（0）
let c = c[0];           // c 現在指向 null（c 的值為 0）
```

`c[0]` 本質上是 `*(c+0) = *c`，把 c 所指位址的內容讀出來。這示範了「指標的指標」操作。

### 測試 4～5：二維陣列模擬

```jack
let c = null;                   // c = 0

if (c = null) {                 // 條件成立，進入
    do Main.fill(a, 10);        // 為 a[0]~a[9] 各配置長度 3 的子陣列
    let c = a[3];               // c 指向 a[3]（長度 3 的子陣列）
    let c[1] = 33;              // a[3][1] = 33
    let c = a[7];               // c 改指向 a[7]
    let c[1] = 77;              // a[7][1] = 77
    let b = a[3];               // b 也指向 a[3]
    let b[1] = b[1] + c[1];    // b[1] = 33 + 77 = 110（注意：b 和 c 指向不同子陣列）
}
```

### 輔助函式

```jack
function int double(int a) {
    return a * 2;               // 靜態函式，回傳 a 的兩倍
}

function void fill(Array a, int size) {
    while (size > 0) {
        let size = size - 1;
        let a[size] = Array.new(3);  // 為每個元素配置長度 3 的子陣列
    }
    return;
}
```

`fill` 從尾端開始填充，確保每個 `a[i]` 都被指派為新配置的 `Array`。

## 測試與驗證

在 VM Emulator 中載入 `ComplexArrays/` 目錄下所有 `.vm` 檔。執行後應依序印出：

```
Test 1 - Required result: 5, Actual result: 5
Test 2 - Required result: 40, Actual result: 40
Test 3 - Required result: 0, Actual result: 0
Test 4 - Required result: 77, Actual result: 77
Test 5 - Required result: 110, Actual result: 110
```

若任何 Actual result 與 Required result 不符，代表編譯器的陣列索引翻譯有誤。

## 延伸討論

- **與 C 語言對照**：C 的 `int **a` + `a[i][j]` 與 Jack 的 `Array a` + `a[i][j]` 概念完全相同。C 的 `malloc` 對應 `Array.new`，`free` 對應 `Memory.deAlloc`。
- **記憶體洩漏風險**：`fill()` 為 10 個元素各配置了 `Array.new(3)`，但程式中沒有呼叫 `Memory.deAlloc` 來釋放這些子陣列。在長時間執行的程式中這是必須處理的問題。
- **編譯器考點**：這個範例專門測試編譯器如何處理 `a[b[c[d]]]` 這類巢狀陣列索引，以及以運算式結果作為索引的正確性。
- **null 的語意**：`null` 在 Jack 中就是整數 0，同時也是所有物件指標的「空值」。將物件指標設為 `null` 後再使用會導致未定義行為。
