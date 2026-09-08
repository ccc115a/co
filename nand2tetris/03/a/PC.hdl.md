# PC 程式說明 — 程式計數器

PC（Program Counter）用一個 Register、一個 Inc16 與三個 Mux16，在 `inc`/`load`/`reset` 三個控制位元下，讓存放的位址「遞增、載入或歸零」，是 CPU 控制流程的引擎。

## 概述

電腦執行指令是一條條依序來的，PC 記憶「下一條該執行哪個位址」。平時每拍自動 `+1` 往前推進；遇到跳躍指令時靠 `load` 直接載入新位址；開機或重啟時靠 `reset` 回到 0。

它把第三章準備好的元件第一次真正「接成控制用狀態機」：Register 負責記憶，Inc16 負責推進，三層 Mux 負責決策。

## 介面與規格

```
CHIP PC {
    IN in[16], load, inc, reset;
    OUT out[16];
}
```

優先序（由高到低）即規格的核心，與 `PC.tst` 的驗證順序完全對應：

| 條件 | 行為 |
|------|------|
| `reset=1` | out[t+1] = 0 |
| else `load=1` | out[t+1] = in[t] |
| else `inc=1` | out[t+1] = out[t] + 1 |
| else | out[t+1] = out[t]（維持） |

## 原理

### 三選一的「決策鏈」

PC 可看作「這拍要變成四種值中的哪一個」的三級選擇：維持原值 `o`、推進 `o+1`、載入 `in`、歸零 `0`。用多工器串成優先鏈，高優先權的決策排在**最後**（影響力最大）：

```
o ────┐
       └─► Mux ─► if1 ─► Mux ─► if2 ─► Mux ─► if3
oInc ──┘(inc)        │(load)        │(reset)
             in ─────┘    false=0 ──┘
if3 ──► Register（每拍無條件吃下 if3）
       └──► o（迴授）┘ oInc = o + 1
```

- **inc 級**：`o` 與 `o+1` 二選一。`inc=1` 時取 `oInc`。
- **load 級**：`if1`（剛才的結果）與外部 `in` 二選一。`load=1` 時取 `in` — 因位於下游，即使 `inc=1` 也會被 load 覆蓋，實現「load 優先於 inc」。
- **reset 級**：`if2` 與常數 0 二選一。`reset=1` 時硬壓成 0 — 最高優先權。

### Register 永遠「在寫」？

最技巧性的一點：Register 的 `load` 直接接 `true`。因為 PC 的「維持」功能已經由最上游的 Mux 完成（`inc=0` 時送回去的就是舊值 `o`），所以 Register 根本不需要自己判斷是否更新 — 它每拍都把 `if3` 收下即可。決策全部外推到那三個 Mux。

## 實作細節

```hdl
PARTS:
    Register(in=if3, load=true, out=o, out=out);
    Inc16(in=o, out=oInc);

    Mux16(a=o,   b=oInc, sel=inc,   out=if1);
    Mux16(a=if1, b=in,   sel=load,  out=if2);
    Mux16(a=if2, b=false, sel=reset, out=if3);
```

- `Register(in=if3, load=true)`：`if3` 來自三級決策鏈的最終結果，`load=true` 表示「每拍都載入」。
- `Register` 同時輸出 `out=o`（迴授用）與 `out=out`（對外），同一訊號兩個標籤。
- `Inc16(in=o, out=oInc)`：只有一組來源 — Pre 的值 `o`。`oInc = o+1`。
- 三層 `Mux16` 全都是「拿前級輸出當新的 a 輸入」的串接寫法，pipe 由上往下長：`o/oInc → if1 → if2 → if3`。
- `b=false` 的層級代表 16 bit 全 0，正是 reset 的歸零值。

## 測試與驗證

`PC.tst` 依優先序逐步設計測試，可拆成四組：

| 操作 | 驗證目標 |
|------|----------|
| 全部控制 0，只 `tick/tock` | 維持原值（0 仍是 0） |
| `inc=1` 連續兩拍 | 0→1→2，遞增一閃一閃 |
| `in=-32123, load=1` | 載入負數也照樣寫入 |
| `load=0, inc=1` 跑幾拍 | 從載入值繼續遞增，確認 load 不勾引時 inc 生效 |
| `in=12345, load=1` 再 `reset=1` | reset 壓過 load，輸出歸 0 |
| `reset=1, inc=1` | reset 仍優先（0） |
| 回到 `inc=1` | 從 0 重新遞增 |

輸出用 `in%D1.6.1 out%D1.6.1` 以十進位呈現，一眼看出計數序列。

## 延伸討論

- PC 是現代 CPU「指令預取」與「分支預測」的始祖：真實處理器把「下一個位址」的計算做成獨立管線級，並用 BTB（分支目標緩衝）更早猜出 `load` 值。
- 這裡的優先序（reset>load>inc>hold）正是 Hack CPU 判斷指令 `jmp`、`jeq` 等跳躍後如何更新 PC 的規格；第五章 CPU 會把這顆晶片直接嵌進 Fetch 單元。