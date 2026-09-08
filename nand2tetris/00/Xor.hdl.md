# Xor.hdl 程式說明

獨家或（Exclusive-or）閘：`out = !(a == b)`，亦即當兩個輸入相等時輸出 0，不相等時輸出 1。

## 概述

`Xor` 是第一章布林邏輯中的第一個組合電路，也是第一個「非基本閘」。上一層的 `Nand` 已是公認的石器時代元件（Nisan 與 Schocken 一書第一課的起點），本電路刻意只用 `Nand`、`Or`、`And` 三個較低階閘來拼出 XOR，示範「由已完成的元件建造新元件」的分層建構手法。

這個電路常見於第二章的加法器與 ALU 中，因為「二進位相加」的核心就是一顆半加器的 XOR 行為（同為 1 時進位、互異時設 1）。

## 介面與規格

| IN/OUT | 名稱 | 寬度 |
|--------|------|------|
| IN | `a` | 1 bit |
| IN | `b` | 1 bit |
| OUT | `out` | 1 bit |

真值表：

| a | b | out |
|---|---|-----|
| 0 | 0 | 0   |
| 0 | 1 | 1   |
| 1 | 0 | 1   |
| 1 | 1 | 0   |

`out = 1` 恰好對應「a 與 b 不相同」；這就是註解 `!(a == b)` 的意義。

## 原理

XOR 的標準布林代數式：

```
a XOR b = (a AND NOT b) OR (NOT a AND b)
```

本檔案沒有走這條路，而是用另一種等價形式。因為 `NAND(a,b)` 的值就是 `NOT (a AND b)`，而 `OR(a,b)` 就是 `a OR b`，根據 De Morgan 定律：

```
NOT (a AND b) AND (a OR b)
= (NOT a OR NOT b) AND (a OR b)
= NOT (a XOR b) AND NOT (NOT (a XOR b)) ...
=(展開) a XOR b
```

其實直觀上也說得通：`NOT (a AND b)` 在「a、b 都為 1」時為 0，`a OR b` 在「a、b 都為 0」時為 0；兩者交集 + 相乘之後，只剩「互不相同」兩種情況為 1。所以：

```
out = NOT(a AND b) AND (a OR b)
```

## 實作細節

```hdl
Nand (a=a, b=b, out= AnandB);
Or   (a=a, b=b, out= AorB);
And  (a=AnandB, b=AorB, out=out);
```

三個 PARTS 的接線對應上式的三個項：

- `Nand` 產生中間線 `AnandB = NOT (a AND b)`。
- `Or` 產生中間線 `AorB = a OR b`。
- 最後 `And` 把兩條中間線相乘，得出 `out = AnandB AND AorB`。

中間線（internal pin）命名採用「運算 + 參數」的匈牙利式記法：`AnandB` 讀作「a Nand b」，`AorB` 讀作「a Or b」，一目了然。HDL 中只要線名從某個 `out=` 產生、之後又被喂進 `a=`/`b=`，就自動成為內部連線，不需另外宣告。

## 測試與驗證

00/ 目錄下沒有附 `.tst` 與 `.cmp` 測試檔，但本電路與 `01/Xor.hdl` 完全相同，直接使用 Hardware Simulator 即可：

1. 開啟 Hardware Simulator，選 `load` 載入 `Xor.hdl`。
2. 手動把兩個輸入腳釘成計數器走一圈：`(0,0) → (0,1) → (1,0) → (1,1)`。
3. 對照上方真值表檢查 `out` 依序為 `0、1、1、0`。

也可複製 01 目錄的 `Xor.tst` / `Xor.cmp` 過來，以 `compare-to` 自動比對。

## 延伸討論

- XOR 可只用四顆 NAND 做成，這就是「NAND 是萬能閘」的證明之一：任何布林函數都能只靠 NAND 建構。
- 本實作使用了一顆 `Or` 與一顆 `And`，它們各自又消耗數顆 NAND；若要最佳化電晶體數，會用「四 NAND」寫法。在 Nand2Tetris 的模擬環境中，電路面積不是目標，邏輯清晰才是。
- XOR 因為是「不相等」的天然判別器，在 CPU 中也被用來做比較（`a != b`），以及第二章加法器的半加器核心。