# SysTest/Main.jack 程式說明

這是第 12 章 OS 的系統類別（`Sys.jack`）中 `Sys.wait` 程式的測試主程式。它先等使用者按下任意鍵（含放開），再呼叫 `Sys.wait(2000)` 停頓 2 秒，用「人體時鐘」驗證延遲毫秒數是否正確。

## 概述

- 測試目標：`Sys.wait(duration)`——約略等待 duration 毫秒後回傳。
- 是「互動+時序」型測試：沒有批次比對，靠使用者感受時間長短。
- 依賴：`Sys.wait`、`Keyboard.keyPressed`、`Output.printString/println`、以及 OS 啟動流程（`Sys.init` → `Main.main`）。

## 架構總覽

`function void main()` 變數 `key`（char）。流程：

1. 印 `Wait test:` 並換行。
2. 印提示 `Press any key. After 2 seconds, another message will be printed:`
3. `while (key = 0) { key = Keyboard.keyPressed(); }`——等按下。
4. `while (~(key = 0)) { key = Keyboard.keyPressed(); }`——等放開（避免按住期間重複觸發）。
5. `do Sys.wait(2000);`
6. 印 `Time is up. Make sure that 2 seconds had passed.`

## 原理

- **wait 的實作**（見 Sys.jack）：雙層空迴圈。外迴圈跑 `i=0..duration-1` 共 duration 次，內迴圈每次跑 200 步（`j=0..199`），總共約 `duration×200` 個「nop」步。在標準 clockrate 下約等於 milliseconds，因此傳 2000 ≈ 2 秒。
- **測試驗證**：使用者按下任意鍵到「Time is up」出現之間，應明顯有 2 秒延遲。由於是「約略」，±幾毫秒都算通過。
- 這也示範了「等待時間」是 CPU 忙碌迴圈而非中斷：CPU 全程 100% 佔用，沒有省電。

## 實作細節

- 步驟 3、4 的雙重輪詢與 KeyboardTest 相同——先記下按下的 key，再等到放空，確保「一次按下」被辨識而非長按連發。
- `do Sys.wait(2000);` 是 function 呼叫（非 method），編譯結果為 `push constant 2000; call Sys.wait 1; pop temp 0`——只帶一個參數（duration），回傳的 0 被丟棄。

## 測試與驗證

在 VM Emulator（或硬體模擬器）中載入 `SysTest` 並執行（VM 版本由主機模擬，可配 `Sys.wait` 直接照跑）：

1. 執行到提示訊息出現；
2. 按下鍵盤任意鍵；
3. 觀察約 2 秒後第二則訊息出現；
4. 若太快/太慢，代表你的 `Sys.wait` 迴圈計數或 clockrate 設錯。

因時序無法批次驗證，本測試沒有 `.cmp` 檔案。硬體上執行則需配合完整的 `Computer.hdl` 與 OS 開機流程：啟動後 CPU 先執行 `Sys.init`，依序初始化各類別才進入 `Main.main`。

## 延伸討論

`Sys.wait` 是 OS 中最「感覺得到」的函式之一，也是「演算法設計→規格量測」的好練習：若要 1 秒而 user 端實測是 0.5 秒，多半是內迴圈計數與 CPU 週期的換算少了一半。真實作業系統以 timer interrupt 與 task sleep 實現精確延遲並釋放 CPU；Hack 的忙碌迴圈版本是「無硬體 timer」之下的樸素替代，也是第 12 章 OS 的最後一塊拼圖。值得強調的是：本測試能過不代表 `Sys.wait(1000) = 1.000 秒`，它只保證「大約」——對一個沒有時脈晶片的 Hack，這種犧牲精度的延遲已是合理設計。