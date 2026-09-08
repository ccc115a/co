# ArrayTest/Array.vm 程式說明

`Array.vm` 是第 12 章 OS 類別 `Array.jack` 編譯出來的 VM 碼，只有 12 行、兩個函式。它是「陣列＝一塊貫通記憶體」概念的最低層介面：`new` 拿一塊堆積空間，`dispose` 還回去。

## 概述

- `Array` 是 Jack 語言內建的「萬用容器」語法（`a[i]`），但底層它只是一個位址。真正負責「取得／歸還空間」的是 `Memory.alloc` 與 `Memory.deAlloc`。
- 因此整個 `Array.vm` 只是把 `Memory` 類別的兩個函式包一層薄殼。
- 被誰使用：所有的 `Array.new / x.dispose()`，以及 `String`、`Output`、`Math`、`Memory` 自己內部（例如 `Math.init` 的 `Array.new(16)`）。

## 架構總覽

兩個函式：

- `function Array.new 0`：把 `argument 0`（要求的字數）轉交給 `Memory.alloc`，回傳的是可用區塊的開頭位址。
- `function Array.dispose 0`：把 `this`（`argument 0` 就是物件位址）轉交給 `Memory.deAlloc`。

兩者都是薄包裝，本體邏輯在 `Memory` 的 `alloc`/`deAlloc`（見 MemoryTest/Memory.vm）。

## 原理

- `Array.new(size)` 敘述 `return Memory.alloc(size);` 只要求配置 *size* 個字，但 `Memory.alloc` 內部會再多要一些字元放標頭（記錄長度與串接指標），回傳位址則指向「第一個可使用字」，好把「管理資訊」藏在使用者看不到的地方。
- `dispose` 傳的是 `this`，也就是 `Array.new` 回傳的基底位址；`Memory.deAlloc` 會把 `object[ALLOC_SIZE]` 讀回來，等它知道整塊大小後，再把「基底位址 − 1」的標頭填回 free list。

## 實作細節

- `function Array.new 0 / push argument 0 / call Memory.alloc 1 / return`
  參數從 `argument 0` 進，結果直接留在堆疊頂端回傳，沒有任何區域變數，所以「0」。
- `function Array.dispose 0`：
  ```
  push argument 0      ; 物件位址 = this
  pop pointer 0        ; 把它設成 THIS
  push pointer 0       ; 再把 this 當參數
  call Memory.deAlloc 1
  pop temp 0           ; 丟掉 void 回傳值
  push constant 0
  return
  ```
  這是 method 翻譯的標準型態：先 `pop pointer 0` 定義 `this`，而 `Memory.deAlloc` 是 function，所以我們自己把 `this` 放在 `argument 0` 傳入。

## 測試與驗證

`ArrayTest/Main.vm` 即負責測試：反覆 `Array.new(3)`、`Array.new(500)`、`dispose` 後再 `new`，用 RAM[8000]–[8003] 的值驗證每塊記憶體配置與重用是否正確。執行方式見 `ArrayTest/Main.vm` 的說明，透過 `ArrayTest.tst` + VM Emulator 跑一百萬步。

要注意 `Array.vm` 只在「跳過 `Sys.init` 直接進 `Main.main`」的批次測試中由測試夾自帶；正常啟動路徑是 `Sys.init → Memory.init` 先把 free list 建好。若直接把沒初始化 heap 的程式丟進 VM Emulator，`Memory.alloc` 會以未設定的 `freeList`（可能是 0）開跑而當機。

## 延伸討論

在真實的 Jack 型別系統中，`Array` 刻意「沒有 content」，因為任何型別都能放進 `Array`；這也讓 `Array` 可以拿來當「把整數形塑成記憶體位址」的工具（如測試中的 `let r = 8000`）。想要更有效率，可在編譯器端把「完型已知的陣列」直接配在 static 區，Nand2Tetris 的 Jack 則統一走 heap，換取語法一致性。反過來說，`Array` 也把「Memory.alloc 回傳的裸位址」一併包裝成語言可用的索引存取，是「heap 管理 ↔ 程式語法」之間的橋樑。