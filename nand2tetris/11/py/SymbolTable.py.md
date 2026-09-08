# SymbolTable.py 程式說明

Jack 編譯器的符號表，以字典資料結構管理 class 與 subroutine 雙層作用域的變數資訊。

## 概述

SymbolTable.py 維護編譯期間所有變數的資訊：名稱、型別、種類（static/field/argument/var）、以及索引。當 Parser 在考出程式碼時，需要查詢變數的種類與索引來決定 `push`/`pop` 哪個記憶體段與位置。

## 架構總覽

### 介面（公開方法）

| 方法 | 簽名 | 回傳值 | 說明 |
|------|------|--------|------|
| `__init__` | `SymbolTable()` | — | 建立兩個符號字典與索引計數器 |
| `__str__` | `str(table)` | `str` | 格式化輸出符號表內容（除錯用） |
| `start_subroutine` | `self.start_subroutine()` | — | 清空子程式作用域並重置 arg/var 索引 |
| `define` | `self.define(name, type, kind)` | — | 定義新符號並分配索引 |
| `var_count` | `self.var_count(kind)` | `int` | 計算指定種類的變數數量 |
| `type_of` | `self.type_of(name)` | `str` | 查詢變數型別 |
| `kind_of` | `self.kind_of(name)` | `int` | 查詢變數種類 |
| `index_of` | `self.index_of(name)` | `int` | 查詢變數索引（段中的位置） |
| `lookup` | `self.lookup(name)` | `(type, kind, index)` | 查詢變數完整資訊，找不到回傳 `(None, None, None)` |

### 內部資料結構

```python
self.class_symbols = {}          # 類別作用域：static, field 符號
self.subroutine_symbols = {}     # 子程式作用域：argument, local 符號
self.symbols = {                 # 種類 → 所屬字典 的映射
    SK_STATIC: class_symbols,
    SK_FIELD:  class_symbols,
    SK_ARG:    subroutine_symbols,
    SK_VAR:    subroutine_symbols,
}
self.index = {SK_STATIC:0, SK_FIELD:0, SK_ARG:0, SK_VAR:0}  # 各類索引計數器
```

每個符號條目的格式為 `name → (type, kind, index)` 三元組。

### 呼叫關係

```
Parser.py → SymbolTable.py → JackConstant.py
```

## 原理

### 雙層作用域模型

Jack 語言有兩層變數作用域：

1. **類別作用域**（class symbols）：`static` 與 `field` 變數，生命週期涵蓋整個類別
2. **子程式作用域**（subroutine symbols）：`argument` 與 `var`（local）變數，每進入一個新子程式就重置

`lookup()` 先搜尋子程式作用域，再搜尋類別作用域，實作作用域的「由內而外」遮蔽規則——子程式內的變數可以遮蔽同名類別變數。

### 四種變數種類與 VM 段對應

| SymbolKind | 意義 | VM 段 | 索引分配 |
|-----------|------|-------|---------|
| `SK_STATIC` (0) | 類別靜態變數 | `static` | 從 0 遞增 |
| `SK_FIELD` (1) | 物件欄位 | `this` | 從 0 遞增 |
| `SK_ARG` (2) | 子程式參數 | `argument` | 從 0 遞增 |
| `SK_VAR` (3) | 區域變數 | `local` | 從 0 遞增 |

種類與 VM 段的對照由 JackConstant.py 的 `segments` 字典定義。

## 實作細節

### define 的索引分配

```python
def define(self, name, type, kind):
    self.symbols[kind][name] = (type, kind, self.index[kind])
    self.index[kind] += 1
```

每個種類維護獨立的索引計數器，所以 `argument` 和 `var` 都從 0 開始編號。這正對應 VM 段中 `argument i`、`local i` 的索引意義。

### method 的隱含 this 參數

Parser 在編譯 method 時會在宣告前先定義：

```python
self.symbols.define('this', self._cur_class, SK_ARG)
```

因此 `this` 成為該 function 的 `argument 0`，這解釋了為何 method 的 `push argument 0; pop pointer 0` 可以設定 this 指標。

### var_count 的用途

`var_count(SK_VAR)` 在函式宣告產生 `function Name nLocals` 指令時使用，決定 VM 要為該 function 配置多少個本地暫存槽。

## 測試與驗證

可以單獨操作符號表驗證其行為：

```python
from SymbolTable import SymbolTable
st = SymbolTable()
st.define('x', 'int', SK_STATIC)
st.define('y', 'int', SK_VAR)
st.start_subroutine()
st.define('z', 'int', SK_VAR)
print(st)   # 觀察各層符號與索引
```

## 延伸討論

Python 版使用字典（dict）而非陣列，使得符號的定義、查詢都是 O(1) 操作，且不需預先宣告容量。C 版則使用固定大小陣列（`MAX_SYMBOLS=256`）儲存符號再線性搜尋。字典方案的缺點是迭代順序依插入順序，適合本編譯器「只記錄不排序」的需求。