# And.hdl 程式說明

及閘（AND gate）：`out = 1` 若且唯若 `a`、`b` 都為 1，否則 `out = 0`。

## 概述

`And` 是第一章第二顆由 Nand 派生的基本閘。只用兩顆 NAND：第一顆 NAND 算出「不合」的信號，第二顆 NAND 把它再反相一次，得到「兩者皆 1」。這個「NAND→反向 NAND→AND」的組合，正是 De Morgan 系列的典範示範。

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
| 0 | 1 | 0   |
| 1 | 0 | 0   |
| 1 | 1 | 1   |

## 原理

NAND 的定義是 `NOT (a AND b)`。把它反相兩次就回到原值：

```
out = NOT (NOT (a AND b)) = a AND b
```

布林代數式：

```
out = AnandB NAND AnandB，其中 AnandB = a NAND b
```

「連續兩次取反」消去彼此，是布林的雙重否定律（`NOT NOT x = x`）。

## 實作細節

```hdl
Nand(a=a, b=b, out=AnandB);
Nand(a=AnandB, b=AnandB, out=out);
```

- 第一顆 NAND：中間線 `AnandB = NOT (a AND b)`。這是「至少一個為 0」的信號。
- 第二顆 NAND：把 `AnandB` 併腳當輸入，輸出 `NOT (AnandB AND AnandB) = NOT AnandB = a AND b`。

中間線 `AnandB` 只存在於晶片內部，對外部不可見，其命名直接寫明「a NAND b」的由來。

## 測試與驗證

執行 `And.tst`，逐一把 `(a, b)` 走遍全部四種組合並比對 `And.cmp`：

```
set a 0, set b 0 → out=0
set a 0, set b 1 → out=0
set a 1, set b 0 → out=0
set a 1, set b 1 → out=1
```

`output-list a%B3.1.3 b%B3.1.3 out%B3.1.3` 以三格寬二進位顯示三欄。整張真值表走完即通過。

## 延伸討論

- 第二章的 `HalfAdder` 以 `And` 產生進位位元 `carry`，因為「只有兩輸入都為 1 才進位」正是 AND 的行為。
- `And16` 就是把本電路平行複製十六份。通用思考：NAND 既然能做出 NOT（併腳），也能做出 AND（雙重反相），驗證了 NAND 的完備性。