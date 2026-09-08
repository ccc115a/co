# KeyboardTest/Keyboard.vm 程式說明

`Keyboard.vm` 是第 12 章 OS 類別 `Keyboard.jack` 編譯出的 VM 碼，共 82 行、4 個函式。它把「鍵盤」抽象成一個可輪詢、可讀字元、可讀整行的輸入裝置。

## 概述

- 硬體層：鍵盤是記憶體對映裝置，位址 24576（`KBD` 標記）。任何時刻 `RAM[24576]` 存放「目前被按下鍵的 16 位元碼」，沒按鍵時是 0。
- `Keyboard.vm` 提供：`init`（設定基址）、`keyPressed`（輪詢目前按鍵）、`readChar`（等一個字元按下→放開→回顯）、`readLine`（累積成 `String` 到新行）、`readInt`（把一行字串轉成整數）。
- 被誰使用：`KeyboardTest/Main.jack` 的互動測試、以及任何需要使用者輸入的 Jack 程式（如第 9 章的遊戲）。

## 架構總覽

| 函式 | 本機標頭 | 行為 |
|------|----------|------|
| `Keyboard.init 0` | 0 | 把 24576 存進 static 0（`keyboard`） |
| `Keyboard.keyPressed 0` | 0 | 回傳 `RAM[keyboard]`，即 `that 0` |
| `Keyboard.readChar 1` | 1 | 等按下→記下→等放開→`Output.printChar`→回傳 |
| `Keyboard.readLine 2` | 2 | 印 prompt、建 `String(50)`、累積到 newLine |
| `Keyboard.readInt 1` | 1 | `readLine` 後 `String.intValue()` |

## 原理

- **輪詢（polling）**：不像 PC 有中斷，Hack 只能靠「讀記憶體對映」判斷鍵盤狀態，因此 `readChar` 用兩個空迴圈：第一個 `while(keyPressed() = 0){}` 等按下，讀到值後第二個 `while(~(keyPressed() = 0)){}` 等放開。抓到「一次完整按放」，回傳得乾淨的字元。
- **readLine 的累積**：以 `String.new(50)` 為緩衝；每次 `readChar` 拿到一個字元：若是 `String.backSpace()`(129) 就 `eraseLastChar`（刪字並可重新輸入），若是 `String.newLine()`(128) 就結束迴圈，否則 `appendChar`。
- **對映定址（memory-mapped I/O）**：整支 `Keyboard.vm` 只針對 RAM[24576] 一個位址做唯讀，沒有中斷、沒有掃描碼狀態暫存——這是 Hack 把 I/O 極簡化後的直接後果。

## 實作細節

- `init`：`push constant 24576; pop static 0`——static 0 對應 Jack 的 static 欄位 `keyboard`。
- `keyPressed`：`push constant 0; push static 0; add; pop pointer 1; push that 0; return`——把 `that = keyboard + 0` 再取值，與 `RAM[24576]` 等價。
- `readChar` 的兩段輪詢正是 Main.jack 測試第一關的「核心邏輯」；迴圈多以 `goto WHILE_EXPn` + label 的不變式型態呈現，是 Jack 編譯器輸出的標準樣式。
- `readLine` 的判斷樹：先比對 `readChar` 回傳值與 `String.newLine`，相等即離開迴圈；否則比對 `backSpace`，成立才 `eraseLastChar`，其餘一律 `appendChar`。
- `readInt` 只做：`push argument 0; call Keyboard.readLine 1` 再把結果交給 `String.intValue`——所以「讀整數」其實是「讀進來的字串逐字解析」。
- 一支 VM 程式可能同時出現多次 `call Keyboard.readLine`；每次都是「獨立的新 String(50)」——一次 `readLine` 的長度上限是 50 字元/每行，不是整個 session 累計。

## 測試與驗證

`KeyboardTest/Main.jack`（或 `SysTest`）中以互動方式驗證：按下 Page Down 應讓 keyPressed 回傳 137；在 `readLine` 關卡打錯字再按 Backspace 應看見字消失。注意要在 VM Emulator 的鍵盤面板上操作，`RAM[24576]` 才會更新。

執行步驟：Load `Main.vm`＋此檔（＋`String.vm`、`Output.vm` 等整包 OS）→ 按下虛擬鍵盤讓 keyPressed 看到非零值 → 依畫面上四關提示輸入 → 任一回逭不符都會停在該關重試，直到 `Test completed successfully`。

## 延伸討論

`Keyboard.vm` 搭配 `String.vm` 一起被編進每個需要輸入的測試資料夾。真實作業系統的鍵盤驅動會處理掃描碼、狀態記錄與中斷；Hack 鍵盤把一切簡化成一格 RAM，代價是一次只能偵測「最後一個鍵」，同時按多鍵無法分辨。`readChar` 刻意等「放開」再送字元，正是為了在這種硬體限制下避免重複觸發；若省略第二個「等放開」迴圈，使用者長按時 `readLine` 會把同一個字元重複灌入緩衝。