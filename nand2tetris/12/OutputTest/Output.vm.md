# OutputTest/Output.vm 程式說明

`Output.vm` 是第 12 章 OS 類別 `Output.jack` 編譯出的 VM 碼（1698 行）。它負責把字元畫上螢幕：先以點陣字形（11×8 圖符）建索引表，再用 `moveCursor`/`printChar`/`println`/`scroll`/`backSpace` 等函式輸出一整頁 23 列、每列 64 字元的文字。檔案前 1383 行幾乎全是字形資料（`Output.initMap` 對每個 ASCII 字元呼叫 `Output.create`）。

## 概述

- 螢幕基底 `static 3` = 16384（`SCREEN`）：一個字元＝8×11 個像素＝2 個 16 位元「字」每列 ×8 列。
- `static 0`（`charMaps`）＝127 格的 Array：`charMaps[c]` 指向該字元的 11 個 16 位元字（存於 heap）。
- 游標 `static 1`（col 0–63）與 `static 2`（row 0–22）。
- 輸出流程：`printChar → (row) → (col)` 定位後，逐列把字元點陣以 `or` 寫到螢幕記憶體（配合 `static 4` 遮罩，左半/右半字）。

## 架構總覽

| 函式 | 標頭 | 職責 |
|------|------|------|
| `Output.init` | 0 | 設 base、遮罩陣列、呼叫 `initMap` |
| `Output.initMap` | 1 | 對 ASCII 0..126 各呼叫 `create`（字形資料在此展開） |
| `Output.create` | 1 | 建 11 字陣列存字模 |
| `Output.getMap` | 0 | 查字元對應點陣（越界回傳空白） |
| `Output.moveCursor` | 0 | 設 col/row |
| `Output.printChar` | 5 | 把字元畫到游標處，自動前進 |
| `Output.printString` | 1 | 逐字 `printChar` |
| `Output.printInt` | 1 | `String.setInt` 後 `printString`，用完 `dispose` |
| `Output.println` | 0 | 換列；抵底行則 `scroll` |
| `Output.scroll` | 0 | 清除並重設游標（簡化版）；實作版會平移 |
| `Output.backSpace` | 0 | 游標退一格（行首退上一列尾） |

## 原理

- **字形模型**：每個字元一行 8 個像素、高 11 列。因為螢幕每列 512 pix = 32 個 16 位元字，所以在 `row` 的「字號」 = `row*32*11 + col/2`（`Math.multiply` 作 `row×32`、再 ×11、加上 `col÷2`），而左右半由 `col mod 2` 決定。
- **寫入與遮罩**：對並列字元，半字要寫到「16 位元的左半／右半」。`static 4`（`charMasks`）給出 0..255（全 1）與 −256..−1（高 8 bit 為 1），`col mod 2` 決定選哪個遮罩。`printChar` 每列做法：
  ```
  讀螢幕舊值 → and mask   (清掉該半格)
              → or   字形   (畫上點)
              → 更新 RAM
  ```
  若 `col` 為奇數（右半），字形先 `×256`（shift 到高 8 位）。
- **終端機行為**：印到 col=63 導致 `println`（自動換列）；底行再換列就 `scroll`（document 中簡化為重畫）。`backSpace` 只在行首時退回上一列尾。

## 實作細節

- `printChar` 的定位運算：
  ```
  push static 2; push constant 32; call Math.multiply 2
  push constant 11; call Math.multiply 2      ; row*32*11
  push static 1; push constant 2; call Math.divide 2 ; col/2
  add                                          ; 字號 → local 1
  ```
  對 11 列逐列跑：`local 3 = 字形[row]`；若右半就 `push local 3; push constant 256; call Math.multiply 2`。
  之後 `push local 1; push static 3; add` 拿到螢幕位址，以 `and mask`、`or bit` 合併後 `pop that 0`；列索引 local 1 加 32（下一列字號）。
- 字形資料取樣（`Output.create` 的參數），例如字元 `'A'`（ASCII 65）：
  `12, 30, 51, 51, 63, 51, 51, 51, 51, 0, 0`——正好是「A」的上半圓與兩隻腳的點陣（0120, 01E0…：位元組以 16 位元保存，每個值一行）。
- `create` 把 11 個字元放進 `Array.new(11)`，而 `charMaps[c] = 該陣列位址`（`push argument 0; push static 0; add; push local 0; pop…; pop that 0`）。

## 測試與驗證

`OutputTest/Main.vm` 驅動：`moveCursor` ×4、`printString` ×4、`printInt`、`backSpace`。通過標準：

- 四個角落字正確且不跳列；
- 三列文字（數字/字母/符號）字形可辨識（尤其 `"` 與空格）；
- `-12345` 倒退後成為 `-12346789`。

VM Emulator 視覺確認即可；要注意自己 `Output.jack` 的 `scroll` 若只是清屏重畫，會蓋掉前面結果——但「簡化版 OS」在測試畫面中本就允許。

## 延伸討論

`initMap` 內的字形資料是「把 8×11 點陣逐列轉成十六進位字的 11 個數」，整段 1383 行就是 127 個字元 ×11 列的展開。真實 GUI 以字型檔（如 TrueType）外掛；Hack 選擇硬編在 OS 裡換取「零載入」。另外 `Output.vm` 透過 `Math.multiply/divide` 與 `String.setInt` 間接呼叫自己，形成輸出鏈的相依——這正是第 12 章要整包 OS 一起編譯的原因。