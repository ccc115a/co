# JackConstant.py 程式說明

定義 Jack 編譯器所需的所有常數：token 類型、關鍵字、符號、符號種類，以及 VM 指令的對照表。

## 概述

這是 Python 版 Jack 編譯器的基礎模組，被 Lex.py、SymbolTable.py、Parser.py、VMWriter.py 等所有上層模組引用（`from JackConstant import *`）。它不包含任何邏輯，純粹提供常數定義，相當於 C 版中的列舉（`enum`）與巨集定義。

## 架構總覽

### Token 類型（第 6–11 行）

詞法分析器用來分類每個詞元的類別：

| 常數 | 值 | 說明 |
|------|---|------|
| `T_KEYWORD` | 0 | 關鍵字，如 `class`, `while` |
| `T_SYM` | 1 | 符號，如 `{`, `+` |
| `T_NUM` | 2 | 數字常數，範圍 0–32767 |
| `T_STR` | 3 | 字串常數 |
| `T_ID` | 4 | 識別碼 |
| `T_ERROR` | 5 | 錯誤 |

### 關鍵字（第 14–39 行）

Jack 語言的 21 個保留字，每個都定義為字串常數。`keywords` 列表收錄所有關鍵字，供 Lex.py 做匹配判定。

### 符號字元（第 42 行）

```
symbols = '{}()[].,;+-*/&|<>=~'
```

共 19 個單字元符號， Lex.py 用來判定 token 是否為 `T_SYM`。

### 符號種類 SymbolKind（第 45–49 行）

| 常數 | 值 | VM 段名 | 說明 |
|------|---|---------|------|
| `SK_STATIC` | 0 | `static` | 類別級靜態變數 |
| `SK_FIELD` | 1 | `this` | 類別級欄位變數（物件成員） |
| `SK_ARG` | 2 | `argument` | 子程式引數 |
| `SK_VAR` | 3 | `local` | 子程式區域變數 |

`kwd_to_kind` 字典（第 52 行）將關鍵字 `static`/`field` 映射為對應的 `SymbolKind`，供 Parser 在解析 `classVarDec` 時使用。

### VM 指令對照表（第 55–58 行）

`vm_cmds` 字典將 Jack 運算子映射為 VM 算術指令：

| Jack 運算子 | VM 指令 |
|------------|---------|
| `+` | `add` |
| `-` | `sub` |
| `*` | `call Math.multiply 2` |
| `/` | `call Math.divide 2` |
| `<` | `lt` |
| `>` | `gt` |
| `=` | `eq` |
| `&` | `and` |
| `\|` | `or` |

`vm_unary_cmds` 處理一元運算子：`-` → `neg`、`~` → `not`。

`segments` 字典將 `SymbolKind` 映射為 VM 段名（`static`、`this`、`argument`、`local`）。

### 暫存器常數（第 61–62 行）

```
TEMP_RETURN = 0   // 用於丟棄函式回傳值（do 陳述句）
TEMP_ARRAY  = 1   // 用於陣列賦值時暫存數值
```

Hack VM 的 `temp` 段有 8 個暫存器（temp 0–7），本編譯器使用其中兩個。

## 原理

這些常數的設計直接對應 Jack 語言規格與 Hack VM 規範。token 類型與關鍵字清單源自教材第 11 章的詞法規則；`SymbolKind` 對應 VM 的四個記憶體段（`static`、`this`、`argument`、`local`）；`vm_cmds` 則是 Hack VM 算術指令的完整映射。

## 實作細節

`T_EOF` 未在此模組中定義（C 版有定義），Python 版的 Lex.py 在 token 列表用盡時回傳 `(T_ERROR, 0)` 作為結束訊號，而非專門的 EOF 標記。這是 Python 版與 C 版的一個微妙差異。

## 延伸討論

此模組的「純常數」設計使編譯器的詞彙表（token 類型、關鍵字）與 VM 碼生成策略（運算子映射）集中管理。若要擴充 Jack 語言（例如新增運算子或關鍵字），只需修改此檔案即可。
