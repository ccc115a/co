# Lex.py 程式說明

Jack 編譯器的詞法分析器（Lexer），使用正則表達式將 `.jack` 原始碼分解為 token 序列。

## 概述

Lex.py 實現了 Nand2Tetris 第 11 章定義的詞法分析功能。它讀取一個 `.jack` 檔案，移除註解後，利用正則表達式將原始碼切割為 token，並提供 `advance()` 和 `peek()` 兩個介面供 Parser.py 使用。

## 架構總覽

### 介面（公開方法）

| 方法 | 簽名 | 回傳值 | 說明 |
|------|------|--------|------|
| `__init__` | `Lex(file)` | — | 讀檔、移除註解、token 化，token 列表反轉以便 `pop()` 模擬前進 |
| `has_more_tokens` | `self.has_more_tokens()` | `bool` | 是否還有未處理的 token |
| `advance` | `self.advance()` | `(token_type, value)` | 回傳下一個 token 並推進 |
| `peek` | `self.peek()` | `(token_type, value)` | 查看下一個 token 但不推進 |
| `token_type` | `self.token_type()` | `int` | 當前 token 的類型 |
| `keyword` | `self.keyword()` | `str` | 當前關鍵字的字串 |
| `symbol` | `self.symbol()` | `str` | 當前符號 |
| `identifier` | `self.identifier()` | `str` | 當前識別碼 |
| `int_val` | `self.int_val()` | `int` | 當前整數值 |
| `string_val` | `self.string_val()` | `str` | 當前字串值 |

### 內部資料結構

- `_lines`：原始碼字串（已移除註解）
- `_tokens`：`[(token_type, value), ...]` 的列表，**反轉存放**以使用 `pop()` 作為前進操作
- `_token_type`、`_cur_val`：當前 token 的類型與值

### 呼叫關係

```
Compiler.py → Parser.py → Lex.py
                                └→ JackConstant.py
```

## 原理

### 正則表達式分割

Lex.py 定義了一組正則表達式來識別各類 token：

| 正則變數 | 模式 | 識別目標 |
|---------|------|---------|
| `_keyword_re` | `class\|method\|...\|this` (各後接 `\s`) | 關鍵字：必須後接空白，避免把 `classes` 識別為 `class` |
| `_sym_re` | `[{}()[].,;+\-*/&\|<>=~]` | 單字元符號 |
| `_num_re` | `\d+` | 數字常數 |
| `_str_re` | `"[^"\n]*"` | 字串常數（不含換行） |
| `_id_re` | `[a-zA-Z_]\w*` | 識別碼 |

`_word` 正則表達式將以上五種模式用 `|` 串接，優先順序為：關鍵字 > 識別碼 > 符號 > 數字 > 字串。

### 註解移除

使用 `re.sub` 一次移除所有單行（`// ...`）和多行（`/* ... */`）註解：

```python
_comment_re = re.compile(r'//[^\n]*\n|/\*(.*?)\*/', re.MULTILINE|re.DOTALL)
```

### token 列表反轉的設計

初始化時將 token 列表反轉（`self._tokens.reverse()`），這樣 `pop()` 就會從第一個 token 開始取出（Python 的 `pop()` 從尾端取元素）。`peek()` 則用 `self._tokens[-1]` 查看尾端元素。

## 實作細節

### Token 分類邏輯

`_token()` 方法按以下優先順序判定 token 類型：

1. 若在 `keywords` 列表中 → `T_KEYWORD`
2. 若匹配 `_sym_re` → `T_SYM`
3. 若匹配 `_num_re` → `T_NUM`
4. 若匹配 `_str_re` → `T_STR`（**去掉兩端的引號**）
5. 若匹配 `_id_re` → `T_ID`
6. 否則 → `T_ERROR`

### 字串 token 的處理

字串在 token 化時去掉前後雙引號，儲存純內容。例如 `"hello"` 儲存為 `hello`。

## 測試與驗證

Lex.py 可以獨立測試：

```python
from Lex import Lex
lex = Lex('test.jack')
while lex.has_more_tokens():
    tok, val = lex.advance()
    print(f"Token type={tok}, value={val}")
```

## 延伸討論

Python 版使用正則表達式進行詞法分析，相較 C 版的手動字元掃描，程式碼更為簡潔。但正則表達式方案需要一次性載入整個檔案到記憶體，不適合處理極大型原始碼。C 版的逐字元掃描則可以做串流處理。
