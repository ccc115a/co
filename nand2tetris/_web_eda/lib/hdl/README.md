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

#### 總結
1. 當你拉動 PC 的引腳時，實際上發生的是觸發 `eval()` 迴圈；所有的邏輯閘（`Inc`, `Mux`）像水一樣高速流到底，最後停在 `Register` 門口待命。
2. 當虛擬時脈打落（呼叫 `sample()` 與 `tock()` 階段）時，`Register` 才會正式吞下這口資料；至此 PC 完成一週期的進位或是跳躍（Reset/Load）！

在 Web 模擬器裡，一切高深的硬體反饋電路，就這樣優雅且暴力地化成了簡單的 JavaScript 二元函式。
