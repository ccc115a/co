# A3 Kahn 拓樸排序：原文、走讀、原理

## 用法

這段程式住在 [`elab.js`](../lib/hdl/elab.js) 的 `elabChip` 尾巴
（[A2 章](A2-elab模擬算法.md)講的是它在幹嘛，這裡看它怎麼寫）。
輸入是前面 Pass A／B 建好的三樣東西：`parts`（零件表）、
`wires`（每條線的 `writers`／`readers`）、`partSeq`（誰有記憶）。
輸出 `order` 直接變成 `ElabChip.evalOrder`——模擬時就照這個順序算。

## 完整範例一：JS 原始碼全文（[`elab.js`](../lib/hdl/elab.js) 459–500 行，一字未改）

```js
    // 拓樸排序（前向參考允許）
    const n = parts.length;
    const partSeq = parts.map((p) => {
      if (p.clip.kind === 'Builtin') return builtinSequential(p.clip.b);
      return this.chips[p.clip.idx].hasState;
    });
    const adj = Array.from({ length: n }, () => []);
    const indeg = new Array(n).fill(0);
    for (const w of wires) {
      if (w.writers.length === 0) {
        throw new ElabError(`${context}: wire \`${w.name}\` 沒有驅動者`);
      }
      for (const rd of w.readers) {
        if (partSeq[rd]) continue; // 有狀態 part 的輸入在 tick 才取樣
        for (const wr of w.writers) {
          if (rd === wr.part) {
            throw new ElabError(
              `${context}: wire \`${w.name}\` 同時被 part ${rd} 寫入與讀取（組合迴圈）`
            );
          }
          adj[wr.part].push(rd);
          indeg[rd] += 1;
        }
      }
    }
    // Kahn，同層維持原順序
    const order = [];
    const ready = [];
    for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i);
    let k = 0;
    while (k < ready.length) {
      const u = ready[k];
      k += 1;
      order.push(u);
      for (const v of adj[u]) {
        indeg[v] -= 1;
        if (indeg[v] === 0) ready.push(v);
      }
    }
    if (order.length !== n) {
      throw new ElabError(`${context}: parts 存在組合迴圈（${n - order.length}-part 未被排序）`);
    }
```

## 完整範例二：拿 FullAdder 走一遍（真實數據）

[`FullAdder.hdl`](../third_party/courses/02/FullAdder.hdl) 七個 part（0:Xor、1:Xor、2,3,4:And、
5,6:Or），全是無記憶內建，`partSeq` 全 false。
各 wire 的寫者→讀者：`s1:0→1`、`ab:2→5`、`bc:3→5`、`ac:4→6`、`abORbc:5→6`
（`sum`、`carry` 沒人讀，不建邊）。入度 `indeg = [0,1,0,0,0,2,2]`：

```
初始就緒 [0,2,3,4]（i 由小到大掃，這就是「同層維持原順序」）
k=0 取 0：adj[0]=[1]，indeg[1] 1→0，入隊 → 就緒 [0,2,3,4,1]，已排 [0]
k=1 取 2：adj[2]=[5]，indeg[5] 2→1，已排 [0,2]
k=2 取 3：adj[3]=[5]，indeg[5] 1→0，入隊 → 已排 [0,2,3]
k=3 取 4：adj[4]=[6]，indeg[6] 2→1，已排 [0,2,3,4]
k=4 取 1：無出邊，已排 [0,2,3,4,1]
k=5 取 5：adj[5]=[6]，indeg[6] 1→0，入隊 → 已排 […,5]
k=6 取 6：完成 [0,2,3,4,1,5,6]
```

`order.length(7) === n(7)`，過關，存進 `evalOrder`。
注意 part 1（第二顆 Xor）原文第二個出現，卻排到第 5——
**就緒隊列只保證「同層」照原文序，有依賴的照依賴**。

## 完整範例三：排不出來長什麼樣（真實報錯）

```
CHIP Loop2 {
    IN a; OUT o;
    PARTS:
    And(a=v, b=a, out=w);
    And(a=w, b=a, out=v);
    Or(a=v, b=a, out=o);
}
```

`w` 的寫者是 part 0、讀者是 part 1（邊 `0→1`）；
`v` 的寫者是 part 1、讀者是 part 0（邊 `1→0`）——互相等對方。
入度 `[1,1,1]`（part 2 讀 `v`，也被卡住），就緒隊列一開始就是空的，
`while` 一次都不跑，`order` 長度 0。程式照規矩報錯（真實訊息）：

```
晶片 Loop2: parts 存在組合迴圈（3-part 未被排序）
```

括號裡的數字就是「卡住幾個」，除錯時直接去看那幾顆的接線圈。

## 原理：每一行為什麼長這樣

- **`partSeq` 先算好**：建邊時要查上萬次的話現算太慢，先一張表查好；
  user 晶片看它底下有沒有記憶（`hasState` 冒泡上來的，[12 章](12-把電路變成程式.md)提過）。
- **`w.writers.length === 0` 先擋**：沒人寫的線讀了也是未知數，
  與其讓它進排序，不如直接報「沒有驅動者」。
- **`if (partSeq[rd]) continue`**：整段算法唯一配合硬體的地方。
  DFF 這類零件的輸入是下個時脈的事，不列入「現在誰等誰」——
  [Bit](A1-HDL模擬範例.md) 的迴圈不斷開，後面全排不出來。
- **`rd === wr.part` 自環檢查**：自己寫又自己讀，連等都不用等，
  肯定是迴圈，當場報。
- **`ready` 用索引 `k` 而不用 `shift()`**：`shift()` 每次搬整個陣列是 O(n)，
  索引往前走是 O(1)；n 小時沒差，這是寫 performances 敏感程式的習慣。
- **初始掃描 `i` 由小到大**：就緒者按 part 編號（即原文順序）入隊，
  同樣的圖永遠排出同樣的順序——模擬確定，`.cmp` 才比得起來。
- **最後比長度**：排完幾個和總數對不上，就是有圈（例三），
  不用另外寫環偵測，Kahn「排不出來」本身就是偵測。
