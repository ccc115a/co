# Main.jack 程式說明 — ConvertToBin 專案

將 RAM[8000] 的 16 位元整數解包為二進位表示，結果存入 RAM[8001]～RAM[8016]，每個位置存放 0 或 1。示範位元遮罩（bitmask）操作與記憶體直接存取。

## 概述

這是第 11 章中唯一不使用螢幕繪圖、而是直接操作 RAM 的範例。它展示了一個經典的位元運算技巧：用逐步倍增的遮罩（mask）從最低位到最高位逐一提取每個 bit。在 Nand2Tetris 體系中，這個範例同時考驗編譯器對位元運算子（`&`, `|`, `~`）的翻譯正確性。

## 架構總覽

```
class Main {
    function void main()                    ← 初始化並觸發轉換
    function void convert(int value)        ← 核心：用遮罩逐位提取
    function int nextMask(int mask)         ← 輔助：產生下一個遮罩
    function void fillMemory(start, len, v) ← 輔助：填充記憶體區段
}
```

## 原理

### 二進位提取：遮罩法

要將一個 16 位元整數 `value` 轉換為二進位，從最低位（bit 1）到最高位（bit 16），依序提取每一位：

```
bit i = (value & mask) ≠ 0 ? 1 : 0
```

其中 `mask` 從 `0000 0000 0000 0001`（1）開始，每次乘以 2（左移一位），依序為 `0010`, `0100`, `1000` ...

若 `value & mask` 的結果非零，表示該位為 1；為零則表示該位為 0。

| 步驟 | mask | mask 的二進位 | 作用 |
|------|------|---------------|------|
| 1 | 1 | `0000 0000 0000 0001` | 提取 bit 1（最低位） |
| 2 | 2 | `0000 0000 0000 0010` | 提取 bit 2 |
| 3 | 4 | `0000 0000 0000 0100` | 提取 bit 3 |
| ... | ... | ... | ... |
| 16 | 32768 | `1000 0000 0000 0000` | 提取 bit 16（最高位） |

### 記憶體佈局

| 位址 | 用途 |
|------|------|
| RAM[8000] | 輸入：待轉換的 16 位元整數 |
| RAM[8001]～RAM[8016] | 輸出：bit 1～bit 16 的值（0 或 1） |
| RAM[9001]～RAM[9016] | 除錯用：各步驟的 mask 值 |

## 實作細節

### main()：初始化與觸發

```jack
function void main() {
    do Main.fillMemory(8001, 16, -1);   // 先把 RAM[8001..8016] 設為 -1（用來驗證）
    let value = Memory.peek(8000);      // 從 RAM[8000] 讀取輸入值
    do Main.convert(value);             // 執行轉換
    return;
}
```

`Memory.peek(addr)` 直接讀取指定位址的值（對應 C 的 `*(int*)addr`）。`fillMemory` 先將輸出區段設為 -1，若轉換後某個位置仍為 -1，代表轉換未完成或有 bug。

### convert()：核心轉換邏輯

```jack
function void convert(int value) {
    var int mask, position;
    var boolean loop;

    let loop = true;

    while (loop) {
        let position = position + 1;        // 從 1 計數到 16
        let mask = Main.nextMask(mask);     // 取得下一個遮罩
        do Memory.poke(9000 + position, mask);  // 把 mask 存到 RAM[9000+pos]（除錯）

        if (~(position > 16)) {             // 若 position ≤ 16（`~(>16)` 等價於 `≤16`）

            if (~((value & mask) = 0)) {    // 若 value & mask ≠ 0（該位為 1）
                do Memory.poke(8000 + position, 1);   // 寫入 1
            }
            else {
                do Memory.poke(8000 + position, 0);   // 寫入 0
            }
        }
        else {
            let loop = false;               // 超過 16 位，結束
        }
    }
    return;
}
```

關鍵的位元運算：`~((value & mask) = 0)` 是 Jack 的「不等於零」判定。因為 Jack 沒有 `!=` 運算子，所以用 `~(x = 0)` 表達「x 不等於 0」。

`~(position > 16)` 同理，表示「position 不大於 16」即「position ≤ 16」。

### nextMask()：遮罩倍增

```jack
function int nextMask(int mask) {
    if (mask = 0) {
        return 1;           // 初始遮罩：bit 1
    }
    else {
        return mask * 2;    // 左移一位
    }
}
```

遮罩序列：`0 → 1 → 2 → 4 → 8 → ... → 32768`，共 16 個值。

### fillMemory()：區段填充

```jack
function void fillMemory(int startAddress, int length, int value) {
    while (length > 0) {
        do Memory.poke(startAddress, value);
        let length = length - 1;
        let startAddress = startAddress + 1;
    }
    return;
}
```

這是一個通用的記憶體填充函式，從 `startAddress` 開始連續寫入 `length` 個 `value`。

## 測試與驗證

在 VM Emulator 中：
1. 載入 `ConvertToBin/` 目錄下所有 `.vm` 檔
2. 在 RAM[8000] 寫入測試值（例如 19 = `0000 0000 0001 0011`）
3. 選擇「No Animation」，執行
4. 檢查 RAM[8001]～RAM[8016]：應分別為 `1,1,0,0,1,0,0,1,0,0,0,0,0,0,0,0`

確認所有位置都不是 -1（-1 表示未被覆寫）。

## 延伸討論

- **與 C 語言對照**：C 版本通常用 `for (int i = 0; i < 16; i++) bits[i] = (value >> i) & 1;`，利用右移取代左移遮罩。Jack 沒有 `>>` 位移運算子，所以用乘法倍增遮罩達成相同效果。
- **Jack 的位元運算限制**：Jack 只有 `&`（AND）、`|`（OR）、`~`（NOT），沒有 XOR、NOT（位元補數）以外的位元運算。`~` 在 Jack 中是布林否定（`-1 - x`），而 `&` 和 `|` 是位元運算，這點需要特別注意。
- **為何用 RAM[9000+] 記錄 mask**：這是除錯用途，讓使用者能檢查每一步的遮罩值是否正確。正式程式不需要這段。
- **位元順序問題**：RAM[8001] 存的是 bit 1（最低位），RAM[8016] 存的是 bit 16（最高位），這是小端序（little-endian）的展示方式。
