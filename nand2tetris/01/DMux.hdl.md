# DMux.hdl 程式說明

解多工器（Demultiplexor）：一條輸入 `in` 依選擇位元 `sel` 被送到一路輸出；`sel=0` → `{a,b}={in,0}`，`sel=1` → `{a,b}={0,in}`。

## 概述

`DMux` 是 `Mux` 的反向操作：Mux 把多線收成一線，DMux 把一線分散到多線。它只有一個輸入 `in`、兩個輸出 `a`、`b`，一次只有一個輸出帶走 `in` 的值，另一個輸出固定為 0。它是第三章**記憶體位址解碼（decoder）**的核心雛形，也是 `DMux4Way`、`DMux8Way` 的基石。

## 介面與規格

| IN/OUT | 名稱 | 寬度 |
|--------|------|------|
| IN | `in` | 1 bit |
| IN | `sel` | 1 bit |
| OUT | `a` | 1 bit |
| OUT | `b` | 1 bit |

真值表：

| in | sel | a | b |
|----|-----|---|---|
| 0  | 0   | 0 | 0 |
| 1  | 0   | 1 | 0 |
| 0  | 1   | 0 | 0 |
| 1  | 1   | 0 | 1 |

只有被選中的那一路可能為 1；另一路（與 `in` 值的對應路）被強制為 0。

## 原理

兩顆 AND 各當一條路的守門員，守門員的開關互為反相：

```
a = in AND NOT sel
b = in AND sel
```

- `sel=0`：`a` 的 AND 後側放行 → `a = in`；`b` 被 `sel=0` 鎖死 → `b=0`。
- `sel=1`：`a` 被 `nsel=0` 鎖死 → `a=0`；`b = in`。

兩條路同時只有一條通，沒有資料衝突。

## 實作細節

```hdl
Not(in=sel, out=nsel);
And(a=nsel, b=in, out=a);
And(a=sel,  b=in, out=b);
```

- `nsel = NOT sel`：第一條路的開關信號。
- 第一顆 `And`：`a = nsel AND in`——`sel=0` 時把 `in` 送進 `a`。
- 第二顆 `And`：`b = sel AND in`——`sel=1` 時把 `in` 送進 `b`。

對照 `Mux` 的結構：Mux 用同樣的 `nsel`/`sel` 開關，只是把 AND–OR 收斂成一線；DMux 沒有 OR，因為兩輸出天然互斥。

## 測試與驗證

執行 `DMux.tst`，四種 (in, sel) 組合：

- `in=0, sel=0` → `(a,b)=(0,0)`
- `in=0, sel=1` → `(a,b)=(0,0)`
- `in=1, sel=0` → `(a,b)=(1,0)`
- `in=1, sel=1` → `(a,b)=(0,1)`

`output-list in%B3.1.3 sel%B3.1.3 a%B3.1.3 b%B3.1.3`，與 `DMux.cmp` 比對。`in=0` 的兩列特別值得檢查：即使 `sel` 切得很亂，兩路輸出都必須恆為 0。

## 延伸討論

- DMux 與 Mux 成對出現：一個把資料「分送」，一個把資料「收集」。第三章 RAM 的運作模式是——位址位元先經 `DMux8Way` 挑中應該啟動的那個 Register（只有它接收寫入），讀取時再由 `Mux8Way16` 把被選 Register 的內容收回來。
- 一般化：n 位址位元可解出 2ⁿ 條輸出線，這是所有記憶體/暫存器陣列規模擴張的根本公式。