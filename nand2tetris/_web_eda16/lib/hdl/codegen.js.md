# `codegen.js` 程式設計原理

`codegen.js` 是工具鏈的後端 (Back-end) 代碼生成器。其任務是「將 `elab.js` 的排程與中介結構樹 `ElabChip`，輾壓扁平化為執行速度極快的純 JavaScript ES6 Class」。

## 範例：從 IR 生成高效能 JS 模擬碼 (`FullAdder` 範例)

以剛才的 `FullAdder` 舉例，當 `codegen.js` 收到了 `evalOrder: [0, 1, 2]` 這個結論，以及相關的零件配置後，產出的 `.js` 類別程式碼結構會如下：

```javascript
// ---- FullAdder ----
class FullAdderChip {
  constructor() {
    // 透過 AST，生成所需要實例化的各類別
    this._p0 = new HalfAdderChip();
    this._p1 = new HalfAdderChip();
    this._p2 = new OrChip();
  }

  // 純組合邏輯求值
  eval(a, b, c) {
    // 依據 elab 的 Wire 分析，宣告區域變數收集線路狀態
    let w_sum1 = 0;
    let w_carry1 = 0;
    let w_carry2 = 0;
    let w_sum = 0;
    let w_carry = 0;

    // --- 開始依照 Topo 順序 [0, 1, 2] 逐一行計算 ---
    
    { // part 0: HalfAdder 
      // __o 將取得回傳物件 (含有其 output pins)
      const __o = this._p0.eval(a, b);   // a,b 皆為最上層 args 傳入
      w_sum1 = setBits(w_sum1, 0, 1, __o.sum);
      w_carry1 = setBits(w_carry1, 0, 1, __o.carry);
    }
    { // part 1: HalfAdder
      // 輸入改為拿取剛才算完的 `w_sum1` 與外部進來的 `c`
      const __o = this._p1.eval(w_sum1, c);
      w_sum = setBits(w_sum, 0, 1, __o.sum);
      w_carry2 = setBits(w_carry2, 0, 1, __o.carry);
    }
    { // part 2: Or
      // Or 負責讀取 `carry1` 和 `carry2` 這兩條 Wire
      const __o = this._p2.eval(w_carry1, w_carry2);
      w_carry = setBits(w_carry, 0, 1, __o.out);
    }

    // 將指派到對外 OUT 的 wire 封裝回傳
    return {
      sum: w_sum,
      carry: w_carry,
    };
  }
}
```
*這就是為什麼模擬速度如此狂暴的原因。藉由預先在編譯期算好一切相依性，模擬期間 CPU 實際上只做單純的 `setBits` 位元拼貼運算和線性函式呼叫。*

---

## 其他進階機制補充

### 1. 時序狀態機更新（`sample` 與 `tock`）
若元件中含有循序屬性 (像是 `DFF` 或 Registers)，`codegen.js` 不只會提供 `eval()` 算術方法，還會對應產生 `sample()` 與 `tock()` 階段：
- `sample()`：重跑組合邏輯後，呼叫所有子狀態元件的 `sample(...)`，此時 DFF Master 記憶輸入但不輸出。
- `tock()`：將所有子狀態元件集體推進一格（寫入 Slave），完成真正的硬體 Clock Tick。

### 2. Native RAM 效能大躍進 (Ram Mapping)
若檢查到使用者撰寫的晶片是標準由 `Mux`, `DMux` 和多個 Register 拼成的 `RAM8 ~ RAM16K` 結構 (`isNativeRamChip` = true)。
`codegen.js` 會捨棄展開 $O(N)$ 個 Register 的模擬邏輯，而是直接生成具有 Web 原生 `Uint16Array` 的類別！
這個超強的最佳化能徹底將記憶體深層遞迴存取的效能降為 $O(1)$，同時 `eval` 及 `probe` 介面皆對稱無損。
