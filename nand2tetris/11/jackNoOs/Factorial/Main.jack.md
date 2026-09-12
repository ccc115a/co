# Main.jack 程式說明 — Factorial（無 OS 案例）

計算 5! = 120。重點是「**乘法不用 `*`**」：因為 `*` 會被 `jack2vm` 翻成
`Math.multiply`（OS 呼叫），沒有 OS 就死了；這裡自己寫了一個用「連加」實作的 `mult`。

## 概述

- 5! = 5×4×3×2×1 = 120。
- `Main.mult(a, b)` 以「把 `a` 連加 `b` 次」模擬乘法，全程只有 `+`、`<`、`=`。
- 答案寫進 `static int result` ＝ `RAM[16]` 當 oracle。

## 架構總覽

```
Sys.init ──▶ Main.init ──▶（迴圈）──▶ f = Main.mult(f, n)
                                   └─ Main.loop（無窮迴圈）
```

## 原理

```jack
let n = 5;
let f = 1;
while (0 < n) {
    let f = Main.mult(f, n);   // 連加「乘法」
    let n = n - 1;
}
let result = f;                // 120
```

`mult` 的實作（連加）：

```jack
let acc = 0;
let i = 0;
while (i < b) { let acc = acc + a; let i = i + 1; }
return acc;
```

迴圈 5→4→3→2→1：`1×5=5`、`×4=20`、`×3=60`、`×2=120`、`×1=120`。

## 變數一覽

| 變數 | 型別 | 用途 |
|------|------|------|
| `result` | static int | 答案 120（＝ `RAM[16]`） |
| `n` | local int | 乘數（5 倒數到 0） |
| `f` | local int | 累積乘積 |
| `acc`, `i` | local int（mult 內） | 連加與計數 |

## 測試與驗證

```bash
./target/debug/hackemu --headless <Factorial.bin> --max 1000000
# RAM[16] static: 120
```

## 延伸討論

- 若把 `let f = Main.mult(f, n);` 換回 `let f = f * n;`，`jack2vm` 會輸出
  `call Math.multiply 2`——其呼叫鏈不不含 OS 時就跑到 `Math.0` 未定義處。
- 「用連加模擬乘法」正是 OS 的 `Math.multiply` 內部做的事情；換句話說，
  這組範例把原本 OS 提供的服務拉回應用端自己寫。