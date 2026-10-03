# 10 從文字到電路：HDL 解析

## 用法

[`parser.js`](../lib/hdl/parser.js) 沒有獨立 CLI，用法就是呼叫它：
把 `.hdl` 全文丟進 `parseHdl`，拿回一顆結構化的 `Chip` 物件。
後面 [11 章](11-從接線圖到執行順序.md) 的詳述、`hdl.html` 的即時解析，
吃的都是這個輸出。

## 完整範例

輸入：[`Not.hdl`](../third_party/courses/01/Not.hdl)（最短的完整晶片，一個輸入、一顆 Nand）：

```
CHIP Not {
    IN in;
    OUT out;

    PARTS:
    Nand(a=in, b=in, out=out);
}
```

輸出：`parseHdl` 回傳的物件（`JSON.stringify` 印出，全文如下，
注意它已經沒有註解、沒有分號，只剩結構）：

```json
{
 "name": "Not",
 "inPins": [ { "name": "in", "width": 1 } ],
 "outPins": [ { "name": "out", "width": 1 } ],
 "parts": [
  {
   "chip": "Nand",
   "conns": [
    { "pin": "a", "pinRange": { "kind": "Whole" },
      "src": { "kind": "Sig", "name": "in", "range": { "kind": "Whole" } } },
    { "pin": "b", "pinRange": { "kind": "Whole" },
      "src": { "kind": "Sig", "name": "in", "range": { "kind": "Whole" } } },
    { "pin": "out", "pinRange": { "kind": "Whole" },
      "src": { "kind": "Sig", "name": "out", "range": { "kind": "Whole" } } }
   ]
  }
 ]
}
```

`Nand(a=in, b=in, out=out)` 一行，變成三個 `PinConn`
（pin 名＋pin 範圍＋訊號源）；後面章節直接用這些物件，再也不碰原始文字。

## 原理：為什麼分兩步

電腦讀不懂文字，要先切成「有結構的資料」，這是編譯器前端幾十年不變的套路：

1. **詞法分析**（`lex`）：把字串切成最小單位（token），例如 `CHIP`、
   `Not`、`{`。這步只認「字長什麼樣」：`//`、`/* */` 註解丟掉；
   `{ } [ ] = , ; : ( )` 是單字元 token；`..` 是範圍符號（單一 `.` 非法）；
   數字只收十進位且上限 65535；其餘湊成識別字。
   每個 token 都記行列號——錯誤訊息能指到 `3:12` 就是靠這個。
2. **語法分析**（`Parser` 類）：遞迴下降，每個文法規則一個函式
   （`parseChip`／`parsePins`／`parsePart`／`parsePinRef`／`parseExpr`），
   手上有 `peek`（看一眼不吃掉）、`next`（吃掉）、`expect`（必須是某種，
   不是就報錯）。手寫 parser 最常見的寫法，沒有魔法。

[`ast.js`](../lib/hdl/ast.js) 就是上面 JSON 的型別定義：
`Range` 只有三種形狀（整條／某一位／某一段），注意它**不記寬度**
（整條有多寬是 elab 查 pin 表才知道的）；`Expr` 只有兩種
（常數 `true/false`，或某條訊號）；`Part` 的實例標籤就等於子晶片名。
parser 只保證「形狀合法」；接線對不對、誰先算誰後算，是 [11 章](11-從接線圖到執行順序.md) 的事。
