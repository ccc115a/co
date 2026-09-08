# ScreenTest/Main.vm 程式說明

`Main.vm` 是 `ScreenTest/Main.jack` 編譯出的 VM 碼（104 行）。它是一連串「`push` 4 個座標 → `call Screen.drawXxx 4`」的純呼叫序列，最適合觀察「圖形API 的參數如何進堆疊」。

## 概述

- 進入點：`function Main.main 0`（零 local）。
- 整支 VM 只有 26 次 `call`（加上 `pop temp 0` 丟回傳值）與 `push constant` 準備參數。
- 對 VM 翻譯器而言，這是「多參數呼叫」的密集壓力測試。

## 架構總覽

每一段都是一個模板：

```
push constant 0; push constant 220
push constant 511; push constant 220
call Screen.drawLine 4
pop temp 0
```

`drawRectangle` 與 `drawCircle` 同理（`call … 4`、`… 3`）。`setColor` 則：

```
push constant 0; not
call Screen.setColor 1        ; setColor(true)
pop temp 0
```

`push constant 0; not` 產生 −1（true）；`push constant 0` 是 false。

## 原理

- **參數進堆疊的順序**：`call Screen.drawLine 4` 的 `argument 0..3` 依序是 x1、y1、x2、y2（與 Jack 的 `drawLine(0,220,511,220)` 同行）。VM 翻譯器會把 `argument` 段複製到 callee 的框架，callee 依 `argument n` 讀取。
- **void 回傳**：所有繪圖函式回傳 0，`pop temp 0` 丟棄，畫面效果寫在 RAM 上（透過 `drawPixel` 對 `SCREEN` 記憶體的操作）。

## 實作細節

| Jack | VM |
|------|----|
| `Screen.drawLine(0,220,511,220)` | `push constant 0; push constant 220; push constant 511; push constant 220; call Screen.drawLine 4` |
| `Screen.setColor(false)` | `push constant 0; call Screen.setColor 1` |
| `Screen.setColor(true)` | `push constant 0; not; call Screen.setColor 1` |
| `Screen.drawCircle(360,170,3)` | `push constant 360; push constant 170; push constant 3; call Screen.drawCircle 3` |
| 完成 | `push constant 0; return` |

`drawCircle` 只接 3 參數（cx、cy、r），與 jack 一致。

## 測試與驗證

VM Emulator 載入 `ScreenTest` 資料夾後 Run；畫面立即可見「房＋太陽」。如果把 `Main.vm` 拿去單獨編成 Hack 翻譯測試，可觀察 `call Screen.drawLine` 在 Hack 層如何備份回傳位址與指標——因為 4 參數，動到的堆疊較多。

## 延伸討論

這支 104 行的 VM 是「物件導向 vs 命令式繪圖」的極簡對照：全部使用 function（非 method），因此沒有 `this` 的 `pop pointer 0` 前綴——參數就是赤裸的座標。若你自訂 ScreenTest 加畫東西，只需照模板多推幾組 `push constant` 再 `call` 即可，無需理解彩色圖形模型之外的任何機制。