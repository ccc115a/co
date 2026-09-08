# compiler.py 程式說明：含 `if`/`while` 的微型編譯器

這個程式把一套含 `let`、`while`、`if/else`、`print` 的迷你陳述式語言，編譯成
「四元組」（quadruple）形式的中間碼（IR），是第 8 章 VM 進階（控制流）的前置練習
「p0 if/while」。它示範編譯器的完整輪廓：**詞法分析 → 語法分析 → 中間碼產生**。

## 概述

先看輸入輸出。輸入是一個文字檔內容（本程式的版本直接內嵌範例）：

```c
let i = 1;
let sum = 0;
while (i <= 5) {
    let sum = sum + i;
    let i = i + 1;
    if (i == 3) { print sum; } else { print i; }
}
print sum;
```

輸出是四元組 `(op, arg1, arg2, result)` 的列表，例如 `while` 會被展開成
`label`、條件判斷 `if_false`、`goto` 與結尾 `label` 的組合，這正是 Nand2Tetris
第 8 章 VM 語言中 `label`/`goto`/`if-goto` 控制流的雛形。

本程式的兄弟版本 `09/05-p0func/compiler.py` 在此基礎上加入函式 `function/call/return`；
本版聚焦在**控制流**如何被翻譯。

## 架構總覽

`Compiler` 類別的一整個生命週期就是編譯器的生命週期：

| 階段 | 對應程式碼 | 產物 |
|------|-----------|------|
| 詞法分析 | `tokenize()` | `self.tokens`（(種類, 文字) 對）|
| 語法分析 | `parse_program()` → 各 `parse_*` | 直接邊剖析邊產生 IR |
| 中間碼產生 | `emit()` | `self.ir_code`（四元組列表）|

### 全域狀態（即編譯器的「手牌」）

| 欄位 | 意義 |
|------|------|
| `tokens` | 已切好的 token 串列 |
| `pos` | 剖析遊標，指向下一個要吃的 token |
| `temp_count` | 計數器，決定暫存變數名字（`t0`、`t1`…）|
| `label_count` | 計數器，決定標籤名字（`L0`、`L1`…）|
| `ir_code` | 收集輸出的四元組列表 |

四個輔助方法支撐整個剖析流程：`peek()`（偷看不吃）、`consume()`（檢查並吃掉）、
`new_temp()` / `new_label()`（產生不重複的新名字）、`emit()`（輸出四元組）。

## 原理

### 文法（輸入語言）

```
program    → statement*
statement  → 'let' id '=' expr ';'
           | 'while' '(' expr ')' statement
           | 'if' '(' expr ')' statement ('else' statement)?
           | 'print' expr ';'
           | '{' statement* '}'          ← 區塊
expression → term (op term)*             ← 左至右、不分優先權
term       → id | number
```

與第 3 章的 `expParser` 不同，這裡的剖析不再是「邊剖析邊求值」，而是「邊剖析邊
**產生指令**」──這是質變：下一個階段（機器的直譯器、或最終的組合語言）才知道
`t0`、`L1` 這些記號的值。

### while 的翻譯樣板

`while (cond) body` 在給定 `label`/`goto`/`if-goto` 的機器上，標準寫法：

```
L_start:  <計算 cond 到 t>
          if cond == false goto L_end
          <body>
          goto L_start
L_end:
```

於是 `parse_while` 的每個 `emit` 都有明確的對應。條件「為假跳走」正是 VM 語言
`if-goto` 的語意（本書第 8 章用 `false` 時跳走的慣例）。

### if/else 的翻譯樣板

```
          <計算 cond 到 t>
          if cond == false goto L_else
          <true body>
          goto L_end
L_else:   <false body>
L_end:
```

注意 `if` 比 `while` 多一個「跳過 else」的 `goto L_end`，否則 true body 做完會直接
「掉進」else 區塊。

### 為什麼運算式要引入暫存變數？

`sum + i` 這種中間值不能憑空存在四元組裡，每一輪運算的結果都要有個「名字」，於是
產生 `t0`。因為機器一輪只算一個運算，這種「一個四元組一件運算」的形式就叫**三址碼**
（three-address code, 3AC），是編譯器中間碼的經典形式，之後可輕鬆轉成 stack machine
（Nand2Tetris 的 VM）或暫存器機器。

## 實作細節

### 詞法分析：結合命名群組的正規表示式

```python
token_specification = [
    ('KEYWORD', r'\b(let|while|if|else|print)\b'),
    ('NUMBER',  r'\b\d+\b'),
    ('ID',      r'\b[a-zA-Z_][a-zA-Z0-9_]*\b'),
    ('OP',      r'(<=|==|\+|=)'),
    ('SKIP',    r'[ \t\n]+'),
    ('MISC',    r'[;(){}]'),
]
tok_regex = '|'.join('(?P<%s>%s)' % pair for pair in token_specification)
```

- 用 Python 的命名群組 `(?P<名字>...)` 把每一種 token 綁上種類名，配合 `mo.lastgroup`
  就能在匹配時立刻拿到類型與文字。
- **順序很重要**：`KEYWORD` 排在 `ID` 前面，否則 `while` 會被 `ID` 規則先吃掉；
  `<=` 排在 `+` 前面，否則 `<=` 會被拆成 `<` 和 `=`。正規表示式引擎依序嘗試第一組
  匹配成功的規則。
- `\b` 是「字邊界」，確保 `let` 不會把 `letter` 的開頭誤判為關鍵字。
- `SKIP` 吞掉空白但不進 token 表，是常見的處理手法。

### `peek` / `consume`

```python
def peek(self):        # 只偷看，不動遊標
    ...
def consume(self, expected_value=None):
    token = self.peek()
    if not token: raise SyntaxError("Unexpected end of input")
    if expected_value and token[1] != expected_value:
        raise SyntaxError(f"Expected '{expected_value}', found '{token[1]}'")
    self.pos += 1
    return token
```

`consume('{')` 這種帶引數的呼叫，等於「吃掉一個固定字面符號，錯了就報錯」，是最小但
完整的「expected/found」診斷機制。其中 `token[1]` 是該 token 的文字內容，`token[0]`
是種類。

### 剖析各語句

`parse_statement()` 依 `peek` 到的第一個 token 分派到對應的剖析函式：

| 看到 | 呼叫 | 產生的四元組 |
|------|------|--------------|
| `let` | `parse_declaration` | `(=, expr, -, id)` |
| `while` | `parse_while` | `label`/`if_false`/`goto`/`label` |
| `if` | `parse_if` | `if_false`/`goto`/`label`… |
| `print` | `parse_print` | `(print, expr, -, -)` |
| `{` | `parse_block` | 內層語句的四元組 |
| 其他 | `consume()` | （容忍忽略，簡化設計）|

### 運算式：左結合的單一優先級

```python
left = self.parse_term()
while self.peek() and self.peek()[0] == 'OP' and self.peek()[1] != '=':
    op = self.consume()[1]
    right = self.parse_term()
    temp = self.new_temp()
    self.emit(op, left, right, temp)   # 例如 (+, sum, i, t0)
    left = temp
```

與 expParser 相同的技巧：先吃一個 term 當左運算元，之後每看到一個運算子就吃右側一個
term，產出一個暫存四元組，再把 `left` 換成暫存變數──左結合、不分優先權。唯一特例是
`=` 會被排除在迴圈外，因為 `let x = …` 的 `=` 屬於宣告字元，不當成二元運算子。

### 主程式

編譯器直接解析**內嵌的** `source_code` 字串，再把 `ir_code` 用表格印出：

```
OP         ARG1       ARG2       RESULT
----------------------------------------
=          1          -          i
=          0          -          sum
label      L0         -          -
<=         i          5          t0
if_false   t0         -          L1
...
```

`ARG1/ARG2/RESULT` 左對齊 10 個字元，純為展示排版。

## 測試與驗證

直接執行：

```bash
python compiler.py
```

程式會編譯內建的範例並印出四元組表。驗證方法：**手動追蹤** `while` 與 `if` 的
`label`/`goto` 跳轉是否成對（每個 `while` 產生一組 `L數`，`if/else` 產生兩組），並
確認每個 `<=`/`==`/`+` 運算都只吃變數或數字、結果寫進新的 `t`。若手邊有第 8 章的 VM
概念，也可以把 `if_false t → L` 想像成 VM 的 `if-goto` 指令，把 `label L` 想像成
`label L`，體會兩者一一對應。

## 延伸討論

- **與第 8 章 VM 的對接**：`if_false`/`label`/`goto` 四元組，只要再往下翻譯，就是
  Hack 組合語言的 `@label;D;JGT / D;JMP` 這類跳轉指令。本書第 8 章 VM 實作裡的
  `label`、`goto`、`if-goto` 指令正是這三個概念的正式化。
- **四元組 × 三址碼**：`(op, a, b, result)` 的四欄形式叫作四元組，邏輯上等價於「一
  個運算、三個運算元」的三址碼。Nand2Tetris 的 VM 是**堆疊機器**（stack machine），
  需要再經歷一次「把 operand 推上堆疊」的轉換，但結構骨架與這裡完全一致。
- **可改進方向**：目前 `if` 的條件只在 `while` 迴圈內有 `else` 以外的地方單獨處理、
  運算式沒有優先權、token 錯誤多半只是「忽略」，這些都是刻意簡化，正式版本的 Jack
  編譯器（第 10 章）會一一補上。