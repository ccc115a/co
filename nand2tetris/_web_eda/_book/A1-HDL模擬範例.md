# A HDL 模擬範例：三顆晶片走完全程

## 用法

本章的三個範例跑法和 [14 章](14-hdl2js一鍵模擬.md)相同：`.hdl` 加 `.tst`
交給 `hdl2js`，拿 `.out` 去對 `.cmp`：

```
node cli/hdl2js.js --dir ../01 --dir ../02 --test ../02/FullAdder.tst
```

```
PASS ../02/FullAdder.cmp
==== 結果：1 通過，0 失敗 ====
```

下面用三顆晶片演示同一條鏈（解析→詳述→產生碼→模擬）碰到不同電路形狀時
會發生什麼事：**FullAdder**（多層組合）、**Adder2bit**（使用者自搭的階層＋
進位鏈）、**Bit**（有記憶的時序）。輸入、輸出的每一行都是實際跑出來的。

## 例一 FullAdder：三位元加法（組合，七顆零件）

輸入 [`FullAdder.hdl`](../third_party/courses/02/FullAdder.hdl)全文：

```
CHIP FullAdder {
    IN a, b, c;  // 1-bit inputs
    OUT sum,     // Right bit of a + b + c
        carry;   // Left bit of a + b + c

    PARTS:
    Xor(a=a, b=b, out=s1);
    Xor(a=s1, b=c, out=sum);
    And(a=a, b=b, out=ab);
    And(a=b, b=c, out=bc);
    And(a=a, b=c, out=ac);
    Or(a=ab, b=bc, out=abORbc);
    Or(a=abORbc, b=ac, out=carry);
}
```

中間格式（詳述完的 IR 摘要，真實輸出）：7 條 wire
（`s1/sum/ab/bc/ac/abORbc/carry`，全寬 1），求值順序 `[0,2,3,4,1,5,6]`——
注意不是原文順序：`Xor(s1)` 是 part 1 卻排第 5，因為它要等 `s1`；
三顆 `And`（part 2,3,4）只吃輸入所以緊跟 part 0。`hasState: false`，
整顆是純組合，模擬時一個 `eval` 就算完。

模擬（[`FullAdder.tst`](../third_party/courses/02/FullAdder.tst) 把 a/b/c 八種組合各 `eval`
一次，輸出 [`FullAdder.cmp`](../third_party/courses/02/FullAdder.cmp) 全文）：

```
|   a   |   b   |   c   |  sum  | carry |
|   0   |   0   |   0   |   0   |   0   |
|   0   |   0   |   1   |   1   |   0   |
|   0   |   1   |   0   |   1   |   0   |
|   0   |   1   |   1   |   0   |   1   |
|   1   |   0   |   0   |   1   |   0   |
|   1   |   0   |   1   |   0   |   1   |
|   1   |   1   |   0   |   0   |   1   |
|   1   |   1   |   1   |   1   |   1   |
```

抽一行驗算 `a=1,b=1,c=0`：`s1＝1^1＝0`，`sum＝0^0＝0`；
`ab＝1`、`bc＝0`、`ac＝0`，`carry＝(1|0)|0＝1`——和表一致。
這就是「模擬」在組合電路上的全部：照順序把每個零件算一遍。

## 例二 Adder2bit：自己搭的階層（進位鏈）

輸入（示範用，兩顆 `FullAdder` 串成 2-bit 加法器；`a[0]` 這種切片寫法
[10 章](10-hdl從文字到電路.md)介紹過）：

```
CHIP Adder2bit {
    IN a[2], b[2], cin;
    OUT sum[2], cout;

    PARTS:
    FullAdder(a=a[0], b=b[0], c=cin, sum=sum[0], carry=c0);
    FullAdder(a=a[1], b=b[1], c=c0, sum=sum[1], carry=cout);
}
```

中間格式（真實輸出）：只有 3 條 wire（`sum` 寬 2、`c0`、`cout`），
求值順序 `[0,1]`——低位先算，因為高位的進位輸入 `c0` 是低位算出來的。
這條進位鏈 `c0` 就是所謂 ripple-carry：進位一級一級漣漪過去。
注意這裡的子零件是使用者晶片（`FullAdder`），不是內建：elab 照樣遞迴
解開，`hasState` 逐層上報（兩層都是 false）。

模擬用的 `.tst`（三組數各 `eval` 一次，全文）和真實 `.out`（全文；
表頭按欄寬截斷，`cout` 顯示成 `cou` 是照規格置中截斷，不是 bug）：

```
load Adder2bit.hdl,
output-list a%B1.2.1 b%B1.2.1 sum%B1.2.1 cout%B1.1.1;
set a %B01, set b %B01, set cin 0, eval, output;
set a %B11, set b %B01, set cin 0, eval, output;
set a %B11, set b %B11, set cin 1, eval, output;
```

```
| a  | b  |sum |cou|
| 01 | 01 | 10 | 0 |
| 11 | 01 | 00 | 1 |
| 11 | 11 | 11 | 1 |
```

逐行驗：`01+01＝10`（1+1=2）；`11+01＝00` 進位 1（3+1=4，低兩位歸零）；
`11+11+cin＝11` 進位 1（3+3+1=7）。進位鏈 work：第二行的 `cout=1`
正是第一顆的 `carry` 經 `c0` 傳進第二顆的 `c` 再冒出來。

## 例三 Bit：有記憶的時序（tick／tock 兩相）

輸入 [`Bit.hdl`](../third_party/courses/03/a/Bit.hdl)（`Mux` 選「保持舊值還是吃新輸入」，
`DFF` 記住它；註解就是規格：`load=1` 時下周期輸出等於輸入）：

```
CHIP Bit {
    IN in, load;
    OUT out;

    PARTS:
		Mux(a=do, b=in, sel=load, out=mo);
		DFF(in=mo, out=do, out=out);
}
```

中間格式（真實輸出）：3 條 wire（`mo/do/out`），求值順序 `[1,0]`——
`DFF`（part 1）排在 `Mux`（part 0）**前面**。這正是 [11 章](11-從接線圖到執行順序.md)
說的斷環：讀記憶元件的人不列入依賴，所以 `Mux→DFF` 這條邊在排序時被跳過。
`hasState: true`，模擬必須走 tick／tock。

產生碼的 `sample()`（真實產物，截錄）：先照 `[1,0]` 把 `DFF` 的舊輸出
算進 `w_do`／`w_out`，再算 `Mux` 得 `w_mo`，最後**遞迴取樣**
`this._p1.sample(w_mo)`——DFF 的 `latch` 記下 `mo`，但 `q`（秀出去的）
要等 `tock` 才更新。一句話：tick 只記不秀，tock 才秀。

模擬（[`Bit.tst`](../third_party/courses/03/a/Bit.tst) 交替 `tick,output`／`tock,output`，
輸出 [`Bit.cmp`](../third_party/courses/03/a/Bit.cmp) 前 8 行，真實）：

```
| time | in  |load | out |
| 0+   |  0  |  0  |  0  |
| 1    |  0  |  0  |  0  |
| 1+   |  0  |  1  |  0  |
| 2    |  0  |  1  |  0  |
| 2+   |  1  |  0  |  0  |
| 3    |  1  |  0  |  0  |
| 3+   |  1  |  1  |  0  |
| 4    |  1  |  1  |  1  |
```

`time` 的 `+` 是半周期記號（tick 之後、tock 之前）。逐格驗狀態：
`1+`（in=0,load=1）tick 只把 `latch` 記成 0，`out` 仍是舊值 0；
`3+`（in=1,load=1）tick 記下 1，`out` 還是 0；
`4`（tock 之後）`q` 提交，`out` 才變 1——**輸入和輸出永遠差一個周期**，
這就是時序電路和組合電路的根本差別。`4+`（in=0,load=0）記住 1 不放，
`out` 保持 1，規格的 else 分支成立。

## 小結：三種形狀，三種跑法

| 形狀 | 例子 | 詳述結果 | 模擬動作 |
|---|---|---|---|
| 單層組合 | FullAdder | 拓樸序一次排好 | 一個 `eval` 照序算完 |
| 階層組合 | Adder2bit | 遞迴解開，進位鏈決定順序 | 同上（只是零件是使用者晶片） |
| 時序回饋 | Bit | 讀記憶者不斷環，`hasState` 上報 | `tick` 記、`tock` 秀，輸出晚一拍 |

工具链（[10](10-hdl從文字到電路.md)→[11](11-從接線圖到執行順序.md)→[12](12-把電路變成程式.md)→[13](13-tst測試的語言.md)→[14](14-hdl2js一鍵模擬.md)）本身完全不用改；
換一顆晶片，只是換一份輸入，同一條鏈照跑。
