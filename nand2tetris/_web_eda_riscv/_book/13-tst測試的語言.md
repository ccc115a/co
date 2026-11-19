# 13 測試的語言：`.tst` 腳本

## 用法

`.tst` 檔就是測試的操作手冊，交給 [`hdl2js`](../cli/hdl2js.js) 跑：

```
node cli/hdl2js.js --dir ../01 --dir ../02 --test ../01/And.tst
```

跑完會印（真實輸出）：

```
PASS ../01/And.cmp
==== 結果：1 通過，0 失敗 ====
```

`PASS` 表示跑出來的 `.out` 和老師給的 `.cmp` 一字不差。

## 完整範例

輸入 [`And.tst`](../third_party/courses/01/And.tst) 全文（四段式：測哪顆、答案寫哪跟誰比、
表格長什麼樣、四組輸入各算一次）：

```
load And.hdl,
output-file And.out,
compare-to And.cmp,
output-list a%B3.1.3 b%B3.1.3 out%B3.1.3;

set a 0,
set b 0,
eval,
output;

set a 0,
set b 1,
eval,
output;

set a 1,
set b 0,
eval,
output;

set a 1,
set b 1,
eval,
output;
```

輸出 [`And.cmp`](../third_party/courses/01/And.cmp) 全文（跑出來的 `.out` 必須長這樣）：

```
|   a   |   b   |  out  |
|   0   |   0   |   0   |
|   0   |   1   |   0   |
|   1   |   0   |   0   |
|   1   |   1   |   1   |
```

## 原理：硬體測試＝設輸入、推時脈、抄答案、對標準答案

- `output-list` 的 `%B3.1.3` 是「格式＋欄寬」：B 二進位、D 十進位、
  X 十六進位、S 時間欄；數字是左空格、欄寬、右空格。
- `eval`：組合電路算一次（上面每組輸入各一次）。
  `tick, tock`：時序電路推一個周期；`output` 的 `time` 欄記 `0、1、2…`，
  `tick` 之後印會多一個 `+`（半周期記號）。
  例：[`sum10.tst`](../Riscv32i/sum10.tst) 跑 45 個周期，`pc` 從 1 數到 9，
  `dbgReg` 欄跟著累加器走出 `0→1→3→6→…→55`，最後凍結——整張表就是
  程式執行的縮時攝影。
- `repeat n { }`：迴圈；`while out <> 75 { }`：等到條件成立（鍵盤測資用，
  批次跑上限十萬次，`Memory.tst` 要真人按鍵所以自動化直接跳過它）。
- `ROM32K load x.hack`：把程式灌進 ROM 再跑（Computer 系列、`rv32i`
  測資都長這樣）。
- `set` 的值可寫十進位、`%B` 二進位、`%X` 十六進位。

對應到程式：[`tst.js`](../lib/rt/tst.js) 的 `parseScript` 切指令
（`,`／`;` 分隔、`{ }` 成塊），`run` 照 `tick/tock` 維護 `{cycle, half}`
計時，`output` 經 [`fmt.js`](../lib/rt/fmt.js) 排成表格，
`reportCompare` 逐行比對（檔尾換行不計，前 5 個不符才印，行數不同也算輸）。
[`model.js`](../lib/rt/model.js)（`TopModel`）是頂層包裝：輸入預設 0、
`tick＝取樣＋重算`、`tock＝提交＋重算＋計時；`set RAM[3] 7` 走
`set_probe` 進記憶體深處；讀不到的值印 `***`。
