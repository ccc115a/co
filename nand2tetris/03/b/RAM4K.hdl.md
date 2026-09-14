# RAM4K 程式說明 — 4096 字元記憶體

這個電路把 8 個 RAM512 組出 4096 個位置，位址線 12 條（`2^12 = 4096`），把「塊中塊」的分層解碼再推一層。

## 概述

RAM4K 是討吉利的「4K」里程碑（4K = 4096 字元，顯示在螢幕/鍵盤介面上的記憶體多以此為單位）。結構上它完全複製 RAM512 的模式：高三位選塊、低九位選單元，只是塊從 RAM512 再長大一級。

## 介面與規格

```
CHIP RAM4K {
    IN  in[16], load, address[12];
    OUT out[16];
}
```

位址分工：

- `address[0..8]`：送給每個 RAM512 當內部位址（`2^9 = 512`，選單元）。
- `address[9..11]`：高三位，選「8 塊 RAM512 中的哪一塊」。

總容量：8 × 512 = 4096 = 4K。

## 原理

嵌套的位址意義可以畫成一棵樹：

```
address[12]
├─ address[9..11]   → 選 RAM4K 內的 8 顆 RAM512（塊）
└─ address[0..8]    → 選 RAM512 內的 8 顆 RAM64（再分塊）
    └─ address[0..5] → 選 RAM64 內的 8 顆 RAM8
        └─ address[0..2] → 選 RAM8 內的 8 顆 Register
            └─ 16 bit → 選 Register 內的 16 顆 Bit
```

每一層都是「高權重線選塊、低權重線遞交給下一層」。整個 12-bit 位址像是逐層剝洋蔥，最外面三條權重最高（最前面），最內層三條管到把字元定下來。

## 實作細節

```hdl
PARTS:
    DMux8Way(in=load, sel=address[9..11], a=L0, b=L1, ..., h=L7);

    RAM512(in=in,  load=L0, address=address[0..8], out=o0);
    RAM512(in=in,  load=L1, address=address[0..8], out=o1);
    ...
    RAM512(in=in,  load=L7, address=address[0..8], out=o7);

    Mux8Way16(a=o0, b=o1, ..., h=o7, sel=address[9..11], out=out);
```

可讀作「RAM512 的模板，把 RAM64→RAM512、address[0..5]→address[0..8]」一步步平移。這種「複製貼上並加深一層」的寫法，正是記憶體層次設計的精髓，不需要重寫邏輯。

## 測試與驗證

`RAM4K.tst` 與 RAM512.tst 同型：寫入 `4321`、`12345` 等跨塊位址、驗證塊 0 不受影響、最後以 `load=0` 逐位址讀回。每次寫入都是「set load 1 → tick/tock → set load 0」的三拍儀式，確保只有在 load 升起的瞬間才變動記憶。

## 延伸討論

4K 正好是 Hack 電腦螢幕記憶體（`SCREEN`，16384 起）之前的大型資料區塊；而 RAM16K 全體則把 4K 級別再翻四倍。真實系統中「位址線數 = log₂(容量)」的關係在每一層都被驗證，這顆晶片同時是「匯流排共同資料線」的絕佳實例：所有子模組共用同一組 `in`/`out`，靠位址而不靠實體連線切換。