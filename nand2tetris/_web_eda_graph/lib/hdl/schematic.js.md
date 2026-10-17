# `lib/hdl/schematic.js`——電路圖資料＋自動佈局（v4.0）

把單層 `CHIP` 的 `PARTS` 轉成可在 `hdl.html` 逐層點入的階層圖。
刻意只看 AST 單層（`lib` 是 `name -> Chip`），不跑 `elab` 全域詳述：
自訂貼上缺一顆子晶片時仍能畫出本層，缺件標成「找不到」而非整頁報錯。

## 公開 API（`HdlGraph` IIFE）

- `levelOf(lib, chipName)`——單層圖資料：
  `parts[i] = { slot, label, type, kind, builtin, drillable, primitive, missing, inPins, outPins, conns }`，
  其中 `kind ∈ user｜builtin｜missing`，`drillable` 僅使用者晶片為真，
  `primitive` 為 `Nand`／`DFF` 時是鑽入終點；
  `conns` 逐條保留 `pin=src`（`dir` 區分 in/out，`n` 為該接腳位元數）；
  `wires` 記錄每條內部線的 writers／readers 與是否為 IN／OUT。
- `depthsOf(level)`——每個 part 的分層深度（上游 writer 最大深度＋1，迭代收斂）。
- `layoutOf(level)`——確定性版面：同深度同 x（`LEFT + d×(BOX+GAP)`），
  同欄垂直堆疊；IN 在左、OUT 在右；回傳
  `{ width, height, boxes, inPins, outPins, edges, maxDepth }`。
  `edges` 每一條輸入 `Sig` 連線一條（常數只留標籤不拉線），
  `bus` 表示多位元（前端畫粗線），`kind ∈ wire｜in｜out｜dangling`。
- `describe(type, lib)`——右側面板說明：原語（Nand 真值表／DFF 行為）、
  內建葉節點、使用者晶片（IN／OUT＋子元件數）、缺件四種。
- `isPrimitive(type)`、`childPins(type, lib)`——終點判斷與子晶片腳位查詢。

## 與 embed 的接合

本檔 `import { builtinOf, builtinInOut, builtinSequential, Builtin } from './elab.js'`；
`tools/embed.js` 會剝掉 import 行，瀏覽器走同一全域作用域的同名函式。
頂層符號包在 `HdlGraph` IIFE 內（與 `Vm2Rv` 同慣例），`embed.js` 匯出
`HackHdl.HdlGraph`。

## 前端渲染（`dist/hdl.js`）

`layoutOf` 的座標直接轉 SVG：盒子可點擊（`drillable` 才進下一層），
原語盒顯示真值表浮層；麵包屑記錄鑽入路徑，點任一層可跳回。
