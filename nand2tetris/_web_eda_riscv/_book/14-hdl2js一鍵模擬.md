# 14 一鍵模擬：`cli/hdl2js.js`

## 用法

[`hdl2js.js`](../cli/hdl2js.js) 把 10–13 章四步串成一個指令：

```
node cli/hdl2js.js --dir ../01 --dir ../02 [--test ../02/ALU.tst] [--top NAME] [--out gen] [--keep]
```

- `--dir` 必填可重複：零件庫在哪，後蓋前。
- `--test` 可重複：只跑指定的 `.tst`；省略就把目錄下所有 `.tst`
  按檔名排序全跑（`Memory.tst` 除外——要人工按鍵，見 13 章）。
- `--top`：頂層晶片名；省略時從 `.tst` 的 `load` 行自己讀。
- `--keep`：把自足 ESM 存到 `<out>/<Top>_sim/hw.js` 留著研究。

## 完整範例

```
$ node cli/hdl2js.js --dir ../01 --dir ../02 --test ../01/And.tst
PASS ../01/And.cmp
==== 結果：1 通過，0 失敗 ====
```

## 原理：串起來＋找檔案

每個測資跑 `runOne`：讀檔→`parseScript`→`elab`→`generateJs`→
`new Function` 現場編出 class→`TopModel` 包裝→`run`（`.tst` 所在目錄
當 `baseDir`，所以 `ROM32K load x.hack` 用相對路徑找得到檔）。
比對失敗會 throw，有失敗 exit 1——[`verify.sh`](../verify.sh)
就靠 exit code 擋門。

另一個鉤子：`HACKJS_FS`。產出程式讀 ROM 檔不直接碰 `fs`，
而是走這個全域 hook；命令列版掛 Node 真檔案，瀏覽器版掛語料 map
（50 章）。同一份產生碼兩邊跑，靠的就是這層間接。
`--release` 只是佔位旗標。
