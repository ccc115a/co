# KeyboardTest/Main.jack 程式說明

這是第 12 章 OS 的鍵盤類別（`Keyboard.jack`）測試主程式。它要求使用者實際按下鍵盤、輸入字串與整數，並在畫面上判定「ok」或重試，直到全部正確為止。

## 概述

- 測試共四關：`keyPressed`（偵測按鍵）、`readChar`（讀取字元並回顯）、`readLine`（讀一整行、含 backspace）、`readInt`（讀整數）。
- 因為需要「真人互動」，不適合用 `.cmp` 批次比對，而是由使用者確認畫面輸出。
- 依賴的 OS 服務：`Keyboard.keyPressed/readChar/readLine/readInt`、`Output.*`、`String.*`。

## 架構總覽

`function void main()` 的區域變數：

- `c`：最近一次按下的字元；`key`：輪詢用的暫存。
- `s`：readLine 回傳的字串；`i`：readInt 回傳的整數；`ok`：該關是否通過。

主流程是「四關循序 + 每關無限重試」：

| 關卡 | 提示訊息 | 通過條件 |
|------|----------|----------|
| keyPressed | 請按 Page Down（ASCII 137） | `c = 137` |
| readChar | 請按數字 3 | `c = 51`（'3'）且螢幕有回顯 |
| readLine | 請打 JACK 後按 Enter | `s.length() = 4` 且四個字元依序是 J、A、C、K（74、65、67、75） |
| readInt | 請打 −32123 | `i = −32123` |

最後印出 `Test completed successfully`。

## 原理

- **keyPressed 測試**：作業系統的鍵盤是「記憶體對映」(`Keyboard.init` 把基址設成 24576)。`keyPressed()` 回傳目前按下鍵的 ASCII，沒按則為 0。測試先等待 `key ≠ 0`（按下時刻），記住 `c`，再等 `key = 0`（放開時刻）——這樣才能取得「單一按鍵」而不是連續掃描。
- **readLine 測試**：`Keyboard.readLine` 內部用 `String.new(50)` 累積字元，遇到 `String.backSpace()`(129) 就 `eraseLastChar`，遇到 `String.newLine()`(128) 才結束。所以這關同時驗證「echo、倒退鍵、字串累積」。

## 實作細節

- 判字元相等用 ASCII 數字：`c = 137`（Page Down 的擴充碼）、`c = 51`、四連 `&` 檢查 JACK。
- `while (key = 0) { let key = Keyboard.keyPressed(); }` 是標準的「輪詢直到按下」；`while (~(key = 0))` 是「輪詢直到放開」。
- 每關先印標題，再進入 `while (~ok)` 重試迴圈，直到使用者給出正確輸入才跳到下一關。

## 測試與驗證

在 VM Emulator 中載入整個 `KeyboardTest` 資料夾（含編譯好的 `Keyboard.vm`、`String.vm`），並「點選螢幕後按鍵（Keyboard 模組有虛擬鍵盤）」依指示操作：

1. 按 Page Down → 螢幕印 `ok`；
2. 按 '3' → 應看到回顯 '3' 與 `ok`；
3. 輸入 `JACK`（可試按 Backspace 驗證倒退功能）→ Enter → `ok`；
4. 輸入 `-32123` → Enter → `ok`；
5. 最後看到 `Test completed successfully`。

任一步輸入錯誤都會停在該關重試，正是「互動測試」與「批次測試」最大不同處。

## 延伸討論

`readInt("...")` 其實只是 `readLine` 後接 `String.intValue()`：先收字串，再逐位把字元轉成整數（含負號），所以輸入 `-32123` 時既測了 `readLine` 的腳本，也測了 `intValue` 的符號處理。若你的 `Keyboard.jack` 忘了回顯字元，第二關畫面就不會出現按下的字，這代表 `readChar` 中缺少 `Output.printChar`。