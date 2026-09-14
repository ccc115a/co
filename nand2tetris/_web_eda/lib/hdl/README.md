# Nand2Tetris Web EDA - HDL 模擬工具鏈

此資料夾 (`_web_eda/lib/hdl/`) 包含了在瀏覽器（Web EDA）上運行硬體描述語言 (HDL) 模擬器的核心編譯工具鏈。這套系統將 Nand2Tetris 課程中的 HDL 檔案轉換為可以用極高效率在網路上執行的 JavaScript / WebAssembly 程式碼。

## 系統架構與運作流程

整個工具鏈由四個主要檔案組成，採用標準的「編譯器前端設計」分層架構：

1. **`parser.js` (語法解析器)**
   - 負責將純文字的 `.hdl` 原始碼進行「詞法分析 (Lexical Analysis)」與「語法分析 (Syntax Analysis)」。
   - 解析出晶片的名稱 (CHIP name)、輸入腳位 (IN)、輸出腳位 (OUT) 以及內部連線架構 (PARTS)。
   - 輸出為 `ast.js` 定義的抽象語法樹 (Abstract Syntax Tree, AST) 結構。

2. **`ast.js` (抽象語法樹定義)**
   - 定義了用來表示 HDL 語法結構的類別與資料結構。
   - 包含 Pin (腳位)、Conn (連線)、Part (元件) 及 Chip (晶片) 等結點。

3. **`elab.js` (詳述與中間代碼生成)**
   - 接手 `parser` 輸出的 AST，將其轉換為可用於代碼生成的中間表示式 (IR, Intermediate Representation)。
   - **核心任務**：
     - **語意分析與連線驗證**：檢查引腳寬度是否相符，是否有懸空或重複驅動問題。
     - **內部走線 (Wires) 推導**：推算零件之間的連通線徑。
     - **拓樸排序 (Topological Sorting)**：利用 Kahn 演算法偵測各元件相依性，找出沒有「組合邏輯迴圈 (Combinational loop)」的合法執行先後順序。（循序晶片如 `Dff` 會打斷迴圈以允許 Feedback）。

4. **`codegen.js` (模擬代碼生成器)**
   - 從 `elab.js` 生成的 IR 出發，為目標目標晶片編譯產生出真正的 JavaScript 或等效執行檔。
   - 系統為每個晶片定義了內部狀態空間與 `eval()` / `tick()` 等執行週期函式。

---

## 範例解析：以 `And.hdl` 為例的模擬運作原理

假設我們要模擬以下的 `And.hdl`：

```hdl
CHIP And {
    IN a, b;
    OUT out;

    PARTS:
    Nand(a=a, b=b, out=nandOut);
    Not(in=nandOut, out=out);
}
```

當此檔案輸入到 Web EDA 時，它是這樣運作的：

### Step 1: Parser
`parser.js` 讀取文字，識別出輸入 `a, b` 寬度皆為 1，輸出 `out` 寬度為 1。並識別出 `PARTS` 清單裡有兩個呼叫：`Nand` 和 `Not`。

### Step 2: Elaboration (詳述)
`elab.js` 進入處理並做以下解析：
- 發現新訊號線：建立出內部訊號線 `wire: nandOut`。
- **偵測相依性尋找執行順序 (Topological Sort)**：
  - `Not` 需要讀取 `nandOut` 訊號線。
  - `Nand` 是 `nandOut` 訊號線的驅動者。
  - 結論：因此模擬器在每個時脈運算時，必須**先執行 `Nand`，再執行 `Not`**。

### Step 3: Code Generation (生成模擬碼)
`codegen.js` 取出 Elaboration 排好的順序與 IR，生成一段極為有效率的 JavaScript。概念上的生成產物類似於以下的程式碼：

```javascript
class And_Sim {
    constructor() {
        // 腳位暫存器
        this.a = 0;
        this.b = 0;
        this.out = 0;
        
        // 內部子元件與連線
        this.nandOut = 0;
        this.part_Nand = new Builtin_Nand();
        this.part_Not = new Not_Sim();
    }

    // 當外部改變 And_Sim.a 或是 And_Sim.b，呼叫 eval() 更新全域狀態
    eval() {
        // --- 根據 elab.js 結論出來的拓樸順序執行 ---

        // 1. 執行 Nand (把外層的 a,b 送進去計算)
        this.part_Nand.a = this.a;
        this.part_Nand.b = this.b;
        this.part_Nand.eval();
        this.nandOut = this.part_Nand.out; // 寫入 wire

        // 2. 執行 Not (取出 wire 資料進行計算)
        this.part_Not.in = this.nandOut;
        this.part_Not.eval();
        
        // 3. 輸出到實體 OUT
        this.out = this.part_Not.out;
    }
}
```

**這也是為什麼模擬速度極快的原因**：模擬器不會在執行的當下才透過字串解析去找哪個零件接到哪個零件，而是把「所有訊號線誰連誰」、「執行優先順序」在編譯期 (`elab`, `codegen`) 已經算得一清二楚，最後被展開成幾乎是直接賦值、極度扁平與快速的執行碼。

---

## 進階解析：具備狀態的循序晶片（以 `Bit.hdl` 為例）

當電路中出現資料回饋 (Feedback) 時（例如暫存器將輸出接回輸入），純組合邏輯會產生「無限迴圈」，導致模擬器死結。但依靠 `DFF`（Data Flip-Flop，循序硬體核心），模擬器會利用時序特性來處理排程。

```hdl
CHIP Bit {
    IN in, load;
    OUT out;

    PARTS:
    Mux(a=loopOut, b=in, sel=load, out=muxOut);
    DFF(in=muxOut, out=loopOut, out=out);
}
```

### 有 `DFF` 時的拓樸排序差異 (`elab.js`)

在 `elab.js` 尋找連線與執行順序時：
1. `Mux` 需要讀取 `loopOut` 線路，而 `DFF` 驅動該線路。
2. `DFF` 需要讀取 `muxOut` 線路，而 `Mux` 驅動該線路。

**這構成了一個迴圈！**
但在 `elab.js` 內有特別為循序晶片準備的保護機制（判斷 `partSeq` 是否為 True）：
```javascript
for (const rd of w.readers) {
  if (partSeq[rd]) continue; // 具有狀態的 part 輸入端在 tick 時才取樣，所以不構成組合迴圈的邊！
  // ... (建構拓樸邊)
}
```
因為 `DFF` 被系統識別為「有狀態 (Clocked / Sequential) 」，在計算拓樸相依圖的邊時，`elab.js` **刻意不將 `muxOut -> DFF` 畫為相依**！
這樣成功將原本的迴圈打斷為單向鏈（`DFF -> Mux`），讓拓樸排序能夠順利把 `Mux` 排在前面，`DFF` 則屬於邊緣末端。

### 雙週期的程式碼生成 (`codegen.js`)

為了模擬這種時序設計，含有 `DFF` 等循序邏輯的抽象層在生成的 JavaScript 模擬碼中，不再只有 `eval()`，而是擁有明確的**兩個週期函式**：組合邏輯求值的 `eval()`，以及時脈響應的 `tick()`。

```javascript
class Bit_Sim {
    constructor() {
        this.in = 0; this.load = 0; this.out = 0;
        this.loopOut = 0; this.muxOut = 0;
        this.part_Mux = new Mux_Sim();
        this.part_DFF = new Builtin_DFF(); // 內建 DFF 自身帶有時序狀態
    }

    // 週期階段 1: 組合邏輯求值 (Combinational Eval)
    eval() {
        // 1. `DFF` 輸出端不依賴現在的環境改變，取得其上一時脈的舊值
        this.loopOut = this.part_DFF.out;
        
        // 2. 執行 Mux 
        this.part_Mux.a = this.loopOut;
        this.part_Mux.b = this.in;
        this.part_Mux.sel = this.load;
        this.part_Mux.eval();
        this.muxOut = this.part_Mux.out;
        
        // 3. 把算出來的 combinatorial 結果準備好送入 DFF 門口等待
        this.part_DFF.in = this.muxOut;
        
        // 4. 對外輸出
        this.out = this.loopOut;
    }

    // 週期階段 2: 系統時脈跳動 (Sequential Tick)
    tick() {
        // 時脈一上升 (或者下降)，呼叫內部有狀態晶片的 tick
        // 只有在這個瞬間，DFF 才會吞入先前的 in 到它的內部記憶體！
        this.part_DFF.tick();
    }
}
```

1. **`eval()` 負責執行無記憶的推導 (Mux 計算)**：取得當前所有環境變數與暫存器先前的輸出值狀態，推算到底，最後停在 `DFF.in` 引腳前面排隊。
2. **`tick()` 負責時間的前進**：一旦外部發動時鐘信號 (Clock)，`tick()` 被觸發，`DFF` 就會將掛在引腳上的 `in` 正式存入核心。下一次的 `eval()` 迴圈，`DFF.out` 就會吐出最新值。

藉由 `elab.js` 的斷邊保護設計與 `codegen.js` 分割 `eval/tick` 的狀態機理念，Web EDA 完美且高效率地將這種硬體回饋化約為純軟體的輪詢程式碼。

---

## 終極範例：PC.hdl 的運作原理詳解

程式計數器 (Program Counter, `PC.hdl`) 是 Nand2Tetris 課程中極具代表性的「循序邏輯中樞」，因為它同時結合了算術運算、條件判斷與資料回饋 (Feedback Loop)。
本段落以 `PC.hdl` 為例，打通前幾個文件的觀念，帶您一覽整個模擬工具鏈是怎麼處理這樣一個複雜晶片的。

### `PC.hdl` 的原始結構

標準的 PC 內部線路長得像這樣：

```hdl
CHIP PC {
    IN in[16], load, inc, reset;
    OUT out[16];

    PARTS:
    // 回饋線路 (Feedback)
    Inc16(in=regOut, out=incOut);
    
    // 三層條件篩選
    Mux16(a=regOut, b=incOut, sel=inc, out=outInc);
    Mux16(a=outInc, b=in, sel=load, out=outLoad);
    Mux16(a=outLoad, b=false, sel=reset, out=outReset);
    
    // 主記憶與雙重輸出
    Register(in=outReset, load=true, out=out, out=regOut);
}
```

這份硬體描述會經歷以下三大階段的編譯與優化：

### 階段一：語法分析 (Parser) 的挑戰

當字串餵進 `parser.js` 處理時，除了常規的腳位轉換，它會成功處理兩個在語法上比較特別的表示式：
1. **多重輸出 (`out=out, out=regOut`)**：在 `Register` 宣告中，晶片引腳 `out` 同時被拉到了對外輸出的腳位 `out`，又分接給了內部回饋引線 `regOut`。AST 中的 `PinConn` 陣列會清楚記錄同一個核心引腳如何一對多分流。
2. **內建常數 (`b=false`)**：第三顆 `Mux16` 寫上了 `b=false`。解析器會生成 `src: { kind: 'Const', v: false }`，這讓後續引擎知道這裡固定為 0x0 即可，省去了去尋找變數的負擔。

### 階段二：詳述排程 (Elaboration) 的解結魔法

接下來 `elab.js` 接手建立有向相依圖，PC 將迎來硬體上最為棘手的挑戰：**「回授 (Feedback)」**。

1. **發現死亡迴圈**：
   - 找尋 `regOut` 的 Drivers（寫入線路）是 `Register`。
   - 然而 `Inc16` 和 `Mux16` 必須去讀取 `regOut`。
   - `Register` 本身又等在三層 `Mux16` 算出來的 `outReset` 後面等著拿輸入。
   - 在純邏輯上，這構成了一個無限迴圈（`Register` ➜ `Inc16` ➜ `Mux` ➜ `Mux` ➜ `Mux` ➜ `Register`）。

2. **打斷環節 (打破迴圈)**：
   - Kahn 拓樸演算法運作時，`elab.js` 察覺到 `Register` 先天帶有 `hasState: true` 的屬性（它是循序晶片/Clocked）。
   - 當計算邊緣（Edges）時，排程器拒絕把「讀取 `outReset`」畫進 `Register` 的先決條件內。這條邊憑空消失了！
   - 無限死結瞬間被解開，化為一條由上而下的瀑布：`Inc16` ➜ 第一顆 `Mux16` ➜ 第二顆 ➜ 第三顆 ➜ `Register`。

這個動作在物理上意味著：「`Inc16` 取用的值是暫存器**上一秒的舊值**，所以它們的運算絕不會互相卡死！」

### 階段三：雙週期代碼生成 (Codegen)

現在 `codegen.js` 來把這個打斷迴圈的瀑布轉寫成實體 JavaScript Class。這份代碼擁有所謂的「Master-Slave 兩階段取樣（時脈跳動）」運作架構。
產出的核心程式碼大致如下：

```javascript
class PCChip {
  constructor() {
    this._p0 = new Inc16Chip();
    this._p1 = new Mux16Chip();
    this._p2 = new Mux16Chip();
    this._p3 = new Mux16Chip();
    this._p4 = new RegChip();  // 內建的有狀態 Register
  }

  // == 階段 1：無心智的組合運算 (Combinational Eval) ==
  eval(in_, load, inc, reset) {
    let w_regOut = this._p4.eval().out;  // 直接調用上一週期的舊紀錄
    
    // 瀑布傾瀉而下...
    let w_incOut = this._p0.eval(w_regOut).out;
    let w_outInc = this._p1.eval(w_regOut, w_incOut, inc).out;
    let w_outLoad = this._p2.eval(w_outInc, in_, load).out;
    let w_outReset = this._p3.eval(w_outLoad, 0x0, reset).out;  // 常數 false 自動轉為 0x0
    
    // 把結果送到 Register 家門口堆著，不要進門
    this._p4.in = w_outReset;
    this._p4.load = 1;
    
    return { out: w_regOut };
  }

  // == 階段 2：時脈同步上升 (Sequential Sample & Tock) ==
  sample(in_, load, inc, reset) {
    // 確保所有路徑上的組合邏輯最新電位都抵達家門口
    this.eval(in_, load, inc, reset);
    // 指揮 Register (Master 級別) 確認吸收門口的新訊號
    this._p4.sample(this._p4.in, 1);
  }

  tock() {
    // 進入時脈下降緣，Register 正式翻轉狀態 (Slave 級別)，全域狀態更新
    this._p4.tock();
  }
}
```

#### 總結：Master-Slave 架構與 `tock()` 的奧秘
1. **傳遞延遲（`eval` 階段）**：當你拉動 PC 的引腳時，發生的是觸發 `eval()` ；所有的邏輯閘（`Inc`, `Mux`）像水一樣高速流到底，最後停在 `Register` 門口待命。此時晶片對外狀態依然是舊的！
2. **鎖存與翻轉（`sample` 與 `tock` 階段）**：
   - **`sample()`（擷取信號）**：呼叫 `sample` 時，`Register` 會把家門口排隊的資料吞入一個**隱藏的暫存變數 (Master Latch)** 內，這對應了時脈開始上升。此時對外界而言，PC 的輸出完全沒變。這保證了在同一個時鐘週期內，其他硬體不論怎麼連線，都不會因為 PC 內部值變化而抓到「未來的假數值」。
   - **`tock()`（正式更新）**：當所有元件都安全完成 `sample` 後，系統廣播發動 `tock()` 命令（時脈下降緣），此時 `Register` (Slave Latch) 才會真正將隱藏抽屜裡的資料寫到 `out` 以發布對外輸出。

這也就是為什麼 `tock()` 內部幾乎沒有覆雜運算，它只做一件事——**「把藏在抽屜裡準備好的新資料，正式擺上桌面給大家看」**。將讀 (`eval`)、存 (`sample`) 與更新對外狀態 (`tock`) 切割，正是這套軟體模擬器能夠完美迴避時序碰撞、精準模擬同步邏輯 (Synchronous Logic) 的最重要基礎。

在 Web 模擬器裡，一切高深的硬體反饋電路，就這樣優雅且暴力地化成了簡單的 JavaScript 二元函式。

---

## 補充重點：為什麼必須嚴格切分 `tick()` 與 `tock()`？

在硬體設計與 Nand2Tetris 中，**`tick()`**（在我們產生出的程式碼中常對應為 `sample()`）與 **`tock()`** 構成了完整的「雙相時鐘週期 (Two-Phase Clock Cycle)」。這完全反映了真實世界時脈信號的「上升緣 (Rising edge)」與「下降緣 (Falling edge)」：

1. **`tick()` / `sample()` ——「擷取鎖存」 (Rising Edge)**
   - 所有具備記憶能力的循序元件 (主要源頭為 DFF)，會在這一刻把排在輸入引腳 (`in`) 上的電壓訊號，吞嚥到自己的內部隱藏空間內（這在硬體上稱為主鎖存器 / **Master Latch**）。
   - **最關鍵特性：不改變對外輸出**。在 `tick()` 完成時，元件的對外 `out` 引腳**絕對維持原本的舊值**。這保證了電路上其他仰賴這個輸出的邏輯閘，不會在同一瞬間拿到「剛換上的未來數值」而造成時序錯亂。
2. **`tock()` ——「翻轉更新」 (Falling Edge)**
   - 負責將剛才 `tick()` 階段藏在內部隱藏空間的新資料，推送到對外的 `out` 引腳上展示（在硬體上稱為從鎖存器 / **Slave Latch**更新）。
   - **最關鍵特性：引發下一波的物理電壓瀑布**。當 `tock()` 結束時，因為記憶元件的輸出集體翻新，依附在它們後面的純組合邏輯電路（`eval()`）的電壓就會開始改變、一路高速連鎖推演到下一個記憶元件的門口。

**若不分開 (缺乏時序隔離) 的災難：**
假設 `PC` 的暫存器輸出 `out` 被 `Inc16` 加 1 後又接回自己的 `in`。
如果我們沒有分開 `tick` 與 `tock`，而是只有一個「馬上讀取新值並立刻輸出」的函數，就會在同一個瞬間發生：
`拿到 0` ➜ `加 1 變 1` ➜ `輸出 1` ➜ `下個元件立刻拿到 1 又變成 2` ➜ `變成 3` ... 導致在一次時脈之內發生無限跳號的死結（這稱為 Race Condition 或時序競爭）！

所以，類比硬體物理必須把操作劈成兩半：
> **`tick()` 負責「把大家目前的結果都先截圖記到底片裡，但是先不沖洗」**。
> **`tock()` 負責「大家一起把照片沖洗出來換上去」**。

這正是軟體模擬器能夠精準模擬真實同步時序邏輯 (Synchronous Logic) 且不會無窮迴圈的最佳解答。

---

## 附錄：RAM / ROM 的模擬方法——不是一顆顆 DFF 跑，而是「結構昇華」

Nand2Tetris 的記憶體（`RAM8/64/512/4K/16K`）與程式計數器所在附近的 `ROM32K`，
都屬「容量以千計的 stateful 晶片」。若照 `And.hdl` 那套「遞迴展開成原子 DFF 網路」
的方式模擬，每顆 cell 就要跑一整串 `DFF`＋解碼多工，呼叫次數會以 `容量 × 位元寬`
倍增，一跑起來就是幾百萬次函式呼叫。為此，`codegen.js` 對這兩類記憶體做了
**結構昇華（Structural Lifting）**：認出它們的典型長相，直接編譯成 JS 原生陣列，
模擬時一次 `mem[address]` 就完成，完全不碰 bit 層。

### 1）RAM 家族：識別「標準 RAM 骨架」後融合成 `Uint16Array`

先看 `codegen.js` 的 `isNativeRamChip()`（`codegen.js:267`）：

```javascript
const RAM_FAMILY = new Set(['RAM8', 'RAM64', 'RAM512', 'RAM4K', 'RAM16K']);
// 條件：10 個 parts、恰好 { DMux8Way ×1, Mux8Way16 ×1, Register 或 RAM* ×8 }
```

只要晶片符合這副「DMux8Way 解碼 + 一排 8 個 Register/RAM 槽 + Mux8Way16 選出」的
標準骨架（`RAM8/64/512/4K/16K` 全部長這樣），`codegen.js` 就**不把它展開成閘級**，
改產出 `genNativeRamChip()`（`codegen.js:289`）的原生類別：

```javascript
class Ram16K_Chip {
  constructor() {
    this.mem = new Uint16Array(16384); // 整個 RAM 就是一個 JS 陣列！
    this._b = 0; this._ba = 0; this._bl = false; // 寫入兩相緩衝
  }
  eval(in_, load, address) {
    const a = address & 0xffff;
    return { out: a < 16384 ? this.mem[a] : 0 }; // 讀 = 直接索引
  }
  sample(in_, load, address) {
    this._bl = load !== 0;                    // tick：只「記下」要寫入的值
    this._b = in_ & 0xffff;
    this._ba = address & 0xffff;
  }
  tock() {
    if (this._bl && this._ba < 16384) this.mem[this._ba] = this._b; // 提交
    this._bl = false;
  }
}
```

關鍵語義與閘級版完全等價，但成本完全不同：

- **讀（`eval`）**：`mem[a]` 單次陣列索引，O(1)；跟「8 路選到槽、槽再選到 cell、
  再展開 16 顆 DFF 讀出」比起來近乎零成本。
- **寫（`sample`/`tock`）**：`sample` 把「要寫的值、位址、load 旗標」暫存進
  `_b/_ba/_bl`（對應 tick 的 master latch，不影響對外讀值）；`tock` 再一次寫入。
  兩相緩衝正是為了維持前面 `tick()`/`tock()` 的語意：同一週期內先寫後讀，
  讀到的還是舊值，時序不會互相踩踏。
- **探測（probe）**：`.tst` 裡 `RAM16K[i]` 這種輸出，就是直接回 `mem[i]`，
  所以 Riscv5stage 的測試能直接把 `RAM16K[0]` 放進 `output-list`。

> 白話說：這顆 RAM 的「物理」其實是一個 `Uint16Array`。只有最底層的 `Nand`、
> `DFF` 這種原始型別是以 0/1 邏輯存在；一遇到 RAM/Register 這類「整顆值」的
> 元件，模擬器早已把它們昇華成 JS 的整數與陣列，模擬一支程式根本不會去碰 bit。

### 2）ROM32K：內建類別 + `load()` 直接吃 `.bin`

`ROM32K` 不是教材 HDL 而是內建晶片（見 `elab.js` 的 `Builtin.Rom32k`），
`codegen.js` 產出的 `Rom32KChip`（`codegen.js:198`）本質就是
`new Uint16Array(32768)`：

```javascript
constructor() { this.mem = new Uint16Array(32768); }
eval(address) { return { out: address < 32768 ? this.mem[address] : 0 }; }
load(src) {
  for (const line of String(src).split('\n')) {
    // 每一行 parse 成 16 位元二元值 → this.mem[idx] = v & 0xffff;
  }
}
```

`.tst` 開頭寫的 `ROM32K load prog.bin`（cli 會把 `prog.bin` 的內容餵進來），
就是把整支程式一次倒進這個 `Uint16Array`；`eval` 時 `mem[pc]` 取出指令。
來源 `src` 若是一串數字字串，也會經由 `globalThis.HACKJS_FS` 的讀檔介面解析。

### 3）Register / DFF：同樣昇華成整數

共享同一套哲學：`ARegister/DRegister` 是「一個 JS Number + latch/q 兩相」
（`RegChip`，`codegen.js:186`），`DFF` 是 1-bit 的 `latch/q`（`DffChip`）。
所以—純組合電路 → 一顆顆 child chip 的 `eval()` 串起來；
有記憶的元件 → 一律昇華成「陣列 / 數字 + 兩相緩衝」。整個模擬就是這樣又快又簡單。

### 4）界線與地雷：16-bit 是鎖死的

這套昇華有明確的界線：**所有 wire 數值都被面具鎖在 16 位元**——

- `sub()`（`codegen.js:38`）：`n >= 16` 就直接回傳整個值，否則 `& ((1<<n)-1)`。
- `setBits()`（`codegen.js:160`）：`const mask = n >= 16 ? 0xffff : ((1 << n) - 1);`
- `Rom32k / Reg / RAM family` 全部用 `Uint16Array`／`& 0xffff`。

也就是說，`.hdl` 裡寫 `IN a[16]` 或更寬的 bus 時，16-bit 原版（`../_web_eda16/`）的 codegen
會把它當「≥16」直接整條過，值域仍是 0..0xffff。要做真正的 32-bit 資料通路，
本引擎（`_web_eda/`）已把 `sub()/setBits()` 的 mask 改成
`0xffffffff`（JS 位元運算對 Number 仍然安全）、記憶體/暫存器改用 32-bit 版本，
再自行提供 32-bit 版本的 Register/RAM/ROM 內建或原生融合規則。
