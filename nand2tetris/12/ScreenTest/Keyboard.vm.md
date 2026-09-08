# ScreenTest/Keyboard.vm 程式說明

此檔與 `KeyboardTest/Keyboard.vm` 內容一致，是第 12 章 OS 的 `Keyboard.jack` 編譯結果，被複製到 `ScreenTest` 資料夾裡，使該測試可獨立編譯執行（Screen 類別在 `drawPixel` 之外不需要鍵盤，但 VM Emulator 載入整個資料夾時會要求所有被 `call` 的函式都在）。

## 概述

- 完整內容：`Keyboard.init`、`keyPressed`、`readChar`、`readLine`、`readInt`，共 82 行、與 KeyboardTest 版逐字相同。
- 在 ScreenTest 中只有「滿足相依」的角色：`Main.vm` 全程沒有呼叫鍵盤；若你的編譯流程要求整包 OS，這支補足缺口避免 `call` 到未定義函式。

## 架構總覽

| 函式 | 標頭 | 行為 |
|------|------|------|
| `Keyboard.init` | 0 | 設定 keyboard 基址 |
| `Keyboard.keyPressed` | 0 | 讀目前按鍵碼（0 表無鍵） |
| `Keyboard.readChar` | 1 | 等待一次完整按放、回顯、回傳 |
| `Keyboard.readLine` | 2 | 建 50 字緩衝，逐字處理到 newLine |
| `Keyboard.readInt` | 1 | readLine 後轉整數 |

## 原理摘要（詳見 KeyboardTest/Keyboard.vm）

- `init`：`static 0 = 24576`（KBD 記憶體對映基址）。
- `keyPressed`：`that 0` 讀 `RAM[24576]`。
- `readChar`：等按下、記住、等放開、`Output.printChar` 回顯。
- `readLine`：建 `String(50)`，依 backSpace/newLine 增刪至 Enter。
- `readInt`：`readLine` 後 `String.intValue()`。

## 實作細節

- `readLine` 內建 `String.new(50)`：容量刻意給「足夠但有限」的 50 字元，過長輸入會被 `appendChar` 的防溢機制靜默截斷（見 String.vm 說明）。
- `readChar` 的回顯呼叫 `Output.printChar`——若載入時缺少 `Output.vm` 或 `String.vm`，這支檔會引用到不存在的函式而無法執行；因為 ScreenTest 夾內已備齊，純屬「相依備援」。
- 兩個等待迴圈（等按下、等放開）以 `WHILE_EXP0`/`WHILE_EXP1` 的標準 Jack 迴圈型態呈現。

## 測試與驗證

ScreenTest 本身不觸發任何 `Keyboard` 函式；載入它只是為了讓 VM Emulator 在「整夾載入」模式下沒有懸空符號。若要驗證此檔，請改用 `KeyboardTest` 的 `.tst`／互動流程（見該檔說明）：按下 Page Down、輸入 JACK 等，檢查 `readLine` 的倒退與 readInt 的負號解析。

若你希望在 ScreenTest 畫完圖後，順便「按任意鍵才結束」，只需在 `Main.jack` 的 `return` 前插入 `do Keyboard.readChar();`——因為 `Keyboard.vm` 已在夾內，改完重編 `Main.vm` 即可，不必動 OS。

## 延伸討論

此檔凸顯 nand2tetris 專案的「測試資料夾分身」現象：同一個 OS 類別會以編譯好的 `.vm` 形式出現在多個測試夾，目的是讓「只用該 OS 子集」的測試不必編譯全部 OS。若你在 ScreenTest 中發現 `Keyboard.vm` 影響到執行（例如誤覆寫 static），注意 VM Emulator 的 static 是依「載入順序」配置的——不同資料夾同名類別切換時 static 不共用。進一步講，ScreenTest 夾刻意被包成「可獨立跑的最小 OS」：缺了 `Keyboard.vm` 單純「用不到」，而缺了 `Memory.vm`/`Array.vm` 則 `Screen.init` 與 `Output` 一啟動就當機——對照工作即可看出每支測試夾的「最低必要 OS 子集」長什麼樣。

想確認「這支與 KeyboardTest 版是否真的一致」：執行 `diff KeyboardTest/Keyboard.vm.md` 版與此檔（或 `diff Keyboard.vm` 原始檔都行）。官方來源出自同一個 `Keyboard.jack`，兩者應輸出完全相同。