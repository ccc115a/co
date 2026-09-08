# jack2vm_v1.c 程式說明

C 語言實作的 Jack 編譯器第一版，將 `.jack` 檔案直接編譯為 `.vm` 檔案。本版採用「結構體內含函數指標」的設計，將所有編譯模組（Lexer、SymbolTable、VMWriter、Parser）合併在單一檔案中。

## 概述

這是 Nand2Tetris 第 11 章「Jack 編譯器」的 C 語言實作版本之一。它將 Python 版的模組化編譯器（JackConstant.py、Lex.py、SymbolTable.py、VMWriter.py、Parser.py、Compiler.py）翻譯為一個 959 行的單一 C 檔案。輸入為 `.jack` 檔案或包含 `.jack` 的目錄，輸出為 `output/` 目錄下的 `.vm` 檔案。

本版本的特色是 **Parser 結構體中使用函數指標**（第 113–128 行），將所有 `compile_xxx` 函式掛載到結構體上，透過 `parser->compile_xxx(parser)` 的方式呼叫。這是 v1 相較於 v2 與最終版最明顯的差異。

## 架構總覽

### 模組劃分

| 區段 | 行數範圍 | 功能 | 對應 Python 模組 |
|------|---------|------|-----------------|
| 常數定義 | 15–58 | Token 類型、關鍵字、符號種類、VM 段名對照 | JackConstant.py |
| 結構體定義 | 62–128 | Token、Lex、Symbol、SymbolTable、VMWriter、Parser | 各模組的類別 |
| Lexer（詞法分析） | 187–324 | 移除註解、切割 token、advance/peek | Lex.py |
| Symbol Table（符號表） | 329–395 | 雙層作用域（class / subroutine）的符號管理 | SymbolTable.py |
| VM Writer（VM 寫入器） | 400–464 | 產生 push/pop/call/label 等 VM 指令 | VMWriter.py |
| Parser（語法分析） | 470–909 | 遞迴下降編譯器，含所有 compile_xxx 函式 | Parser.py |
| 主程式 | 915–959 | 檔案/目錄遍歷，啟動編譯 | Compiler.py |

### 呼叫流程

```
main()
  └→ analyze_file(filepath)
       └→ parser_init()        // 建立 Lexer, SymbolTable, VMWriter
            ├→ lex_init()      // 讀檔、移除註解、token 化
            ├→ symbol_table_init()
            ├→ vm_writer_init() // 開啟 .vm 輸出檔
            └→ parser->compile_class(parser)  // 函數指標呼叫
                 └→ compile_subroutine() / compile_class_var_dec()
                      └→ 各 compile_xxx() → vm_writer_write_xxx()
  └→ parser_destroy()
```

## 原理

### 詞法分析（Lexer）

Jack 的詞法分析將原始碼字串分解為五種 token：

| Token 類型 | 識別規則 | 範例 |
|-----------|---------|------|
| `T_KEYWORD` | 字元序列匹配 21 個保留字 | `class`, `while`, `true` |
| `T_SYM` | 出現在 `{}()[].,;+-*/&|<>=~` 中的單一字元 | `{`, `+`, `=` |
| `T_NUM` | 一或多個數字 | `123`, `0` |
| `T_STR` | 雙引號包夾的字元序列 | `"hello"` |
| `T_ID` | 以字母或底線開頭，後接字母、數字、底線 | `x`, `myVar`, `_count` |

關鍵字與識別碼的區別方式：先判定為 `T_ID`，再逐一比對 `keyword_map[]`，若匹配則改為 `T_KEYWORD`。

### 遞迴下降語法分析

Parser 直接對應 Jack 語法的 BNF 規則，每個非終端符對應一個 `compile_xxx` 函式：

```
class          → compile_class
classVarDec    → compile_class_var_dec
subroutine     → compile_subroutine
parameterList  → compile_parameter_list
varDec         → compile_var_dec
statements     → compile_statements
let / if / while / do / return → compile_let / compile_if / ...
expression     → compile_expression
term           → compile_term
expressionList → compile_expression_list
```

### 符號表（Symbol Table）

採用雙層作用域：

- **class_symbols**：儲存 `static` 和 `field` 變數，生命週期為整個類別
- **subroutine_symbols**：儲存 `argument` 和 `var` 變數，每進入新子程式時清空

lookup 時先搜尋 subroutine scope，再搜尋 class scope（由內而外）。

### VM 指令產生

每個 Jack 語法結構對應的 VM 指令模式：

| Jack 結構 | 產生的 VM 指令 |
|-----------|--------------|
| 整數常數 `123` | `push constant 123` |
| 字串常數 `"hi"` | `push constant 2` + `call String.new 1` + 逐字 `push constant` + `call String.appendChar 2` |
| `true` | `push constant 0` + `not` |
| `false` / `null` | `push constant 0` |
| `this` | `push pointer 0` |
| 二元運算 `+` | `add`；`*` → `call Math.multiply 2` |
| 一元運算 `-` | `neg`；`~` → `not` |
| 陣列存取 `a[i]` | `push a` + `push i` + `add` + `pop pointer 1` + `push that 0` |
| `let a[i] = expr` | 先算 `base+index`、再算 `expr`、`pop temp 1`、`pop pointer 1`、`push temp 1`、`pop that 0` |
| `while(exp) { s }` | `label WHILE_EXP` + 條件 `not` + `if-goto WHILE_END` + statements + `goto WHILE_EXP` + `label WHILE_END` |
| `if(exp) { s1 } else { s2 }` | 條件 `not` + `if-goto IF_FALSE` + s1 + `goto IF_END` + `label IF_FALSE` + s2 + `label IF_END` |
| `do foo()` | `call foo 1`（含 this） + `pop temp 0`（丟棄回傳值） |
| `return expr` | push expr + `return` |
| constructor | `push constant nFields` + `call Memory.alloc 1` + `pop pointer 0` |
| method | `push argument 0` + `pop pointer 0` |

## 實作細節

### 函數指標的使用（v1 獨有）

v1 版在 `Parser` 結構體中宣告了 14 個函數指標（第 114–128 行）：

```c
void (*compile_class)(Parser*);
void (*compile_term)(Parser*);
int  (*compile_expression_list)(Parser*);
// ... 等
```

在 `parser_init()` 中將具體函式賦值給這些指標，然後透過 `parser->compile_class(parser)` 呼叫。這種設計模擬了物件導向的虛擬分派，但在 C 語言中增加了間接呼叫的開銷與複雜度。v2 和最終版改為直接呼叫函式，更為簡潔。

### do 陳述句的處理

`compile_do()` 呼叫 `compile_term()` 來解析子程式呼叫（因為 `subroutineCall` 的語法與 `term` 的一部分相同），然後將回傳值 `pop temp 0` 丟棄。這是因為 `do` 呼叫的函式回傳值不被使用。

### 標籤產生

使用 `label_counter` 全域計數器，每次需要新標籤時遞增。例如 `WHILE_EXP0`、`WHILE_END0`、`IF_FALSE1`、`IF_END1` 等，確保同一編譯單元內標籤不重複。

## 測試與驗證

編譯方式：

```bash
gcc -o jack2vm_v1 jack2vm_v1.c
./jack2vm_v1 <file.jack>      # 編譯單一檔案
./jack2vm_v1 <directory>      # 編譯目錄下所有 .jack
```

輸出的 `.vm` 檔案可在 nand2tetris 的 VM Emulator 中執行驗證。也可與 Python 版編譯器的輸出做比對（應產生等價的 VM 程式碼）。

## 延伸討論

- **函數指標 vs 直接呼叫**：v1 的函數指標設計提供了類似多型的彈性，但對編譯器這種固定流程的程式而言，直接呼叫更高效且易讀。v2 以後的版本採用了更簡潔的做法。
- **記憶體管理**：所有結構體以固定陣列（`MAX_TOKENS=32768`、`MAX_SYMBOLS=256`）分配，避免動態記憶體管理的複雜度，但也限制了可編譯的程式規模。
- **錯誤處理**：採用 `ERROR` 巨集直接呼叫 `exit(1)`，遇到第一個錯誤即停止，不嘗試恢復或累積多個錯誤訊息。
