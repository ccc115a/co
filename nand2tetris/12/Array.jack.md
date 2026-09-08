# Array.jack 程式說明

## 概述

`Array.jack` 是 Jack 語言中陣列型別的底層實作。在 Nand2Tetris 的 Jack 語言規範中，所有物件（包括 Array 本身）都透過 `Memory.alloc` 從堆積配置。`Array` 類別提供兩個核心操作：建立陣列與釋放陣列，是 String、Output 等其他 OS 模組的基礎構件。

## 架構總覽

`Array` 類別極為精簡，僅有一個 `function` 和一個 `method`，不含任何 instance 欄位。它的設計哲學是：陣列在記憶體中就是一段連續的 word，不需要額外的元資料（如長度），長度由使用者自行追蹤。

| 成員 | 型別 | 說明 |
|------|------|------|
| `Array.new(size)` | `function` | 靜態建構函式，配置 `size` 個 word 的記憶體並回傳指標 |
| `dispose()` | `method` | 釋放此陣列佔用的記憶體 |

## 原理

### Array.new(size)

```jack
function Array new(int size) {
    return Memory.alloc(size);
}
```

這是一個極度簡化的建構函式——它直接呼叫 `Memory.alloc(size)` 並回傳結果。`Memory.alloc` 回傳的指標指向配置區塊的使用空間起始位置（跳過 header），因此這個指標可以直接當作陣列基底使用：`arr[i]` 會從基底位置開始偏移 `i` 個 word 來存取。

在 Jack 語言中，陣列索引的界限檢查（bounds checking）並非語言內建的，而是依賴編譯器產生的陣列存取碼。這裡的 `Array.new` 也不做任何檢查——如果 `size` 為 0 或負數，`Memory.alloc` 的行為取決於其內部實作（可能回傳 `null` 或產生未定義行為）。

### dispose()

```jack
method void dispose() {
    do Memory.deAlloc(this);
}
```

`this` 在一個 `method` 中指向呼叫此方法的物件本身（即陣列的基底指標）。但要注意：`Memory.deAlloc` 期望收到的參數是**已配置區塊的使用空間起始位置**（即 `alloc` 回傳的指標），而 `this` 正是這個值。`deAlloc` 會自動回退到 header 來取得區塊大小等資訊。

## 實作細節

### 陣列在記憶體中的佈局

```
addr+0:  [ALLOC_SIZE]  ← deAlloc 用的 header（使用者看不見）
addr+1:  arr[0]        ← alloc 回傳的指標指向這裡
addr+2:  arr[1]
addr+3:  arr[2]
...
addr+N:  arr[N-1]
```

使用者透過 `Array.new(N)` 取得 `addr+1` 的指標，之後以 `arr[i]` 存取 `addr+1+i` 處的值。這個佈局完全依賴 `Memory.alloc` 的 header 結構。

### 無型別設計

Jack 是一個弱型別語言，`Array` 可以儲存任何 16-bit 的值——整數、字元、物件指標，甚至其他陣列的指標。這與 C 語言的 `void*` 或 `int*` 類似，讓 `Array` 成為 Jack 中最通用的資料結構。

## 測試與驗證

驗證 `Array.jack` 的基本方法是編寫一個簡單程式：

```jack
class Main {
    function void main() {
        var Array a;
        var int i;
        let a = Array.new(10);
        let i = 0;
        while (i < 10) {
            let a[i] = i * i;
            let i = i + 1;
        }
        do a.dispose();
    }
}
```

在 VM Emulator 中編譯並執行，檢查記憶體內容是否正確寫入平方值。

## 延伸討論

在真實的程式語言實作中，陣列物件通常會攜帶額外的元資料——例如長度（用於執行期邊界檢查）、元素型別（用於泛型或序列化）、垃圾回收標記等。Java 的陣列物件有一個 `length` 欄位，Python 的 `list` 則維護容量與實際長度。Jack 的 `Array` 拋棄了這些便利性，以最小的記憶體開銷提供最原始的記憶體區塊存取能力，這反映了教學平台上「夠用就好」的設計原則。
