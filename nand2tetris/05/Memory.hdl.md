# Memory 晶片說明（Hack 的完整記憶體：RAM + 螢幕 + 鍵盤）

這個電路把第 5 章以前的 RAM16K、螢幕（Screen）與鍵盤（Keyboard）三個元件整合成 Hack 電腦
單一的 32K×16 位元定址空間，用 15 條位址線一次解碼出「資料、螢幕、鍵盤」三個區段，並以 `load`
位元控制只有被選中的區段才會被寫入。

## 概述

- 在 Nand2Tetris 第五章「電腦架構」中，Memory 是 Computer 的三個核心零件之一（另有 CPU 與
  ROM32K）。它負責提供資料記憶體，以及讓 CPU 用「對位址讀寫」的方式控制螢幕與鍵盤。
- 由更小的元件組成：`RAM16K`（第 3 章）、`Screen`、`Keyboard`（內建晶片）、兩個 `Mux16`、
  一個 `Not` 與兩個 `And`。
- 被誰使用：`Computer.hdl` 把 CPU 的 `outM / writeM / addressM` 接到 Memory，並把 Memory 的
  輸出送回 CPU 的 `inM`。

## 位址對映（Address Map）

Hack 的記憶體位址是 15 位元（0–32767），由位址線的最高的兩個位元 `address[14]` 與 `address[13]`
決定存取哪個區段：

```
       0 ┌──────────────────────┐ 16383
         │       RAM16K         │ 16K 字組 × 16 位元（資料記憶體）
         └──────────────────────┘
    16384 ┌──────────────────────┐ 24575
          │       Screen         │  8K 字組 × 16 位元（螢幕記憶體對映）
          └──────────────────────┘
    24576  ←  Keyboard（1 個字組，唯讀）
      24577–32767 為無效位址，不得存取（本書規格）
```

| 位址範圍 | 大小 | 用途 | 關鍵位元 |
| --- | ---: | --- | --- |
| 0 – 16383（0x0000–0x3FFF） | 16K | RAM16K（資料記憶體） | `address[14]=0` |
| 16384 – 24575（0x4000–0x5FFF） | 8K | Screen（螢幕記憶體對映） | `address[14]=1`, `address[13]=0` |
| 24576（0x6000） | 1 | KBD（鍵盤記憶體對映，唯讀） | `address[14]=1`, `address[13]=1` |
| 24577 – 32767（0x6001–0x7FFF） | — | 無效區段 | `address[14]=1`, `address[13]=1` |

一句話記法：`0x4000` 的權重由 `address[14]` 佔住，`0x2000` 的權重由 `address[13]` 佔住；
24576 = 0x4000 + 0x2000，正好位在 `a14=1` 且 `a13=1`。

## 介面與規格

```
IN  in[16], load, address[15];
OUT out[16];
```

- 讀：`out(t) = Memory[address(t)](t)`。輸出是**組合邏輯**，只要 `address` 給定，`out` 立即顯示
  被選中位置的值；不需要等時脈。
- 寫：`if load(t-1) then Memory[address(t-1)](t) = in(t-1)`。資料在下一個時間步（tick+tock 一個
  週期）才真正寫入該位置，寫入後從該位置讀出即為新值。
- 定址基本規則（依區段與位元解碼的真值表）：

| `address[14]` | `address[13]` | 選中區段 | 寫入動作 | 讀取來源 |
| ---: | ---: | :-- | :-- | :-- |
| 0 | 任意 | RAM16K | RAM 位址用 `address[0..13]` | `RAM16K[address[0..13]]` |
| 1 | 0 | Screen | 螢幕位址用 `address[0..12]` | `Screen[address[0..12]]` |
| 1 | 1 | KBD | 不寫入（鍵盤唯讀） | `outK`（當前按下的鍵，無鍵為 0） |

## 原理

Memory 的運作是「位址解碼 + 寫入致能」的典型範例，與第 3 章單一 RAM 的觀念完全一樣，只是
解碼的目標從「RAM 內部的一列」擴大成「若干個記憶體晶片之一」：

1. **位址解碼（demultiplexer 觀念）**：15 位元位址中，最高的 `address[14]` 先把空間切一半
   （RAM 對其餘），再用 `address[13]` 把另一半切成 Screen 與 KBD。
2. **寫入致能（load gating）**：`load` 是唯一的寫入許可位元，但必須與「你正是那個被選中的區段」
   同時為真，該區段才會收到自己的寫入脈波。如此一來，寫入 `0x2000` 不會波及 `0x0000`，
   寫入 `0x4FCF` 不會波及 RAM 或鍵盤——這就是測試檔一再檢查的「防交叉寫入」。
3. **讀取多工（Mux16 樹）**：三個輸出 `outM / outS / outK` 用兩層 `Mux16` 依位址高位元挑出
   正確的那一個當 `out`。

## 實作細節

原始檔案中的五條線路，配上一頭一尾兩個 Mux：

```
Not(in=address[14], out=N14);            // N14 = ¬a14
And(a=N14, b=load, out=Mload);           // Mload  = ¬a14 ∧ load  → RAM 的寫入致能
And(a=address[14], b=load, out=Sload);   // Sload  =  a14 ∧ load  → Screen 的寫入致能

RAM16K(in=in, load=Mload, address=address[0..13], out=outM);
Screen(in=in, load=Sload, address=address[0..12], out=outS);
Keyboard(out=outK);

Mux16(a=outM, b=outSK, sel=address[14], out=out);
Mux16(a=outS, b=outK,  sel=address[13], out=outSK);
```

逐步解讀：

- **寫入致能的布林式**：`Mload = ¬a14 ∧ load`、`Sload = a14 ∧ load`。RAM 只需要 14 條位址線
  `address[0..13]`（16K = 2^14）；Screen 只需要 13 條 `address[0..12]`（8K = 2^13）。高位位址線
  不進子晶片，只負責在記憶體層選區段。
- **中間線名稱**：`N14`、`Mload`、`Sload`、`outM`（RAM 輸出）、`outS`（Screen 輸出）、`outK`
  （鍵盤輸出）、`outSK`（Screen/KBD 二選一的結果）。
- **第一層 Mux16**：`sel=address[13]`——`address[13]=0` 時選 `outS`（螢幕），`=1` 時選 `outK`
  （鍵盤）。
- **第二層 Mux16**：`sel=address[14]`——`address[14]=0` 時選 `outM`（RAM），`=1` 時選剛才的
  `outSK`。兩層疊起來正好完成三選一。
- **鍵盤是唯讀**：`Keyboard` 只有 `out` 沒有 `load`，所以 `Sload` 只喂給 Screen——寫入 0x6000
  這個位址不會改變鍵盤，也不會產生任何效果。

## 測試與驗證

用第 5 章目錄下的 `Memory.tst`（配合 `Memory.cmp`）在 Hardware Simulator 中驗證，重點測試按
順序是：

1. **基本寫讀**：`address=0`、`in=-1`、`load=1`，`tick` 後 `out` 仍為 0（尚未提交），`tock` 後
   `out=-1`（RAM[0] 已被寫入）。接下來把 `load=0`，讀回仍為 −1，證明「沒 load 就不會蓋掉舊值」。
2. **防交叉寫入**：在 `0x2000` 寫 2222，然後檢查 `address=0` 讀回仍是 −1、`0x4000` 讀回是 0——
   證明寫入 `0x2000` 沒有波及 RAM[0] 或螢幕。
3. **位址位元完整性**：`load=0` 下把 `address` 依序設為 `0x0001, 0x0002, …, 0x2000` 逐個 `eval`
   並讀出 RAM 的舊值，確認 14 條低位址線都有接對（沒有位元被短路或漏接）。
4. **跨 RAM 中段測試**：在 `0x1234` 寫 1234、在 `0x2345` 寫 2345，再檢查相鄰位址（`0x2234`、
   `0x6234` …）沒被波及。
5. **鍵盤測試**：`address=24576`（KBD），`echo` 要求按住「K」（ASCII 碼 75），腳本用 `while out
   <> 75` 迴圈等待，直到讀到 75 才繼續——驗證鍵盤記憶體對映可正常讀取。
6. **螢幕測試**：`load=1`、`in=-1` 分別寫入 `0x4FCF` 與 `0x504F`，接著逐一讀取鄰近的螢幕位址
   （`0x4FCE`、`0x4FCD`、`0x5FCF`…）確認只有那兩個字組被寫；最後再按住「Y」（89）結束。
   在「View」選單切到 Screen 畫面，應能看到兩條水平線。

## 延伸討論

- **記憶體對映 I/O（memory-mapped I/O）**：CPU 不需要任何特製的「畫點、讀鍵盤」指令，只要規規
  矩矩地讀寫某幾個位址，就把資料送到螢幕、把鍵盤值讀回來。真實電腦（如 x86 的 VGA framebuffer）
  也是這個做法。
- **設計取捨**：靠 `address[14] / address[13]` 兩條高階位址線二階段解碼，架構乾淨、接線最少。
  但讀取端的 Mux16 直接以 `address[13]` 區分 Screen 與 KBD，因此位於 0x5000–0x5FFF 的「螢幕
  上段位址」**讀回的是鍵盤值**而不是螢幕內容（寫入仍可達螢幕）。教材課程多數程式只寫螢幕不讀，
  所以此瑕疵通常無感；若要在硬體層修正，可在 Screen 解碼時合併檢查 `address[13]`。
- **與真實記憶體對照**：Hack 是「字組定址」（每個位址一個 16 位元字組），而真實電腦多以位元組
  （byte）定址，螢幕也是逐像素讀寫；第 12 章 OS 的 `Screen.jack` 就是在此位址空間上模擬過去。