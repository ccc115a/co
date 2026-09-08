# ScreenTest/Math.vm 程式說明

`Math.vm` 是第 12 章 OS 的 `Math.jack` 編譯結果，放進 `ScreenTest` 資料夾供 `Screen.vm` 使用。與 `MathTest` 中的版本幾乎相同，差別只在多了兩個函式：`Math.two_to_the` 與 `Math.mod`（Screen 的 `drawPixel`、`drawHorizontalLine` 需要它們）。

## 概述

- static 0：`powers_of_two`—16 格的 `Array`，存 1, 2, 4, … , 32768。
- 函式：`init、bit、two_to_the、abs、multiply、divide、mod、sqrt、max、min`。
- 被誰使用：`Screen.drawPixel`（`two_to_the`、`multiply`、`mod`、`divide`）、`Output`（`multiply/divide`）、字符串轉換、測試程式本身。

## 架構總覽

| 函式 | 標頭 | 演算法 |
|------|------|--------|
| `Math.init` | 0 | 建立次方表 |
| `Math.bit` | 0 | `x & table[n] != 0` |
| `Math.two_to_the` | 0 | 回 `table[p]`（Screen 畫點遮罩專用） |
| `Math.abs` | 0 | 負取負 |
| `Math.multiply` | 3 | 移位相加 |
| `Math.divide` | 4 | 遞迴除法 |
| `Math.mod` | 1 | `x - (x/y)*y`（Screen 取餘專用） |
| `Math.sqrt` | 4 | 逐位逼近 |
| `Math.max/min` | 0 | 比較回傳 |

## 原理（與 MathTest 共通）

- **bit**：`&` 用 `and` 產生、`≠0` 用 `eq 0` 再 `not`。
- **multiply**：掃 y 的 16 位元，命中就累加「移位中的 x」，否則只位移。
- **divide**：遞迴 `divide(x, y+y)`；商 `2q` 或 `2q+1`；異號取負。
- **sqrt**：自 `j=7` 往下建候選值 `y + table[j]`，驗證 `(y+2^j)² ≤ x 且 >0`。
- **mod**：先 `divide` 取商再 `q*y` 減回（Screen.drawHorizontalLine 需要 `x mod 16` 計算半字邊界）。

## 實作細節

`Math.two_to_the` 極簡：

```
push argument 0; push static 0; add
pop pointer 1; push that 0
return
```

`Math.mod`：

```
push argument 0; push argument 1; call Math.divide 2
pop local 0
push argument 0; push local 0; push argument 1
call Math.multiply 2; sub
return
```

`Screen.drawPixel` 會用到：`drawPixel` 內 `push argument 0; push constant 16; call Math.mod 2` 求 x 對 16 的餘數，再 `call Math.two_to_the 1` 得遮罩。少了這兩個函式的 Math 版本無法驅動 Screen 畫點。

## 測試與驗證

ScreenTest 內 `Main.vm` → `Screen.drawLine/drawCircle` → `drawPixel/drawHorizontalLine` → `Math.multiply/divide/mod/two_to_the`，形成實際考驗。若自訂 `Math.jack` 缺 `two_to_the`/`mod`，編譯即失敗；若該二函式實作錯誤，螢幕會出雜訊或全黑。算式正確性再用 `MathTest.tst` 批次驗證。

## 延伸討論

同一個 `Math.jack` 為什麼要出兩個 `.vm` 複本（MathTest、ScreenTest）？因為各測試夾要能獨立自含所需 OS；而這版多帶的 `two_to_the`/`mod` 是「正式版 Jack OS」的一部分。真實的 math 函式庫通常以 assembly 或 CPU 指令（如 MUL、DIV）呈現；這裡全部翻成 `Math.*` 呼叫，也再度說明「Jack 就是作業系統的組合語言」。