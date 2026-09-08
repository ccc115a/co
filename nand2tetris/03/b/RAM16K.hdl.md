# RAM16K 程式說明 — 16384 字元記憶體

這個電路以 4 個 RAM4K 組成 16,384 個位置的隨機存取記憶體，位址線 14 條（`2^14 = 16384`），是 Hack 電腦的主記憶體。

## 概述

RAM16K 是第三章記憶體金字塔的頂端，容量 `16K = 16384` 字元、每次讀寫一個 16-bit 字。它在第五章的 Computer 中扮演資料記憶體（Data Memory），佔用位址 0..16383，並與螢幕（`SCREEN`，16384 起）和鍵盤（`KBD`）共享位址空間。

結構上它首次改用 **`DMux4Way`**：因為 16K / 4K = 4，所以只需要 4 塊 RAM4K，高兩位位址線 `address[12..13]` 選塊，低 12 位 `address[0..11]` 選單元。

## 介面與規格

```
CHIP RAM16K {
    IN  in[16], load, address[14];
    OUT out[16];
}
```

位址分工：

- `address[0..11]`：送給每個 RAM4K（`2^12 = 4096`，選單元）。
- `address[12..13]`：最高兩位，選「4 塊 RAM4K 中的哪一塊」（`2^2 = 4`）。

總容量：4 × 4096 = 16384 = 16K。注意位址線是 **14 條**：`address[0]` 到 `address[13]` 共 14 條，恰好編碼全部 16384 個位址。

## 原理

### 為什麼是 4 而不是 8？

一路走來都是「8 塊」是因為子塊容量恰為 1/8；如今子塊是 4K、總量是 16K，16K/4K = 4，所以選塊訊號只需 **2 條**線，對應的元件從 `DMux8Way`/`Mux8Way16` 換成 `DMux4Way`/`Mux4Way16`。擴充的公式很單純：

```
高 (14 - 12) = 2 條位址線　→　2^2 = 4 塊
低 12 條位址線　→　每塊 2^12 = 4096 字元
```

### 兩層解碼的全貌

```
address[12..13] ──► DMux4Way 把 load 分給 L0..L3（選塊，寫入）
               ──► Mux4Way16 從 o0..o3 挑出 out（選塊，讀出）
address[0..11]  ──► 四顆 RAM4K 的共同內部位址
```

與 RAM512/RAM4K 唯一的結構差異，就是「塊數由 8 變 4」，「8 選 1」變「4 選 1」。

## 實作細節

```hdl
PARTS:
    DMux4Way(in=load, sel=address[12..13], a=L0, b=L1, c=L2, d=L3);

    RAM4K(in=in,  load=L0, address=address[0..11], out=o0);
    RAM4K(in=in,  load=L1, address=address[0..11], out=o1);
    RAM4K(in=in,  load=L2, address=address[0..11], out=o2);
    RAM4K(in=in,  load=L3, address=address[0..11], out=o3);

    Mux4Way16(a=o0, b=o1, c=o2, d=o3, sel=address[12..13], out=out);
```

- 解碼器只用兩個 `sel` 位元（`address[12..13]`），所以是 `DMux4Way`（4 選 1）而非 `DMux8Way`。
- 四顆 `RAM4K` 的 `address=address[0..11]` 並聯 — 對所有塊傳同一組低位址，由 `load` 決定誰真正寫入。
- `L0..L3` 是解碼後的 load 訊號（恰好一個為 1），`o0..o3` 是四塊的輸出，最終由 `Mux4Way16` 收斂成 `out`。

## 測試與驗證

`RAM16K.tst` 的名場面是寫入 `address = 4321` 與 `address = 12345`：

- `4321` 落在第 1 塊（`4321 / 4096 = 1` 餘 225）→ 驗證 `address[12..13] = 01` 把 load 送給 RAM4K #1。
- `12345` 落在第 3 塊（`12345 / 4096 = 3` 餘 57）→ 驗證高兩位 `11` 選到最末塊。
- 寫完回 `address=0`（塊 0）確認不受影響；`load=0` 時逐位址讀回，印出 `address%D2.5.2 out%D1.6.1` 十進位結果。

## 延伸討論

- 16K = 2^14，正因位址是 14 位元。第五章 Computer 把 `RAM16K` 與 `Screen`（RAM 位址 16384..24575）、`Keyboard` 一起組成統一的 memory map，靠的就是這條 14-bit 位址匯流排向上延伸兩位。
- 真實 DRAM 的 bank 結構、cache 的多路組相聯，本質都是這種「高位選組、低位命中」的分層；本書用可堆疊的 HDL 元件把概念具象化，而 RAM16K 恰好是整條記憶體階層的總驗收。