# compiler.py 程式說明：含函式的微型編譯器（p0 語言）

這個程式把一套含 `let`/`while`/`if`/`print`，再加上**函式定義 `fn`、函式呼叫、
`return`** 的迷你語言，編譯成四元組中間碼（IR）。它是 `09/04-p0ifwhile/compiler.py`
的擴充版：04 處理控制流，這一版再加上了「子常式（subroutine）與呼叫」──對應
Nand2Tetris 第 8 章 VM 高階功能 `function`/`call`/`return` 的前置訓練。且本版改成
從命令列讀入原始碼檔案、把 IR 輸出到 stdout，可與同目錄的 `vm.py`（VM 直譯器）配對，
真正把編譯出來的程式跑起來。

## 概述

關鍵差別在於引入**函式**，因此需要回答三個新問題：

1. 函式定義放哪裡？（→ `func_entry` 標籤，且主程式要被跳過。）
2. 參數怎麼傳？（→ `param` 指令把引數依序放進緩衝區，函式內用 `recv` 依序接住。）
3. 回傳值怎麼帶回來？（→ `call` 指派一個暫存變數接收，`return` 把值送回。）

整個流程：`compiler.py 來源.p0 > out.ir` 產出中間碼，再交給 `vm.py out.ir` 執行。

## 架構總覽

`Compiler` 類別與 04 版幾乎相同，新增的重點都在「函式」相關的四元組：

| op | 意義 | 產於 |
|----|------|------|
| `func_entry <名>` | 宣告一個函式的入口（像 label）| `parse_function_def` |
| `recv <參數>` | 從參數緩衝區取一個值、存入此參數 | `parse_function_def` |
| `param <引數>` | 把一個引數值塞進緩衝區（依序）| `parse_function_call` |
| `call <名> <個數> <t>` | 呼叫函式，回傳值存 `t` | `parse_function_call` |
| `return <expr>` | 離開函式並傳回值 | `parse_return` |

延續 04 版的四個支柱：`peek/consume/new_temp/new_label/emit`。EMIT 的四元組格式
`(op, arg1, arg2, result)` 完全沒變，`arg2/res` 用 `'-'` 填空。

### 詞法分析的差異

| token 種類 | 04 版 | 05 版 |
|-----------|-------|-------|
| 關鍵字 | `let while if else print` | 多了 `fn return` |
| 運算子 | `<= == + =` | 多了 `- * /` |
| 其他符號 | `; ( ) { }` | 多了 `,`（參數列分隔）|

其餘規則順序與技巧（名稱群組、`\b` 邊界、`SKIP` 吞空白）與 04 版一致。

## 原理

### 函式定義的處理：先跳過，再執行

主程式的入口若藏在函式定義之後，機器若從第一行開始執行就會直接跑進 `fn` 區塊。所以
`parse_program` 的開頭先發一條：

```
goto L0        ← 無條件跳過等一下會出現的函式定義區
```

接著逐個剖析：若是 `fn` 就 `parse_function_def`，否則（已到了主程式語句）先補上
`label L0` 標記主程式起點，再剖析該語句。`start_label` 設成 `None` 確保 `label L0`
只會被 emit 一次。

函式定義本身長這樣：

```
func_entry <名>
recv <參數1>
recv <參數2>
...
<body… 各語句的四元組>
return        ← 隱含的結尾 return（就算沒寫 return）
```

「函式結束時會 emit 一條空參數的 `return`」很重要：保證任何路徑最後都會跳出函式，不
會一路掉進下一段程式碼。

### 呼叫端與被呼叫端的契約（傳參協定）

這是整個範例最精彩的地方，兩端透過一條「緩衝區」默契配合：

```
呼叫端（parse_function_call 產出）：         被呼叫端（parse_function_def 產出）：
param  10                                  recv  a     ← 從緩衝區拿出第 1 個
param  20                                  recv  b     ← 拿出第 2 個
call   add  2  t1
```

- `param` 的順序就是 `recv` 的順序（FIFO，先進先清出）。
- `call` 的 `arg2`（這裡是 2）記錄引數數量，是「備而不用」的資訊。
- `call` 的 `result` 欄位指派的暫存變數（`t1`）是**回傳值的接收變數**：函式 `return`
  完的值會被寫進它。

`parse_term` 裡只要有 `ID` 後面緊跟著 `(`，就判定為函式呼叫，交給
`parse_function_call`；否則就是普通變數。`parse_term` 因此成為「變數 或 常數 或
函式呼叫」的統一入口，這讓函式呼叫可以出現在任何運算元的位子上（例如 `add(sum, i)`
裡面的 `add(sum, i)` 本身就是一個 term）。

### 引數本身就是運算式

`parse_function_call` 對每個引數先 `parse_expression()`，所以引數可以是巢狀運算式，
例如 `add(sum + 1, i * 2)`。剖析後依序 emit 對應的 `param`，最後才是 `call`。

## 實作細節

### 主程式的跳轉與標記（`parse_program`）

```python
start_label = self.new_label()
self.emit('goto', start_label, '-', '-')   # L0：跳過所有 fn 定義
while self.pos < len(self.tokens):
    token = self.peek()
    if token[1] == 'fn':
        self.parse_function_def()
    else:
        if start_label:
            self.emit('label', start_label, '-', '-')
            start_label = None              # 只標一次
        self.parse_statement()
```

注意順序：`label L0` 會出現在**第一個主程式語句之前**。若原始碼先宣告函式再寫主程式，
產生的 IR 就會是「先 goto、再所有 func_entry、再 label、再主程式語句」，如前一小節預期。

### 函式定義（`parse_function_def`）

```python
self.emit('func_entry', func_name, '-', '-')
self.consume('(')
params = []
if self.peek()[1] != ')':                 # 至少一個參數
    while True:
        param_name = self.consume()[1]
        params.append(param_name)
        self.emit('recv', param_name, '-', '-')
        if self.peek()[1] == ',':
            self.consume(',')
        else:
            break
self.consume(')')
self.parse_block()                        # 剖析 { ... } 內的主體
self.emit('return', '-', '-', '-')        # 隱含結尾 return
```

`recv` 會在參數列剖析當下立刻 emit；`params` 列表目前僅內聚於函式內，正式的編譯器應把
參數放進符號表（symbol table）供型別檢查，此處刻意省略。

### 函式呼叫（`parse_function_call`）

```python
args = []
if self.peek()[1] != ')':
    while True:
        arg_val = self.parse_expression()   # 引數允許完整運算式
        args.append(arg_val)
        if self.peek()[1] == ',':
            self.consume(',')
        else:
            break
self.consume(')')
for arg in args:
    self.emit('param', arg, '-', '-')
result_temp = self.new_temp()               # 回傳值暫存變數
self.emit('call', func_name, str(len(args)), result_temp)
return result_temp                          # 這個 temp 可用在更外層的運算
```

`return result_temp` 是重點：呼叫的結果本身就是一個暫存變數，因此 `let sum = add(…)`
或 `print add(…)` 都可以直接使用，具有正確的「運算式嵌入」語意。四年後（第 10 章的
Jack 編譯器）`do/let =` 的函式呼叫處理沿用完全相同的結構。

### 移除 04 版「忽略式」的 statement 分支

05 版在 `parse_statement` 新增兩條路：`return` → `parse_return`；而碰到 `ID` 或
`NUMBER` 開頭時當成**表達式語句**（例如函式呼叫語句 `foo(1);`），剖析運算式後吃掉
`;`。這讓呼叫一個不接收回傳值的函式也能成為合法語句。

## 測試與驗證

與 `vm.py` 配對使用。先編譯再執行（或直接用 `test.sh`）：

```bash
python compiler.py p0/test1.p0 > p0/test1.ir
python vm.py p0/test1.ir
python compiler.py p0/test2.p0 > p0/test2.ir
python vm.py p0/test2.ir
```

以 `test1.p0` 為例：

```c
fn add(a, b) { return a + b; }
let sum = add(10, 20);
print sum;
```

編譯出的 IR：

```
goto         L0
func_entry   add
recv         a
recv         b
+            a          b          t0
return       t0
return       -          -          -       ← 隱含結尾 return
label        L0
param        10
param        20
call         add        2          t1
=            t1         -          sum
print        sum
```

`vm.py` 執行後應輸出 `>> OUTPUT: 30`。而 `test2.p0` 在 `while` 迴圈內以
`add(sum, i)`、`add(i, 1)` 重複呼叫函式，可檢驗「多次呼叫、環境不斷開闢與銷毀」的
正確性，輸出會是 `i=1..5` 的累加和 15。

## 延伸討論

- **對照第 8 章 VM 的 function/call/return**：本書正式 VM 語言用 `function f n`
  宣告（含 n 個區域變數）、`call f n` 呼叫、`return` 回傳，並透過「呼叫框架
  （call frame）」在堆疊上保存 return address 等四件套資料。本範例的
  `func_entry`/`call`/`return`（由 `vm.py` 用環境堆疊與 `ret_stack` 實作）就是
  同一協定的簡化版——看到兩者的對應，第 8 章的堆疊框架協定會容易很多。
- **與 04 版的關係**：04 版完成了流程控制（`label`/`goto`/`if_false`），本版在其上
  疊加函式機制，`while`/`if` 的剖析碼幾乎原封不動，只把 `parse_statement` 的
  `parse_block` 改回固定區塊。模板化的擴充（增加新語句→新增 token→新增剖析函式）正是
  真實編譯器持續演化的寫照。
- **缺漏與可改進點**：沒有符號表／型別檢查；函式定義只能在主程式語句之前；參數數量
  沒有在 `call` 時驗證。對應第 10 章：Jack 編譯器會建立以 class/subroutine 為 scope
  的符號表，並用語意錯誤報告補上這些檢查。