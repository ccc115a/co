# Or.hdl 程式說明

或閘（OR gate）：`out = 1` 若 `a`、`b` 任一為 1；兩者皆 0 時才輸出 0。

## 概述

`Or` 是第一顆真正用到 De Morgan 定律建構的閘：先各自反相，再用 NAND 把「皆為反相」的情況打平成 1。全電路只用兩顆 `Not` 與一顆 `Nand` 拼成，是三顆基本閘中接線最不直觀、卻最值得細讀的一顆。

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
| 1 | 1 | 1   |

## 原理

OR 的定義是「至少一個為 1」。改用「都不是的反面」來想：當 `a=0` 且 `b=0` 時 out 才為 0，其他情況都是 1。換句話說：

```
a OR b = NOT ( (NOT a) AND (NOT b) )
```

右邊正是「兩個反相輸入的 NAND」：

```
out = NAND(nota, notb) = NOT (nota AND notb)
    = NOT (NOT a AND NOT b)
    = a OR b          （De Morgan）
```

布林代數式：

```
out = (NOT a) NAND (NOT b)
```

## 實作細節

```hdl
Not(in=a, out=nota);
Not(in=b, out=notb);
Nand(a=nota, b=notb, out=out);
```

- 前三行：`nota = NOT a`、`notb = NOT b`，兩條中間線分別是 a、b 的反相。
- 第三行：`Nand` 把這兩個反相信號相與再取反。只有當 `nota=1` 且 `notb=1`（即 `a=0` 且 `b=0`）時，NAND 的輸出才是 0，其餘皆 1。

對照真值表：`(0,0) → out=0`，其他三列 `out=1`，與 OR 完全吻合。

## 測試與驗證

執行 `Or.tst`，四列 `(a,b)` 組合逐一 `eval`、`output`，比對 `Or.cmp`：

```
(0,0) → out=0
(0,1) → out=1
(1,0) → out=1
(1,1) → out=1
```

`output-list a%B3.1.3 b%B3.1.3 out%B3.1.3`：三欄皆 3 格寬二進位。通過標準：輸出檔與 `Or.cmp` 完全一致。

## 延伸討論

- De Morgan 定律 `(a ∨ b) = ¬(¬a ∧ ¬b)` 在這裡先被「證明」了一次，接著 `Xor` 又用它推導出等價式。可以試試只用 NAND（不用 Or）重寫 `Or`：`NAND( NAND(a,a), NAND(b,b) )`，正好就是這個電路的另一種拼法。
- 第一章的 `Mux` 尾端、`DMux`、`Or8Way` 都會重複用到 `Or`，它是後面所有選擇與合併電路的黏合劑。