# Xor.hdl 程式說明

獨家或（Exclusive-or）閘：`out = not (a == b)`，兩個輸入相同出 0、不同出 1。

## 概述

`Xor` 是第一章的招牌組合電路，也是第一顆「新功能必須由既有元件重組」的範例。它只用 `Nand`、`Or`、`And` 三顆已建好的閘就拼出 XOR 行為；接線刻意避開「四 NAND」教科書版，改走「`NAND + OR` 再相乘」的路線，好讓讀者看到 De Morgan 定律的實際運用。（`00/Xor.hdl` 與本檔內容完全相同，是前置練習版本。）

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

`out = 1` ⇔「a 與 b 不相同」，所以註解寫成 `out = not (a == b)`。

## 原理

XOR 的標準布林代數式是 `(a AND NOT b) OR (NOT a AND b)`。本電路採用的是另一種等價寫法：

```
out = NOT(a AND b) AND (a OR b)
```

驗證（對照真值表）：

- `(0,0)`：`NAND → 1 AND OR=0 → 0` ✔
- `(0,1)`：`NAND → 1 AND OR=1 → 1` ✔
- `(1,0)`：`NAND → 1 AND OR=1 → 1` ✔
- `(1,1)`：`NAND → 0 AND OR=1 → 0` ✔

直觀理由：`NOT(a AND b)` 掐掉「兩者皆 1」的情況，`a OR b` 掐掉「兩者皆 0」的情況；兩者交集只剩「互異」時為 1。也可用 De Morgan 展開第二項驗證等價於標準式。

## 實作細節

```hdl
Nand (a=a, b=b, out= AnandB);
Or   (a=a, b=b, out= AorB);
And  (a=AnandB, b=AorB, out=out);
```

- `AnandB = NOT(a AND b)`：由 `Nand` 產生，代表「並非兩者都為 1」。
- `AorB = a OR b`：由 `Or` 產生，代表「至少一個為 1」。
- `And` 把兩條中間線相乘：`out = AnandB AND AorB`。

中間線 `AnandB`、`AorB` 是晶片內部接線，命名直接寫出前綴「A」「B」與閘名稱，讀原始碼即可還原電路拓樸。

## 測試與驗證

執行 `Xor.tst`：逐一設定 `(a,b) = (0,0)、(0,1)、(1,0)、(1,1)`，每次 `eval` 後寫出 `out`，並與 `Xor.cmp` 比對。`output-list a%B3.1.3 b%B3.1.3 out%B3.1.3` 表示三欄、每欄 3 格寬二進位。測試期望依序為 `0、1、1、0`。

## 延伸討論

- 第二章 `HalfAdder` 的「和位（sum）」就是 XOR：`sum = a XOR b`——不同則 1、同則 0，正好對應二進位一位相加而無進位。
- 「NAND 是萬能閘」：本電路的三顆組成元件各自都能改用 NAND 表達（`Or` 用 De Morgan、`Not` 併腳、`And` 雙重反相），因此整顆 XOR 最終可由 NAND-only 實現——這是第一章結尾「只用 NAND 建出整個電腦」願景的第一步示範。
- CPU 的比較運算 `a ≠ b` 常以 `XOR` 先求出位元差異，再用 OR 收斂結果是否為非零。