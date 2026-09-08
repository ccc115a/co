# RAM8 程式說明 — 8 個字元的隨機存取記憶體

這個電路用 8 個 Register 組成記憶體，以 3 條位址線選擇 8 個位置之一：**讀取**時把選中的 Register 輸出送上 `out`，**寫入**時把 `in` 寫進選中的 Register。

## 概述

RAM8 是第三章「記憶體」的第一個 RAM。它的關鍵架構問題是：8 個 Register 都想「同時」接同一組 `in[16]`，又都「同時」匯出到同一個 `out[16]`，到底誰該聽話？

答案是**位址解碼**：寫入方向用 `DMux8Way`（解多工器）把單一 `load` 訊號依位址只送給其中一個 Register；讀取方向用 `Mux8Way16`（多工器）依同一個位址把其中一個 Register 的輸出選上 `out`。資料線 `in`/`out` 對所有人共用 — 這就是「隨機存取」的雛形。

## 介面與規格

```
CHIP RAM8 {
    IN  in[16], load, address[3];
    OUT out[16];
}
```

- `address[3]`：3 條位址線，可編碼 2³ = 8 個位置 0..7。
- 若 `load=1`：`in` 寫入 `address` 指定的 Register；下一個時步起 `out` 輸出該值。
- 若 `load=0`：只有讀取，寫入被擋下，記憶內容不變。

## 原理

### 位址的兩種用途（解碼 vs 選擇）

對每個 Register 來說，它需要知道「我被寫入嗎？」與「我被讀取嗎？」

- **寫入**：整個 RAM 只有一條 `load`。寫入時只該讓「目標位址」的那一個 Register 的 load 是 1，其餘 7 個必須保持 0，否則所有人一起被覆寫。這正是 `DMux8Way`：一條 `load` 依 `address` 分成 8 條互斥的 `L0..L7`。
- **讀取**：8 個 Register 的輸出並排著，借 `Mux8Way16` 依 `address` 挑出其中一個接到 `out`，其餘 7 條線對此讀取沒影響。

### 兩張表可以合一

位址同時驅動兩邊（解碼 load、選擇輸出），是同一個 `address` 在 Combinational 電路裡被扇出到兩處的典型例子。

```
        ┌───────────────────────────────────┐
in[16] ─┤─── Register0 ──r0──┐              │
load  ──┤DMux8Way   Register1 ──r1──┐       │
address─┤──L0..L7    ...            ├─Mux8Way16 ─ out[16]
        └───────────────────────────┘   ↑ address
```

## 實作細節

```hdl
PARTS:
    DMux8Way(in=load, sel=address, a=L0, b=L1, c=L2, d=L3,
                                       e=L4, f=L5, g=L6, h=L7);

    Register(in=in, load=L0,  out=r0);
    Register(in=in, load=L1,  out=r1);
    ...
    Register(in=in, load=L7,  out=r7);

    Mux8Way16(a=r0, b=r1, c=r2, d=r3, e=r4, f=r5, g=r6, h=r7,
              sel=address, out=out);
```

- `DMux8Way`：`sel=address` 的三位元值決定哪一條輸出線（`L0..L7`）等於 1，其餘全 0。所以「load=1 且 address=3」時只有 `L3=1`，也只有 Register3 的 load 被打開。
- 8 個 `Register`：`in` 全部並聯，`load` 各自接解碼後的一條線，`out` 各自獨立標成 `r0..r7`。
- `Mux8Way16`：`sel=address` 從 `r0..r7` 中挑出對應的一組 16 bit 放到 `out`。畫重點：讀取永遠是「非破壞性」的，沒有 load 也會一直讀到該位址的值。

## 測試與驗證

`RAM8.tst` 的動作模式非常典型，濃縮起來是：

1. 寫入練習：對 `address=0..7` 依序寫各種值（11111、3333、7777…），`tick/tock` 後確認。
2. 保持練習：`load=0` 時切換位址，讀出來的還是舊值 — 證明沒被蓋掉。
3. 綜合讀寫：先寫 `0101…`/`1010…` 進不同位址，再逐位址讀回，驗證每個 Register 各自獨立。

`output-list` 同時印 `in/load/address/out`，可觀察「load=0 但 address 跳走時 out 跟著跳到另一個位置的值」— 正是隨機存取的特徵。

## 延伸討論

- RAM 的容量 = 2^(位址線數)。每多 3 條位址線，容量變 8 倍，這直接導向 RAM64→RAM512→RAM4K→RAM16K 的四代擴充。
- 真實記憶體的解碼器就是多層的 DMux/Mux 樹；本書用元件堆疊展示同一概念，只是省略了電晶體與三態匯流排的實務細節。