# Main.jack 程式說明 — Sum（無 OS 案例）

從 1 累加到 100（等差數列和），結果存進 `Main` 的 static 變數（＝ `RAM[16]`）。
是「沒有作業系統也能跑」的最小範例：只用加減、比較、`while`，完全自給自足。

## 概述

Sum 示範三件事：

1. **無 OS**：不呼叫 `Math`/`Output`/`Sys`(OS 版) 以外的服務，
   也因為不碰 `* / %` 與字串，編譯出來的 VM 不需要任何 OS 函式。
2. **自己開機**：程式自備 `Sys.jack` 提供 `Sys.init`（`vm2asm` bootstrap 固定呼叫它）。
3. **可驗證**：把答案寫進 static 變數，hackemu headless 執行後由 `RAM[16] static` 直接看見。

## 架構總覽

```
Sys.init  ──▶ Main.init（算 1..100 的和）──▶ Main.loop（無窮迴圈）
```

| 元素 | 說明 |
|------|------|
| `static int result` | 唯一的 static 變數源碼序 → `Main.0` → 組譯後落到 `RAM[16]` |
| `var int i` | 迴圈計數器 |
| `var int acc` | 累加器 |

## 原理

```jack
let i = 1;
let acc = 0;
while (i < 101) {        // i = 1..100
    let acc = acc + i;
    let i = i + 1;
}
let result = acc;        // 5050
```

- `101` 這個上限搭配 `i < 101`，等價於迴圈跑 `1 ≤ i ≤ 100`。
- 全程只用 `+`（加法）與 `=`/`<`（比較）；沒有任何會被編譯成 OS 呼叫的運算子。

## 變數一覽

| 變數 | 型別 | 用途 |
|------|------|------|
| `result` | static int | 答案 5050（＝ `RAM[16]`） |
| `acc` | local int | 累加總和 |
| `i` | local int | 迴圈計數器 |

## 測試與驗證

```bash
./target/debug/hackemu --headless <Sum.bin> --max 1000000
# RAM[16] static: 5050
```

## 延伸討論

- 想觀察「沒有 OS 的字串/乘除」會發生什麼嗎？在 `Main.jack` 加一行
  `let acc = acc * 2;`，`jack2vm` 會把它編成 `call Math.multiply 2`——沒有 OS 就找不到 `Math`，
  `vm2asm` 雖仍能組譯，但執行時會停在沒有定義的位置。
- `Sys.init` 是「沒有 OS 的開機進入點」這回事的關鍵：任何 Jack 程式跑在 Hack 上，
  都得有人呼叫 `Sys.init`；OS 提供它、沒有 OS 就自己寫。