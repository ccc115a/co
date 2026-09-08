# Math.jack 程式說明

## 概述

`Math.jack` 是 Jack OS 的數學函式庫，提供基本的算術與數學運算。由於 Hack CPU 只有一條硬體乘法指令（`D*M`）和一條除法指令（`D/M`），但 Nand2Tetris 教材要求學生從純算術邏輯閘開始實作 ALU，不應假設乘除法可用，因此 Jack OS 的 `Math` 模組完全以**軟體方式**實作乘法、除法與平方根。這是最能體現「低層運算如何由基本操作構建」的 OS 模組之一。

## 架構總覽

| 函式 | 功能 | 演算法 |
|------|------|--------|
| `init()` | 初始化 `powers_of_two` 陣列 | 預計算 2⁰–2¹⁵ |
| `bit(x, n)` | 取得 x 的第 n 位元 | 位元遮罩 AND |
| `two_to_the(p)` | 回傳 2^p | 查表 |
| `abs(x)` | 絕對值 | 條件取反 |
| `multiply(x, y)` | 乘法 | 重複加法 + 位元掃描 |
| `divide(x, y)` | 除法  | 遞迴二進位除法 |
| `mod(x, y)` | 取餘數 | 利用 divide 計算 |
| `sqrt(x)` | 平方根 | 二進位逐位元逼近 |
| `max(a, b)` / `min(a, b)` | 最大/最小值 | 比較 |

## 原理與實作細節

### init() — 預計算 2 的冪次

```jack
function void init() {
    let powers_of_two = Array.new(16);
    let powers_of_two[0] = 1;
    let powers_of_two[1] = 2;
    ...
    let powers_of_two[15] = 16384 + 16384;  // = 32768 = 2¹⁵
}
```

建立一個包含 16 個元素的陣列，存放 2⁰ 到 2¹⁵ 的值。注意 `2¹⁵ = 32768` 超過了 16-bit 有號整數的正數範圍（最大 32767），所以用 `16384 + 16384` 計算。在 Hack 的 16-bit 二進位補數運算中，32768 的位元模式為 `1000000000000000`，代表 -32768，但作為無號解讀就是 32768。這裡依賴的是位元模式而非數值正負。

`powers_of_two` 被所有算術函式共用，避免重複計算。`bit(x, n)` 函式利用它來判斷 x 的第 n 個位元是否為 1：

```jack
function boolean bit(int x, int n) {
    return ~((x & powers_of_two[n]) = 0);
}
```

`x & powers_of_two[n]` 做位元 AND：若第 n 位為 1，結果非零，取補數後為 -1（true）；若為 0，取補數後為 0（false）。

### multiply(x, y) — 以重複加法實作乘法

```jack
function int multiply(int x, int y) {
    var int sum, shiftedX;
    var int j;
    let sum = 0;
    let shiftedX = x;
    let j = 0;
    while( j < 16 ) {
        if(Math.bit(y, j)) {
            let sum = sum + shiftedX;
        }
        let shiftedX = shiftedX + shiftedX;
        let j = j + 1;
    }
    return sum;
}
```

**核心原理：** 任何整數 y 都可以表示為二進位形式：

```
y = b₁₅·2¹⁵ + b₁₄·2¹⁴ + ... + b₁·2¹ + b₀·2⁰
```

因此：

```
x × y = x × (b₁₅·2¹⁵ + ... + b₀·2⁰)
      = b₀·(x) + b₁·(2x) + b₂·(4x) + ... + b₁₅·(32768x)
```

演算法從最低位元開始掃描 y 的每個位元 `bⱼ`：
- `shiftedX` 持有 `x × 2ʲ`（每次迴圈左移一位，即乘以 2）
- 若 `bⱼ = 1`，將 `shiftedX` 累加到 `sum`
- 每次迴圈結束 `shiftedX` 左移一位（`shiftedX + shiftedX`）

**時間複雜度：** 固定 16 次迴圈迭代，每次最多一次加法，共 O(16) = O(1)。

**溢位注意：** 此實作不處理溢位。若 `x × y` 超過 16-bit 有號整數範圍（-32768 到 32767），結果會以模 2¹⁶ 的方式截斷。

### divide(x, y) — 遞迴二進位除法

```jack
function int divide(int x, int y) {
    var int neg_x, neg_y;
    var int q;
    var int result;
    let neg_x = x < 0;
    let neg_y = y < 0;
    let x = Math.abs(x);
    let y = Math.abs(y);
    if( y > x ) { return 0; }
    let q = Math.divide(x, y + y);        // 遞迴：先試商數 / 2
    if( x - (2 * q * y) < y ) {
        let result = q + q;
    }
    else {
        let result = q + q + 1;
    }
    if( neg_x = neg_y ) { return result; }
    else { return -result; }
}
```

**核心原理：** 這是一個基於**二進位分解**的除法，概念類似長除法但以位元為單位。其數學基礎：

```
x ÷ y = q
讓 q 的二進位為 q = qₙ·2ⁿ + ... + q₁·2 + q₀

等價地：x = q × y + r，其中 0 ≤ r < y
```

演算法的遞迴結構：

1. **基底條件：** 若 `y > x`，商為 0。
2. **遞迴步驟：** 先計算 `x ÷ (2y)` 得到 `q`（即「把 y 左移一位做除法」）。
3. **判斷位元：** 計算剩餘 `r = x − 2q·y`。若 `r < y`，則此位元為 0，商為 `2q`；若 `r ≥ y`，此位元為 1，商為 `2q + 1`。
4. **符號處理：** 最後根據 x、y 是否同號決定結果正負。

這個遞迴的深度等於結果商數的位元數（最多 16 層），每層做常數量的運算，因此時間複雜度為 O(log q)。

**具體範例：** `divide(47, 7)` 的遞迴展開：

```
divide(47, 7)
  → q = divide(47, 14) 
    → q = divide(47, 28)
      → q = divide(47, 56)
        → 56 > 47, return 0
      → r = 47 − 0 = 47 ≥ 28, return 2×0+1 = 1
    → r = 47 − 2×1×14 = 19 ≥ 14, return 2×1+1 = 3
  → r = 47 − 2×3×7 = 5 < 7, return 2×3 = 6
  結果: 47 ÷ 7 = 6 ✓（餘數 5）
```

### mod(x, y) — 取餘數

```jack
function int mod(int x, int y) {
    var int q;
    let q = Math.divide(x, y);
    return x - (q * y);
}
```

利用 `x mod y = x − ⌊x/y⌋ × y` 的定義，先呼叫 `divide` 取得整數商，再反算餘數。時間複雜度取決於 `multiply` 和 `divide`，均為常數級。

### sqrt(x) — 二進位逐位元逼近平方根

```jack
function int sqrt(int x) {
    var int j, y;
    var int approx;
    var int approx_squared;
    let y = 0;
    let j = 7;      // = 16 / 2 − 1
    while( ~(j < 0) ) {
        let approx = y + powers_of_two[j];
        let approx_squared = approx * approx;
        if( ~(approx_squared > x) & (approx_squared > 0) ) {
            let y = approx;
        }
        let j = j - 1;
    }
    return y;
}
```

**核心原理：** 這是一個**二進位逐位元**的平方根算法，本質上是「從最高有效位元開始，逐位確定平方根的每個位元」。

數學上，求 `√x` 等價於找最大的整數 `y` 使得 `y² ≤ x`。演算法從最高位元（bit 7）開始，逐位嘗試：

1. 從 `y = 0` 開始，從 bit 7 往 bit 0 掃描。
2. 在第 j 步，嘗試把 bit j 設為 1：令 `approx = y + 2ʲ`。
3. 若 `approx² ≤ x`，則此位元為 1，接受：`y = approx`。
4. 若 `approx² > x`，則此位元為 0，不接受。

因為 16-bit 數的最大平方根為 `√32767 ≈ 181`，最多需要 8 個位元（bit 7 到 bit 0），所以從 `j = 7` 開始。

**溢位保護：** 條件 `approx_squared > 0` 是為了防止 `approx * approx` 溢位變成負數時的錯誤判斷。若乘法結果溢位為負，`approx_squared > x` 為假（負數不大於正數），但同時 `approx_squared > 0` 也為假，因此不會錯誤接受。

**範例：** `sqrt(144)`

```
y=0, j=7: approx=128, 128²=16384 > 144, 不接受
y=0, j=6: approx=64,  64²=4096  > 144, 不接受
y=0, j=5: approx=32,  32²=1024  > 144, 不接受
y=0, j=4: approx=16,  16²=256   > 144, 不接受
y=0, j=3: approx=8,   8²=64     ≤ 144, 接受, y=8
y=8, j=2: approx=12,  12²=144   ≤ 144, 接受, y=12
y=12, j=1: approx=14, 14²=196   > 144, 不接受
y=12, j=0: approx=13, 13²=169   > 144, 不接受
結果: y = 12 ✓
```

### max(a, b) / min(a, b)

直接的條件比較，無特殊演算法。Jack 沒有三元運算符，所以使用 `if-else` 結構回傳較大或較小值。

## 測試與驗證

Math 模組的正確性至關重要——所有其他 OS 模組都依賴它。測試重點包括：

- `multiply`：邊界值（含 0、-1、最大/最小值）、溢位行為
- `divide`：除以 0 的行為、負數除法的商數與餘數符號、邊界值
- `sqrt`：完全平方數（1, 4, 9, ...）、非完全平方數的取整結果、0 和 1 的特殊情況

在 VM Emulator 中載入 `MathTest` 腳本可自動化驗證。

## 延伸討論

真實 CPU 的乘除法器使用**組合邏輯**（如 Booth 乘法器、SRT 除法器）在數個時脈週期內完成運算，而非軟體迴圈。Hack 的 ALU 實際上也能在硬體層面執行乘除（透過 `D*M` 和 `D/M` 指令），所以此處的軟體實作主要具有教學意義：讓學生理解「如果沒有硬體乘除法，我們如何用加法和位元操作達成」。平方根的二進位逼近法在概念上類似牛頓法（Newton's method），但因為 Hack 不支援浮點運算，二進位逐位元法更適合整數環境。
