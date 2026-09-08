# String.jack 程式說明

## 概述

`String.jack` 實作 Jack 語言的字串型別。在 Nand2Tetris 的 Jack 語言中，字串是一個可變長度的字元序列，內部以固定大小的 `Array` 緩衝區儲存，搭配一個整數欄位追蹤實際字元數。此模組提供字串的建立/銷毀、字元存取、字元追加/刪除、字串與整數的雙向轉換，以及常用控制字元的常數函式。

## 架構總覽

### Instance 欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `buffer` | `Array` | 儲存字元的底層陣列 |
| `buffer_len` | `int` | 緩衝區的最大容量（建立時決定，不可變） |
| `str_len` | `int` | 當前字串的實際長度（0 到 `buffer_len`） |

### Public API

| 函式 | 回傳值 | 說明 |
|------|--------|------|
| `String.new(maxLength)` | `String` | 建立空字串，最大長度為 `maxLength` |
| `dispose()` | `void` | 釋放底層 buffer |
| `length()` | `int` | 回傳當前字串長度 |
| `charAt(j)` | `char` | 回傳第 j 個字元 |
| `setCharAt(j, c)` | `void` | 將第 j 個字元設為 c |
| `appendChar(c)` | `String` | 追加字元到末尾，回傳 this |
| `eraseLastChar()` | `void` | 刪除最後一個字元 |
| `intValue()` | `int` | 將字串解析為整數 |
| `setInt(number)` | `void` | 將整數轉為字串表示 |
| `newLine()` | `char` | 回傳換行符（128） |
| `backSpace()` | `char` | 回傳退格鍵（129） |
| `doubleQuote()` | `char` | 回傳雙引號（34） |

## 原理與實作細節

### String.new(maxLength) — 建構

```jack
constructor String new(int maxLength) {
    if( maxLength = 0 ) { let maxLength = 1; }
    let buffer = Array.new(maxLength);
    let buffer_len = maxLength;
    let str_len = 0;
    return this;
}
```

建立一個容量為 `maxLength` 的空字串。`maxLength = 0` 時修正為 1，確保至少有 1 個 word 的緩衝區。此時 `str_len = 0`，表示字串為空。使用者可以在這塊緩衝區中追加最多 `maxLength` 個字元。

**注意：** 這裡使用 `constructor` 而非 `function`，因為它是建立物件實例的建構函式，需要分配記憶體並設定 instance 欄位。

### appendChar(c) — 追加字元

```jack
method String appendChar(char c) {
    if( str_len < buffer_len ) {
        let buffer[str_len] = c;
        let str_len = str_len + 1;
    }
    return this;
}
```

若緩衝區未滿，將字元寫入 `buffer[str_len]` 並遞增長度。若已滿則什麼都不做（靜默失敗）。回傳 `this` 允許鏈式呼叫：`s.appendChar('a').appendChar('b')`。

這是一個**固定容量**的字串——不像 C 的 `malloc`+`realloc` 那樣能動態擴展。使用者必須在建立時預估足夠的容量。

### eraseLastChar() — 刪除末尾字元

```jack
method void eraseLastChar() {
    if( str_len > 0 ) {
        let str_len = str_len - 1;
    }
}
```

僅遞減 `str_len`，不實際清除 `buffer` 中的資料。被「刪除」的字元仍然留在記憶體中，只是不再被視為字串的一部分。下次 `appendChar` 時會覆蓋該位置。

### intValue() — 字串轉整數

```jack
method int intValue() {
    var int int_val;
    var int i;
    var boolean neg;
    let int_val = 0;
    if( (str_len > 0) & (buffer[0] = 45) ) {   // '-' 的 ASCII 碼
        let neg = true;
        let i = 1;
    } else {
        let neg = false;
        let i = 0;
    }
    while( (i < str_len) & String.is_digit(buffer[i]) ) {
        let int_val = (int_val * 10) + String.digit_val(buffer[i]);
        let i = i + 1;
    }
    if( neg ) { return -int_val; }
    else { return int_val; }
}
```

**核心原理：** 逐字元掃描，利用 Horner 法則累加數值：

```
"123" → (((0×10 + 1) × 10 + 2) × 10 + 3) = 123
```

- 先判斷首字元是否為 `'-'`（ASCII 45），決定正負號
- 每個數字字元 `'0'`–`'9'`（ASCII 48–57）轉為數值：`digit_val(c) = c - 48`
- 遇到非數字字元時停止掃描

`is_digit(c)` 的判斷使用位元運算：

```jack
function boolean is_digit(char c) {
    return ~(c < 48) & ~(c > 57);
}
```

等價於 `c >= 48 && c <= 57`。在 Jack 中，`~(a < b)` 等價於 `a >= b`（因為布林值 -1/0 的補數）。

### setInt(number) — 整數轉字串

```jack
method void setInt(int number) {
    let str_len = 0;    // 清空字串
    if( number < 0 ) {
        let number = -number;
        do appendChar(45);   // 前置 '-'
    }
    do do_set_int(number);
}
```

```jack
method void do_set_int(int number) {
    var int q, mod;
    var char c;
    let q = number / 10;
    let mod = number - (q * 10);
    let c = String.digit_char(mod);   // digit_char(i) = i + 48

    if( number < 10 ) {
        do appendChar(c);
    } else {
        do do_set_int(q);     // 遞迴：先處理高位數
        do appendChar(c);     // 再追加低位數
    }
}
```

**核心原理：** 數字轉字串的經典方法——反覆除以 10 取餘數。但餘數產生的順序是**從最低位到最高位**（例如 123 產生 3, 2, 1），而字串需要**從最高位到最低位**排列。這裡用**遞迴**解決這個問題：

1. 先遞迴呼叫 `do_set_int(q)` 處理商數（高位部分）
2. 回傳後再 `appendChar` 追加餘數（低位部分）

遞迴的基底條件是 `number < 10`（個位數），直接追加即可。

**具體範例：** `setInt(123)` 的執行過程：

```
do_set_int(123): q=12, mod=3, c='3'
  do_set_int(12): q=1, mod=2, c='2'
    do_set_int(1): number < 10, appendChar('1')
    appendChar('2')
  appendChar('3')
結果: "123" ✓
```

### 特殊字元常數

```jack
function char newLine()    { return 128; }
function char backSpace()  { return 129; }
function char doubleQuote() { return 34; }
```

這些字元在標準 ASCII 範圍之外（128–129），是 Jack OS 自定義的控制字元。它們與 `Keyboard.jack` 中的擴展鍵碼一致（New line = 128, Backspace = 129）。`doubleQuote` 回傳 34，即標準 ASCII 的 `"` 字元。

## 測試與驗證

String 模組的測試重點：

- **建立與銷毀：** 建立不同大小的字串，確認 `length()` 回傳 0
- **追加與讀取：** 連續追加多個字元後，逐字檢查 `charAt` 的回傳值
- **溢位保護：** 追加超過 `maxLength` 個字元，確認不會越界寫入
- **整數轉換：** 測試 `setInt` 與 `intValue` 的互逆性（`intValue(setInt(n)) = n`）
- **負數與邊界值：** 0、-1、32767（16-bit 最大值）的轉換正確性

## 延伸討論

此實作是**固定容量字串**，類似 C 的 `char` 陣列。真實系統的字串實作通常支援動態擴展（如 C++ 的 `std::string`、Java 的 `String`），會在容量不足時重新配置更大的緩衝區並複製內容。Jack 的簡化設計避免了動態擴展的複雜性，但也限制了字串的使用場景——例如無法安全地串接兩個未知長度的字串。在 Output 模組中，`printString` 逐字元輸出字串，不需要字串的內部以 null 結尾，這是一個與 C 不同的設計選擇。
