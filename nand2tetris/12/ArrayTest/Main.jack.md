# ArrayTest/Main.jack 程式說明

這是第 12 章「作業系統」中，用來驗證 OS 內 `Array` 類別是否正確運作的測試主程式。它本身不畫圖、不輸出文字，而是把測試結果寫入固定的記憶體位址（RAM 8000–8003），再由 `.tst` 批次檔比對這些位址的內容。

## 概述

- 在第 12 章，學生要自己實作 `Array.jack`（也就是堆積記憶體管理之上的陣列物件），而這個 `Main.jack` 是官方提供的驗收標準。
- 測試方法是「先把結果算出來，放在 RAM[8000] 起的一段連續位址」，因為硬體模擬器與 VM Emulator 都能直接觀察 RAM，不需要螢幕輸出。
- 依賴的 OS 服務：`Array.new`（配置陣列）、`Array.dispose`（釋放陣列），兩者又依賴 `Memory.alloc` / `Memory.deAlloc`。

## 架構總覽

類別 `Main` 只有一個 `function void main()`，變數：

- `r`（型別 `Array`）：當作「結果暫存區」，直接指向 RAM 的 8000 號位址（Jack 中任何物件本質上都是位址，所以 `let r = 8000;` 是合法且刻意的技巧）。
- `a`、`b`、`c`：被測試的陣列物件。

主流程分五段，每段驗證「配置 → 寫入 → 讀出 → 寫進 r」這個循環：

| 步驟 | 動作 | 期望的 r[n] |
|------|------|------------|
| 1 | `a = Array.new(3)`，`a[2] = 222` | `r[0] = 222` |
| 2 | `b = Array.new(3)`，`b[1] = a[2] − 100` | `r[1] = 122` |
| 3 | `c = Array.new(500)`（大型陣列），`c[499] = a[2] − b[1]` | `r[2] = 100` |
| 4 | 釋放 `a`、`b`，再 `Array.new(3)` 重用空間，`b[0] = c[499] − 90` | `r[3] = 10` |
| 5 | 釋放 `c`、`b` | — |

## 原理

- **指標即位址**：Jack 的 `Array` 變數裝的就是記憶體位址。把 `r` 設成 8000 後，`r[0]`、`r[1]`… 就是直接寫 RAM 上的連續單字。
- **為何要用 dispose 再 new**：步驟 4 刻意在釋放 3 格的 `a`、`b` 之後再配置一個 3 格的陣列，測試 `Memory.deAlloc` 是否把空間還回 free list，讓下一次 `alloc` 重用同一塊記憶體——若 OS 管錯空間，結果就會錯。

## 實作細節

- `let a[2] = 222;` 在編譯後翻譯成 VM 的 `push constant 2 / push local 1 / add / ... / pop that 0`，也就是「`a` 的位址 + 2 的那一格」。
- `do a.dispose();` 是對 instance 呼叫 method，編譯成 `call Array.dispose 1`，把隱含參數 `this` 傳進去，迴避了 Jack 語法上不能直接「呼叫物件方法」的限制。
- 結果的註解（`// RAM[8001] = 122`）直接標出驗收檔期望值，方便比對。

## 測試與驗證

對應的 `ArrayTest.tst` 會：

```
load Sysobj/ArrayTest/Main.vm,
repeat 1000000 { vmstep; }
output-list RAM[8000]..., RAM[8003];
```

跑完（或按「Fast-forward」直到 `repeat` 結束）後，檢查輸出是否與 `ArrayTest.cmp` 一致：

```
|RAM[8000]|RAM[8001]|RAM[8002]|RAM[8003]|
|     222 |     122 |     100 |      10 |
```

在 VM Emulator 中：Load 該資料夾的 `.tst`，用「Run」直到進度條完成即可；也可用 `Ctrl` 設 Breakpoint 觀察 RAM 區塊。

## 延伸討論

這個測試同時也驗證了 `Memory.alloc` / `deAlloc` 的回收與重用（步驟 4）。真實作業系統的 heap manager 若沒有把釋放塊接回（coalescing 後的）free list，陣列重複 new/dispose 後就會取到重疊或錯誤的位址，直接反映在 RAM[8003] 的數值上。另外注意它測的是「陣列型別語法 + 記憶體配置」這條鏈，並不測算術，因此內容比 MathTest 單純。