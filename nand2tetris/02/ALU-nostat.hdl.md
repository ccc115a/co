# ALU-nostat 程式說明 — 簡化版算術邏輯單元

這個電路用 6 個控制位元把兩個 16 位元輸入處理成 18 種常用的算術與邏輯結果，是全 ALU 的「運算主體」，只是**沒有 zr/ng 狀態輸出**。

## 概述

ALU-nostat 是教材提供的輔助版本：它去掉了 `zr`（結果為零）與 `ng`（結果為負）兩個狀態旗標，只保留 `out[16]` 的運算。用意是先讓學生專注把 18 種運算做對，再於下一個步驟以 ALU.hdl 補上旗標輸出。

它是第二章的集大成者，底下用到 Mux16、Not16、Add16、And16；這些「直接改寫輸入再相加/相與」的技巧構成 ALU 的設計核心。

## 介面與規格

```
CHIP ALU-nostat {
    IN  x[16], y[16],   // 兩個 16 位元運算元
        zx,             // zero the x input?
        nx,             // negate the x input?
        zy,             // zero the y input?
        ny,             // negate the y input?
        f,              // out = x+y（1）或 x&y（0）
        no;             // negate the out output?
    OUT out[16];
}
```

## 原理

### 6 個控制位元的行為

| 控制位元 | =1 的效果 | =0 的效果 |
|---------|----------|----------|
| zx      | x 歸零    | x 不動    |
| nx      | x 位元取反（!x）| x 不動 |
| zy      | y 歸零    | y 不動    |
| ny      | y 位元取反（!y）| y 不動 |
| f       | out = x + y（二補數加法）| out = x & y（逐位元 AND）|
| no      | out 整個取反（!out）| out 不動 |

先把 x、y 改寫成一連串「處理後」的版本，再決定做加法還是 AND，最後可選擇取反。這套規則寫成偽碼就是：

```
if zx then x = 0
if nx then x = !x
if zy then y = 0
if ny then y = !y
if f  then out = x + y else out = x & y
if no then out = !out
```

### 為什麼這五步就涵蓋 18 種運算

關鍵運算是**二補數取負**：`-v = !v + 1`。把「x 歸零＋y 取反＋加法＋取反」組合起來，就能靠 6 個位元拼出 x−y、y−x、x+1、x−1、-x、-y、x|y 等，不必為每種運算客製電路。例如 `x - y`：

1. `nx=1` → x 變成 `!x`
2. `ny=0`（y 不動）
3. `f=1` → 得 `!x + y`
4. `no=1` → 取反 `!(!x+y) = x - 1 - y`?? — 等一下，正確推導見下方實作。

正確推導其實是：標準做法 `x-y = !(!x + y)`。因為 `!(!x + y) = x - y`（二補數性質：`!a = -a-1`，故 `!(!x+y) = -(!x+y)-1 = -((-x-1)+y)-1 = x-y`）。同理 `y-x = !(x + !y)`。而 `x|y = !(!x & !y)`（德摩根）。所以 zx/nx/zy/ny/f/no 六位元的分工就是「改造輸入 → 加法或 AND → 視需要取反」。

## 實作細節

```hdl
PARTS:
    Mux16(a=x,  b=false,  sel=zx, out=x1);    // zx: x → 0
    Not16(in=x1,out=notx1);
    Mux16(a=x1, b=notx1, sel=nx, out=x2);     // nx: x1 → !x1

    Mux16(a=y,  b=false,  sel=zy, out=y1);    // zy: y → 0
    Not16(in=y1,out=noty1);
    Mux16(a=y1, b=noty1, sel=ny, out=y2);     // ny: y1 → !y1

    Add16(a=x2, b=y2, out=addxy);             // x2 + y2
    And16(a=x2, b=y2, out=andxy);             // x2 & y2

    Mux16(a=andxy, b=addxy, sel=f, out=o1);   // f 選加法或 AND
    Not16(in=o1, out=noto1);
    Mux16(a=o1, b=noto1, sel=no, out=out);    // no: 最後取反
```

整段電路是一條明確的管線，x、y 各自走過「歸零 → 取反」兩道 Mux 閘：

- **歸零**：`Mux16(a=x, b=false, sel=zx)` — `sel=zx` 為 1 時選 `b=false`（16 條線全接 0），為 0 時原樣放出 x。
- **取反**：先以 `Not16` 平行算好 `x1` 的反相，再用 `Mux16(a=x1, b=notx1, sel=nx)` 二選一。沒有直接可控制的「NOT 閘」，所以用 Mux 當開關選「原值」或「反值」。
- **中間線 x1/x2**：`x1` 是歸零後的 x，`x2` 再經過可選取反，是「最終被送到運算單元的 x」。
- **加法與 AND 平行算**：`Add16` 與 `And16` 同時接受同一組 `x2/y2`，因為組合電路的結果與時序無關。
- **f 選擇**：`Mux16(a=andxy, b=addxy, sel=f)` — 注意 `sel=0` 選 a（AND）、`sel=1` 選 b（加法），與 f 的定義一致。
- **no 取反**：一樣用「Not16 + Mux16」的標準手法，最後 `out=out` 直通晶片輸出。

刻意設計的讀法：每個區域都照著偽碼註解走（`// if (zx==1) set x=0` 等），方便對照原理。

## 測試與驗證

`ALU-nostat.tst` 是 ALU.tst 的「半套」：對兩組 x、y（一組 `x=0, y=-1`，一組 `x=17, y=3`）各跑 18 種控制組合，但 `output-list` **不含 zr/ng**。測試註解明確說明它只是 partial test，用意是把「運算正確」與「狀態旗標正確」兩件事分開除錯：

1. 先讓 ALU-nostat 通過 — 代表 18 種運算、6 個控制位元都對。
2. 再測 ALU.tst — 若失敗，問題只會出在 zr/ng 的產生電路。

完整對照閱讀時應把握：ALU-nostat 的運算鏈正是 ALU 的「主體」，本教材建議先獨立完成此晶片再擴充狀態旗標。

## 延伸討論

ALU 這種「少數控制位元 + 大量平行閘」的設計是精簡指令集（RISC）哲學的縮影：運算元種繁多，但都以固定 6 位元的「控制匯流排」統一編碼。真實 CPU 的 ALU 概念完全相同，只是字寬更大、改進取反方式（如 x86 用 instruction flags 隱式控制這些位元）。下一站 ALU.hdl 將在此基礎上加掛 zr/ng 兩個旗標。