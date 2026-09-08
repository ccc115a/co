# Parser.py 程式說明

Jack 編譯器的核心模組：採用遞迴下降法進行語法分析，並在分析的同時透過 VMWriter 產生 VM 程式碼。

## 概述

Parser.py 是 Python 版 Jack 編譯器的主引擎。它讀取 `.jack` 原始碼（透過 Lex）、維護符號表（透過 SymbolTable），並在解析每個語法構造的同時輸出對應的 VM 指令（透過 VMWriter）。整個類別只有一個公開建構子 `Parser(file)`，建構時便完成整個類別的編譯。

## 架構總覽

### 呼叫關係

```
Compiler.py → Parser(file)
                  ├→ Lex(file)            # 詞法分析
                  ├→ SymbolTable()        # 符號表
                  ├→ VMWriter()           # VM 輸出
                  └→ openout(path)        # 建立 output/ 目錄與 .vm 檔
                       → compile_class()  # 開始遞迴下降編譯
                  → closeout()
```

### 公開介面

| 方法 | 簽名 | 說明 |
|------|------|------|
| `__init__` | `Parser(file)` | 建立子模組並編譯整個類別 |
| `compile_class` | `self.compile_class()` | 編譯 `class: 'class' className '{' classVarDec* subroutineDec* '}'` |
| `compile_class_var_dec` | `self.compile_class_var_dec()` | 編譯 `static/field` 變數宣告 |
| `compile_subroutine` | `self.compile_subroutine()` | 編譯 method/function/constructor |
| `compile_parameter_list` | `self.compile_parameter_list()` | 編譯參數列表 |
| `compile_var_dec` | `self.compile_var_dec()` | 編譯 `var` 宣告 |
| `compile_statements` | `self.compile_statements()` | 編譯陳述句序列 |
| `compile_let` / `compile_if` / `compile_while` / `compile_do` / `compile_return` | | 編譯各類陳述句 |
| `compile_expression` | `self.compile_expression()` | 編譯運算式 |
| `compile_term` | `self.compile_term()` | 編譯項 |
| `compile_expr_list` | `self.compile_expr_list()` | 編譯參數表達式列表，回傳個數 |

### 內部輔助方法

`_require`、`_advance`、`_is_token`、`_is_keyword`、`_is_sym` 等用於 token 的確認與預測；`compile_type`、`compile_var_name`、`compile_void_or_type` 等用於基本文法元素；`new_label` 產生唯一標籤。

## 原理

### 文法對應表

每個語法規則對應一個 `compile_xxx` 方法：

| 文法規則 | 方法 |
|---------|------|
| `class` | `compile_class()` |
| `classVarDec` | `compile_class_var_dec()` → `_compile_dec()` |
| `subroutineDec` | `compile_subroutine()` |
| `parameterList` | `compile_parameter_list()` → `compile_parameter()` |
| `subroutineBody` | `compile_subroutine_body()` |
| `statements` | `compile_statements()` → `_compile_statement()` |
| `let/if/while/do/return` | 各相對應方法 |
| `expression` | `compile_expression()` |
| `term` | `compile_term()` |
| `expressionList` | `compile_expr_list()` |
| `subroutineCall` | `compile_subroutine_call()` |

### 控制流程的標籤策略

if 與 while 共用輔助方法 `_compile_cond_expression_statements(label)`，其產生模式如下：

**while 迴圈**（呼叫時 `label = top_label`）：

```
label top_label          # 迴圈條件檢查點
<條件運算式>
not                      # 條件為假
if-goto notif_label
<迴圈本體>
goto top_label           # 迴圈結束跳回
label notif_label        # 迴圈出口
```

**if 陳述句**（呼叫時 `label = end_label`）：

```
<條件運算式>
not
if-goto notif_label      # 條件為假跳過 if 區塊
<if 區塊>
goto end_label           # 跳過 else 區塊
label notif_label
<else 區塊，若有>
label end_label
```

### 物件方法的三種呼叫形式

`compile_subroutine_call(name)` 處理三種子程式呼叫：

| Jack 形式 | 產生的 VM |
|----------|----------|
| `foo(a)`（本物件方法） | `push pointer 0` + `call MyClass.foo 1` |
| `obj.bar(a)`（物件方法） | `push obj` + `call ObjType.bar 2` |
| `Class.baz(a)`（靜態函式） | `call Class.baz 1` |

若 `name` 在符號表中（是變數），則是物件方法呼叫，需 push 該物件作為隱含的第一個引數；若不是變數，則視為類別名稱，直接產生靜態呼叫。

### constructor 與 method 的 this 初始化

| 種類 | VM 產生 |
|------|--------|
| `method` | `push argument 0` + `pop pointer 0` |
| `constructor` | `push constant (field 數)` + `call Memory.alloc 1` + `pop pointer 0` |
| `function` | （無需 this 初始化） |

## 實作細節

### 字串常數生成

```python
def write_string_const_init(self, val):
    self.vm.push_const(len(val))
    self.vm.write_call('String.new', 1)
    for c in val:
        self.vm.push_const(ord(c))
        self.vm.write_call('String.appendChar', 2)
```

每次 `appendChar` 呼叫需傳入兩個引數：字串物件本身（`this`）與字元，故 `call ... 2`。

### true 的表示

Jack 的 `true` 以 -1（所有位元為 1）表示：

```python
elif kwd == KW_TRUE:
    self.vm.push_const(1)
    self.vm.write_vm_cmd('neg')
```

`push constant 1` + `neg` 產生 -1，等同於 C 版的 `push constant 0` + `not`（0 的反轉也是 -1），兩種寫法結果相同。

### 陣列元素賦值

```python
def pop_array_element(self):
    self.vm.pop_temp(TEMP_ARRAY)    # （A）將值暫存到 temp 1
    self.vm.pop_that_ptr()          # （B）將 base+index 存入 THAT 指標
    self.vm.push_temp(TEMP_ARRAY)   # （C）把值放回堆疊
    self.vm.pop_that()              # （D）*(base+index) = 值
```

步驟（A）先把要寫入的值移出堆疊，讓（B）能取走堆疊頂端的位址，再用（C）（D）完成寫入。

### 標籤編號

`label_num` 是類別屬性（不是實例屬性），所有 Parser 實例共用計數，確保跨檔案的標籤也唯一。標籤格式為 `label1`、`label2`……

## 測試與驗證

```bash
./Compiler.py test.jack        # 或
./Compiler.py 目錄名稱
```

對比輸出：

- 若要獨立除錯語法分析，可在 `__init__` 中呼叫 `self.symbols` 的 `__str__` 輸出符號表內容。
- 產生的 `.vm` 檔案可在 VM Emulator 執行，或與 nand2tetris 官方編譯器的輸出比對。

## 延伸討論

- **單 Pass 編譯**：不建立 AST，分析同時產生 VM。程式緊湊、速度快，但無法進行型別檢查或最佳化。
- **運算子優先序**：`compile_expression` 由左至右處理運算子，不處理優先序（教材亦如此要求），註解標明「Doesn't handle normal order of operations」。真實編譯器需先區分優先層級。
- **錯誤訊息**：`_require_failed_msg` 依賴 `tokens[tok]` 對照表（本版本檔中未定義完整，屬已知限制），遇上未知 token 時錯誤訊息可能不精確。