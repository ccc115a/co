# Not.hdl 程式說明

反相閘（NOT gate）：`out = not in`，單一輸入、單一輸出，輸出永遠是輸入的補數。

## 概述

`Not` 是第一章最基礎的閘之一。Nand2Tetris 的顛倒塔裡，唯一「直接存在」的原子閘是 `Nand`；`Not` 是第一顆從 Nand 派生出來的元件，示範「把閘的兩個輸入併在一起」就能改變 NAND 的行為。它是 `Or`、`Mux`、`DMux` 等眾多後續電路的建材。

## 介面與規格

| IN/OUT | 名稱 | 寬度 |
|--------|------|------|
| IN | `in` | 1 bit |
| OUT | `out` | 1 bit |

真值表：

| in | out |
|----|-----|
| 0  | 1   |
| 1  | 0   |

## 原理

利用 NAND 的「雙零出 1」特性：當兩個輸入都為 `in` 時，

```
out = NAND(in, in) = NOT (in AND in) = NOT in
```

恆等式 `in AND in = in`（冪等律）讓雙重複用輸入等價於把 NAND 變成 NOT。布林代數式：

```
out = in NAND in
```

## 實作細節

```hdl
Nand(a=in, b=in, out=out);
```

整顆電路只有一顆 NAND，完全沒有中間線。`a` 與 `b` 同時接到同一條輸入 `in`，在 HDL 語法中容許同一個信號餵進同一元件的多個接腳。

## 測試與驗證

使用 Hardware Simulator，載入 `01/Not.hdl` 後執行 `Not.tst`。測試腳本只有兩步：

- `set in 0` → 期望 `out=1`。
- `set in 1` → 期望 `out=0`。

`output-list in%B3.1.3 out%B3.1.3` 指定以二進位三格寬輸出兩欄，`compare-to Not.cmp` 負責逐行比對結果。

## 延伸討論

- `Not` 拿掉之後，第一章的 `Or`、`Mux`、`DMux`、`Mux4Way`、`DMux8Way` 都無法建造，可見它是層級設計中的樞紐。
- 「併腳」是 HDL 常見技巧；在硬體層面等同把 NAND 的兩顆輸入電晶體並聯，邏輯上仍是「輸入皆 1 才輸出 0」。