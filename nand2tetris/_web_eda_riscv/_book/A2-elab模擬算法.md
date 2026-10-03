# A2 elab 模擬算法：拿三顆晶片走一遍詳述

## 用法

[`elab.js`](../lib/hdl/elab.js) 的入口只有一個：`elab(lib, 頂層名)`。
`lib` 是 `{晶片名: AST}` 對照表（[`loadLibrary`](../lib/hdl/elab.js) 掃目錄、
[`mergeLibs`](../lib/hdl/elab.js) 疊多個，後蓋前）。
回傳 `Elab{chips, names, top}`；每顆 `ElabChip` 帶三樣東西給後端用：
`wires`（每條線的寬度、驅動者、讀者）、`evalOrder`（求值順序）、
`hasState`（有沒有記憶）。拿 [A1 章](A1-HDL模擬範例.md)的三顆實測：

```
FullAdder → 7 條 wire，evalOrder [0,2,3,4,1,5,6]，hasState false
Adder2bit → 3 條 wire，evalOrder [0,1]，hasState false
Bit       → 3 條 wire，evalOrder [1,0]，hasState true
```

下面用這三顆，把算法從頭到尾走一遍。

## 完整範例一：FullAdder 的拓樸排序是怎麼排出来的

輸入（[`FullAdder.hdl`](../third_party/courses/02/FullAdder.hdl)，part 編號 0–6 照原文順序：
0:Xor、1:Xor、2:And、3:And、4:And、5:Or、6:Or，全是無記憶內建）：

```
Xor(a=a, b=b, out=s1);          // part 0
Xor(a=s1, b=c, out=sum);        // part 1
And(a=a, b=b, out=ab);          // part 2
And(a=b, b=c, out=bc);          // part 3
And(a=a, b=c, out=ac);          // part 4
Or(a=ab, b=bc, out=abORbc);     // part 5
Or(a=abORbc, b=ac, out=carry);  // part 6
```

**Pass A**（只看輸出接線，收集「誰驅動哪條線」）：

| wire | 驅動者 |
|---|---|
| `s1` | part 0 |
| `sum`、`ab`、`bc`、`ac`、`abORbc`、`carry` | part 1～6 各一條 |

沒有重疊驅動，7 條 wire 全寬 1。

**Pass B**（只看輸入接線，記錄「誰讀哪條線」；`a/b/c` 是晶片輸入，
不算 wire 讀者）：`s1` 被 part 1 讀；`ab/bc` 被 part 5 讀；
`ac/abORbc` 被 part 6 讀。

**建邊**（寫者→讀者）：`0→1`、`2→5`、`3→5`、`4→6`、`5→6`。
入度 `indeg = [0,1,0,0,0,2,2]`。

**Kahn 一步步跑**（同層維持原文順序，所以初始就緒隊列是 `[0,2,3,4]`）：

```
就緒 [0,2,3,4] → 取 0：1 的入度 1→0，就緒 [2,3,4,1]，已排 [0]
→ 取 2：5 的入度 2→1，已排 [0,2]
→ 取 3：5 的入度 1→0，就緒加 5，已排 [0,2,3]
→ 取 4：6 的入度 2→1，已排 [0,2,3,4]
→ 取 1：無出邊，已排 [0,2,3,4,1]
→ 取 5：6 的入度 1→0，就緒加 6，已排 […,5]
→ 取 6：完成 [0,2,3,4,1,5,6]
```

和真實輸出完全一致。注意 part 1（第二顆 Xor）雖然原文第二個出現，
卻排到第 5——因為它要等 `s1`，**原文順序只在「同層無依賴」時才有效**。

## 完整範例二：Bit 的迴圈是怎麼斷開的

輸入（[`Bit.hdl`](../third_party/courses/03/a/Bit.hdl)，part 0:Mux、part 1:DFF）：

```
Mux(a=do, b=in, sel=load, out=mo);
DFF(in=mo, out=do, out=out);
```

wire：`mo`（寫者 0、讀者 1）、`do`（寫者 1、讀者 0）、`out`（寫者 1）。
如果照 FullAdder 的建法，會得到 `0→1` 又 `1→0`，Kahn 一個也排不出來——
這就是組合迴圈錯誤。但先看 `partSeq`（誰有記憶）：`[false, true]`，
DFF 是有狀態的。

**關鍵規則**（程式裡就一行）：讀者若有狀態，這條邊**不建**。
`mo` 的讀者是 part 1（DFF，有狀態）→ 跳過；
`do` 的讀者是 part 0（Mux，無狀態）→ 建邊 `1→0`。
入度 `[1,0]`，就緒 `[1]`，順序 `[1,0]`——和真實輸出一致。

道理（[11 章](11-從接線圖到執行順序.md)講過，這裡看程式怎麼落地）：
DFF 的輸入是「下個時脈才要記的」，它的求值不急；排序時只保證
「DFF 的舊輸出先就緒」（排前面），Mux 讀到的 `do` 永遠是上個周期的值。
`sample()` 照 `[1,0]` 先算 DFF 舊輸出、再算 Mux、最後遞迴取樣，
`tock` 才提交——斷環不斷義，時序是對的。

## 完整範例三：Adder2bit 的階層是怎麼解開的

輸入（示範晶片，兩顆使用者零件，不是內建）：

```
FullAdder(a=a[0], b=b[0], c=cin, sum=sum[0], carry=c0);  // part 0
FullAdder(a=a[1], b=b[1], c=c0, sum=sum[1], carry=cout);  // part 1
```

**先遞迴**：處理自己之前，先把子晶片 `FullAdder` 詳述完
（`Resolver.resolve`，有 `visiting` 堆疊防 `A 用 B、B 用 A` 的參考圈，
解過的記 `names` 下次直接拿）。拿到子晶片的 pin 定義，才回頭處理自己——
這就是「階層」在程式裡的樣子：深度優先，子先父後。

**Pass A**：`sum=sum[0]` 在 wire `sum` 上佔 `[0,1)` 位元，
`sum=sum[1]` 佔 `[1,2)`——不重疊所以合法，wire 寬取最大到達 `2`；
`c0`、`cout` 各被寫一次。**Pass B**：`a[0]` 這種是晶片輸入的切片，
不算 wire 讀者；只有 `c=c0`（part 1 讀 wire `c0`）記一筆。
建邊只有一條 `0→1`（低位先算，高位等進位——ripple-carry 在排序裡現形），
順序 `[0,1]`。`hasState` 逐層上報（兩層都是 false，所以整顆 false）。

## 報錯也是算法的一部分（真實訊息）

寬度對不上：`Not(in=a /* a 是 2-bit */, out=o)` →

```
晶片 Bad: `Not.in=` 寬度不合（pin 1 位元 vs 訊號 2 位元）
```

同一條線寫兩次：`out=o` 寫了兩遍 →

```
晶片 Bad2: wire `o` 上的 0..1 位元被重複驅動
```

分別來自 Pass B 的相等檢查和 Pass A 的區間重疊檢查——
報錯行都帶晶片名和位元，照著修接線就行。

## 原理小結：六步的設計理由

1. **遞迴先解子晶片**：父晶片要知道子的 pin 寬才能檢查自己，只能子先父後；
   `visiting` 防參考圈，`names` 做記憶化。
2. **Pass A 只看輸出**：先確定「每條線是誰寫的、多寬」，輸入暫時不管，
   這樣錯誤定位乾淨（重複驅動一定是輸出側的問題）。
3. **位元區間而非整條**：`sum[0]`／`sum[1]` 分開佔位，bus 拼接、
   部分驅動才表達得出來；`OUT` 還要整段覆蓋檢查，防懸空位。
4. **Pass B 只看輸入**：把訊號源分成常數／wire／wire 切片／晶片輸入四種，
   寬度必須相等（`Whole` 按 pin 寬展開，這就是 `Range` 不記寬度的原因）。
5. **有狀態讀者不斷邊**：排序只排組合依賴，時序依賴交給 tick／tock；
   剩下的真排不出來才是組合迴圈，報錯。
6. **Kahn 同層保原文序**：同樣的圖永遠排出同樣的順序，模擬確定、
   `.cmp` 可比；`hasState` 冒泡給上層和 codegen 用。
