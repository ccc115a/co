# `ast.js` 程式設計原理

`ast.js` 定義了 HDL 硬體描述語言在 Web EDA 系統中的「抽象語法樹 (Abstract Syntax Tree, AST)」資料結構。它的核心職責是為 `parser.js` 建立強型別、結構化的類別，用以精確保存自原始碼提取的語法意義。此模組對應到 Rust 版專案的 `_eda/hackhdl/src/ast.rs`。

## 支援的語法結構定義

在 `ast.js` 中定義了用來表示這些元素的核心類別：

### 1. `Range` (範圍存取)
用來表示針對陣列/Bus 所做的範圍切片。它支援三種形式：
- `Whole`: 存取整個 Bus (如 `out=out`)。
- `Bit`: 存取單一位元 (如 `b[0]`)。
- `Slice`: 存取一個區段 (如 `b[0..7]`)。

### 2. `Expr` (連線右側表達式)
用來記錄 HDL 當中 `[子引腳] = [訊號源]` 的 **訊號源** 部份。支援兩種來源：
- `Const`: 常數，例如 `true(1)` 或 `false(0)`。
- `Sig`: 訊號，可能是一條外部的 `IN` pin 或是內部的線 `Wire`（含 Range 切片資訊）。

### 3. `PinConn` (引腳連線)與 `Part` (實例元件)
- **`PinConn`**：描述一個等號 (如 `a=a` 或 `out[0..7]=w`) 的映射關係，包含了目標引腳名稱、其範圍 (`Range`) 與訊號來源 (`Expr`)。
- **`Part`**：代表一個被呼叫的實例化電路區塊（例如 `Nand(a=..., b=...)`），並包含針對它所設定的 `PinConn` 清單。

### 4. `Chip` (晶片本體)
最高級別的結構，包含晶片名稱、`inPins` / `outPins`，以及 `parts` 實例。

---

## 範例：`FullAdder.hdl` 的 AST 展開樣貌

當系統讀取到如下的 `FullAdder.hdl` 原始碼時：

```hdl
CHIP FullAdder {
    IN a, b, c;
    OUT sum, carry;

    PARTS:
    HalfAdder(a=a, b=b, sum=sum1, carry=carry1);
    HalfAdder(a=sum1, b=c, sum=sum, carry=carry2);
    Or(a=carry1, b=carry2, out=carry);
}
```

這段程式碼在經過 parser 後，在 `ast.js` 中的實體化結構（轉換為 JSON 格式）將長得類似這樣：

```json
{
  "name": "FullAdder",
  "inPins": [
    { "name": "a", "width": 1 },
    { "name": "b", "width": 1 },
    { "name": "c", "width": 1 }
  ],
  "outPins": [
    { "name": "sum", "width": 1 },
    { "name": "carry", "width": 1 }
  ],
  "parts": [
    {
      "chip": "HalfAdder",
      "conns": [
        { "pin": "a", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "a", "range": { "kind": "Whole" } } },
        { "pin": "b", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "b", "range": { "kind": "Whole" } } },
        { "pin": "sum", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "sum1", "range": { "kind": "Whole" } } },
        { "pin": "carry", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "carry1", "range": { "kind": "Whole" } } }
      ]
    },
    {
      "chip": "HalfAdder",
      "conns": [
        { "pin": "a", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "sum1", "range": { "kind": "Whole" } } },
        { "pin": "b", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "c", "range": { "kind": "Whole" } } },
        { "pin": "sum", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "sum", "range": { "kind": "Whole" } } },
        { "pin": "carry", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "carry2", "range": { "kind": "Whole" } } }
      ]
    },
    {
      "chip": "Or",
      "conns": [
        { "pin": "a", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "carry1", "range": { "kind": "Whole" } } },
        { "pin": "b", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "carry2", "range": { "kind": "Whole" } } },
        { "pin": "out", "pinRange": { "kind": "Whole" }, "src": { "kind": "Sig", "name": "carry", "range": { "kind": "Whole" } } }
      ]
    }
  ]
}
```

這個無異議、完全結構化的 AST，就是下一階段 `elab.js` 用來查閱連線，進行排程與檢查相依性的絕對依據。
