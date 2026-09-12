# Main.jack 程式說明 — PrimeUnder100（無 OS 案例）

試除法找「小於 100 的最大質數」＝ 97，全程不用 `* / %`（取餘 `mod` 用連減自製）。

## 概述

- 從 99 往下找第一個質數。99、98 先被排除，97 是答案。
- `Main.mod(a, d)` 用「連減 + 一次比較」實作 `a % d`（沒有 `%` 運算子、也沒有 OS）。
- 答案寫進 `static int result` ＝ `RAM[16]`。

## 架構總覽

```
Sys.init ──▶ Main.init（外迴圈：候選 n；內迴圈：試除 d）
              └─ Main.mod(n, d)（連減取餘）──▶ Main.loop（無窮迴圈）
```

## 原理

`mod`（連減法取餘，只用 `>`、`=`）：

```jack
let r = a;
while (r > d) { let r = r - d; }   // 減到 r ≤ d
if (r = d) { let r = 0; }          // 剛好整除 → 餘數 0
return r;
```

主流程：

```jack
let n = 99; let p = 0;
while (p = 0) {                    // 還沒找到質數
    let p = 1; let d = 2;
    while (d < n) {
        if (Main.mod(n, d) = 0) {  // 被整除 → 不是質數
            let p = 0; let d = n;  // 提前結束內迴圈
        }
        else { let d = d + 1; }
    }
    if (p = 0) { let n = n - 1; }  // 往下試下一個
}
let result = n;                    // 97
```

- 內迴圈用 `let d = n;` 來「break」（本編譯器沒有 break）。
- `Main.mod` 是 `function`，透過 `Main.` 前綴呼叫；它不依賴任何 OS。

## 變數一覽

| 變數 | 型別 | 用途 |
|------|------|------|
| `result` | static int | 答案 97（＝ `RAM[16]`） |
| `n` | local int | 候選質數（99 往下掃） |
| `d` | local int | 試除因子（2..n-1） |
| `p` | local int | 目前是否仍為質數（1 是／0 否） |
| `r` | local int（mod 內） | 連減的餘數 |

## 測試與驗證

```bash
./target/debug/hackemu --headless <PrimeUnder100.bin> --max 5000000
# RAM[16] static: 97
```

## 延伸討論

- 試除法最不利的一段是「97 是質數，要把 d=2..96 全部試完」；這正是無平方根
  （根號要乘除）環境下的樸素代價，也可順著 `mod` 改寫體會「沒有除法運算的除法定義」。
- `Main.mod` 的寫法等價於整數除法定義：`a ÷ d = (a - r) / d`，只是把除法的
  商數也換成連減（這裡只要餘數）。
- 「內迴圈提早結束」與「外迴圈 p 旗標」是組合語言時代最常見的迴圈習慣，
  這組寫法可直接對應到 VM 的 `goto`/`label` 結構。