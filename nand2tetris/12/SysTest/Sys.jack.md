# SysTest/Sys.jack 程式說明

這是第 12 章 OS 的系統服務類別 `System.jack`：開機、停機、延遲、錯誤處理。它把全 OS 的初始化串成 `Sys.init`，也是 Jack 程式的「引導進入點」。

## 概述

- `Sys.init`：依序 `Math.init → Output.init → Screen.init → Keyboard.init → Memory.init`，最後 `Main.main()`——這就是第 12 章 OS 的「boot loader」。
- `Sys.halt`：無限空迴圈，永不回傳（程式結束即在此卡住）。
- `Sys.wait(duration)`：忙碌迴圈延遲約 duration 毫秒。
- `Sys.error(code)`：印 `Err<code>` 後 `halt`。
- 被誰使用：每一支 Jack 程式（透過 OSc 生成的開機序呼叫 `Sys.init`）。

## 架構總覽

| 函式 | 型別 | 行為 |
|------|------|------|
| `Sys.init` | function void | 初始化五大類別，呼叫 `Main.main` |
| `Sys.halt` | function void | `while(true){}` 停機 |
| `Sys.wait` | function void | 雙層忙碌迴圈延遲 duration ms |
| `Sys.error` | function void | 印 `Err<code>`、`halt` |

無 static/field/constructor。

## 原理

- **開機順序**：先起可被依賴的底層（Math 的次方表、Output 的字形、Screen 的基底、Keyboard、Memory 的空閒串列），全部準備好才進 `Main.main`。這個順序正是「依賴圖拓撲排序」。
- **wait 的刻度**：`duration×200` 步空轉 ≈ duration 毫秒。數字 200 由書上測得（CPU 約 1 step ≈ 約 0.005ms，200 步≈1ms 量級），讓 2000 讀起來是「整整 2 秒」。
- **halt**：`while(true){}` 在編譯後是 `label WHILE_EXP0 / push constant 0; not; not / if-goto WHILE_END0 / goto WHILE_EXP0`——因為 `true` 是 `-1`、`not(-1)=0`、`not(0)=-1`，所以「！true」永遠為真、跳不出迴圈，CPU 停在 `goto` 原地打轉。

## 實作細節

- `Sys.init` 對每個 `do Xxx.init();` 都產生 `call Xxx.init 0; pop temp 0`；`Main.main` 亦然。整個 `Sys.init` 是第五、六、七、八個類別的「總觸發器」。
- `error` 的 `do Output.printString("Err");` 在編譯時展開成建字串呼叫（3 字元 "Err"），`do Output.printInt(errorCode);` 把錯誤碼印出。
- `halt()` 呼叫的是 `Sys.halt`（同類別 function，免前綴也可解析）。
- `wait` 的變數宣告 `var int i, j;` 使編譯結果帶 2 個 local；`duration` 由 `argument 0` 讀入。

## 測試與驗證

`SysTest/Main.jack` 是官方測試：先等按鍵按下/放開，呼叫 `Sys.wait(2000)`，再用肉眼確認約 2 秒後出現 `Time is up.`。在 VM Emulator 執行時 OS 的 `Sys.init` 會先被（外部啟動序）呼叫，再進入 `Main.main`；硬體模擬器則需在 `ROM` 載入組合語言版。

## 延伸討論

- 若要測「開機序」本身：把 `Sys.jack` 編譯成 `Sys.vm`，搭配其餘 OS 與任一 `Main.vm`，由 VM Emulator 直接執行 `Sys.init`。
- 真實 OS 的 `halt` 會停下 CPU 並等待中斷以省電；Hack 的 while(true) 反而燒電，這是「硬體無中斷、無低功耗模式」的結果。
- `error` 的輸出格式 `ErrN` 是官方約定，遊戲與 OS 全面沿用，方便程式崩潰時立刻定位誰掛掉。
- `wait` 的「200 步 ≈ 1 毫秒」只是經驗值：不同 clockrate、不同 ALU 階數的 Hack 實作會略有出入，因此教科書刻意用「約」（approximately）定義 duration 的單位。