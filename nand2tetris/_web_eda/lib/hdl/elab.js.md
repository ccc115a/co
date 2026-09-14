# `elab.js` 程式設計原理

`elab.js` (詳述過程式) 負責銜接抽象語法樹 (`ast.js`) 與目的碼生成 (`codegen.js`)，是編譯器裡面最重要的 **中介與驗證引擎** (Intermediate Representation & Verification Engine)。
它的職責是找出所有隱藏線路 (Wires)、確認引腳對接、以及執行 Kahn 演算法得出安全的拓樸計算順序。

## 運作原理與階段拆解 (以 `FullAdder` 舉例)

我們以剛才 `ast.js` 舉出的 `FullAdder.hdl` 為例：
```hdl
// IN a, b, c
// OUT sum, carry
HalfAdder(a=a, b=b, sum=sum1, carry=carry1);    // Part 0
HalfAdder(a=sum1, b=c, sum=sum, carry=carry2);  // Part 1
Or(a=carry1, b=carry2, out=carry);              // Part 2
```

### 1. Pass A — 收集發送者與找出隱藏線 (Writers Analysis)
在此階段會抓出所有元件的「輸出端 (`out=...`)」，並具現化成連通線 `Wire`：
- **`sum1`**: 由 Part 0 的 `sum` 驅動 (width=1)。
- **`carry1`**: 由 Part 0 的 `carry` 驅動 (width=1)。
- **`carry2`**: 由 Part 1 的 `carry` 驅動 (width=1)。
- **`sum` 與 `carry`**: 分別由 Part 1 與 Part 2 驅動，這剛好是晶片的對外 `OUT` 腳。

*驗證機制：如果有人寫出 `And(..., out=x); Not(..., out=x);`，在 Pass A 就會發現 `x` 這個 `Wire` 有兩個人同時嘗試驅動同一個 bit，進而擲出「多重驅動」錯誤！*

### 2. Pass B — 連接接收者 (Readers Analysis)
找出每個元件的「輸入端 (`in=...`)」到底接到了誰：
- Part 1 的 `a` 接到線路 `Wire(sum1)`，它成為了 `sum1` 的 Reader。
- Part 2 的 `a` 接到 `Wire(carry1)`，他是 `carry1` 的 Reader。
- Part 2 的 `b` 接到 `Wire(carry2)`，他是 `carry2` 的 Reader。

### 3. 拓樸排序 (Topological Sorting: Kahn's Algorithm)
擁有完整連線後，進行相依性排程，這決定模擬器求值的先後順序：
1. 繪製圖形：
   - Part 0 沒有讀取任何內部 Wire (只讀取外部的 IN 腳位)。入邊數 (`indeg` = 0)。
   - Part 1 讀取了 `sum1` (來自 Part 0)，入邊數為 1。
   - Part 2 讀取了 `carry1` (來自 Part 0) 和 `carry2` (來自 Part 1)，入邊數為 2。
2. 進行拔除：
   - 把 `indeg=0` 的 **Part 0** 加入佇列。拔除連帶邊，使得 Part 1 入邊變成 0，Part 2 變成 1。
   - 把 **Part 1** 加入佇列。拔除邊，Part 2 入邊變成 0。
   - 抽出 **Part 2** 加入佇列。
3. 最終排出的合法 `evalOrder` 順序陣列為：`[0, 1, 2]`。

這個由 Pass B 串起的關聯圖，經過 Kahn 演算法梳理後，生成能讓 `codegen.js` 直接攤平印出程式碼的中間物 (`ElabChip`)，確保了資料流在 `codegen` 中一定會由上往下計算，絕不卡彈。
