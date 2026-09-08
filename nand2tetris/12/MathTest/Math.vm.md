# MathTest/Math.vm 程式說明

`Math.vm` 是第 12 章 OS 類別 `Math.jack` 編譯出的 VM 碼（340 行）。它是一個以「2 的次方表 + 二十進位位元測試」為核心的整數數學函式庫，實作乘法、除法、平方根等 Hack 上最關鍵的演算法。

## 概述

- static 0：`powers_of_two`（16 格的 `Array`，內容 1, 2, 4, … , 32768），由 `Math.init` 建立。
- 提供：`init`、`bit`、`abs`、`multiply`、`divide`、`sqrt`、`max`、`min`（另在 ScreenTest 的版本加 `two_to_the` 與 `mod`）。
- 被誰使用：Jack 程式的 `*`、`/` 運算子、`Output.printInt`、`String.setInt`、`Keyboard.readInt`、`Screen.drawPixel` 與連結串件。

## 架構總覽

| 函式 | 標頭 | 演算法 |
|------|------|--------|
| `Math.init` | 0 | 配置 16 格陣列，逐格填 2⁰…2¹⁵ |
| `Math.bit` | 0 | `x & powers_of_two[n] ≠ 0` |
| `Math.abs` | 0 | 負則取負 |
| `Math.multiply` | 3 | 移位相加：掃 y 的 16 位元 |
| `Math.divide` | 4 | 遞迴：`div(x, y+y)` 再加倍 |
| `Math.sqrt` | 4 | 逐位逼近（自高而低） |
| `Math.max`/`min` | 0 | 比較後回傳 |

## 原理

- **二的次方表**：Hack 沒有位移指令，所以「把 2^n 取出」靠查表 `powers_of_two[n]`。這張表同時被 `bit`（AND 遮罩）、`sqrt`（逐位候選值）、`two_to_the`（畫點）共用。
- **multiply**：對 y 的每一個位元 j（j=0..15），若 `bit(y,j)=1` 就把「目前移位後的 x」加進 sum，之後 `shiftedX += shiftedX`（×2）。這是教科書的 shift-and-add，16 步完成。
- **divide**：`divide(x,y)` 判 `y > x` 則回 0；否則遞迴 `q = divide(x, y+y)`。若 `x − 2·q·y < y` 商為 `2q`，否則 `2q+1`。符號由「x、y 是否異號」決定（`neg_x eq neg_y` 時為正）。
- **sqrt**：`y=0`，從 `j=7` 的高位往下：嘗試 `approx = y + 2^j`，若 `approx² ≤ x`（且 >0 防溢位）就接受。這是「自最高位建立根」的二進位平方根。

## 實作細節

- `Math.bit`：
  ```
  push argument 0; push argument 1; push static 0; add
  pop pointer 1; push that 0        ; powers_of_two[n]
  and; push constant 0; eq; not      ; (x & mask) != 0
  return
  ```
- `multiply` 的迴圈以 `push local 2; push constant 16; lt; not; if-goto WHILE_END0` 控制（j<16 時繼續）。
- `divide` 的 `2*q*y` 是二層乘法：`call Math.multiply 2` 兩次（見 VM）。遞迴深度最多 O(log n)。
- `sqrt` 每個候選都用 `local 2 × local 2`（`Math.multiply`）驗證，迴圈從 7 跑到 0 共 8 次。

## 測試與驗證

`MathTest.tst` 以 `Main.vm` 驅動，驗證 RAM[8000..8013]。特別值得觀察的邊界：`r[7]` 商為 0、`r[9]=sqrt(32767)=181`。也可用 VM Emulator 單步看 `Math.multiply` 的 `WHILE_EXP0` 內 `local 1`（shiftedX）如何逐次倍增。

## 延伸討論

- `multiply` 對 y 用無號方式掃位元，因此負數相乘結果雖然數學上正確，但若 y 為負，最高位元（符號位）會參與位移而產生溢位；Hack 12 位元的 IM 內使用者只需負數正常乘結果即可（因為 16 位元二補數乘法的低 16 位元恰好正確）。
- `sqrt` 的「平方 > 0」檢查是為了避免 `approx²`（二補數）溢位成負數時誤判；這是書上未明講、卻常在測 `sqrt(32767)` 時被發現的坑。
- 真實 CPU 的乘法器用硬體 Booth 或華勒斯樹；Hack 選擇軟體查表是「硬體極簡 + 軟體補位」的哲學，正好對照第 3 章 ALU 只做加減法的設計取捨。