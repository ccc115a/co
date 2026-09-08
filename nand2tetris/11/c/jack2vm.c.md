# jack2vm.c 程式說明

C 語言實作的 Jack 編譯器最終版（單一檔案），具備完整的 BNF 語法註解與結構化文件說明，是三個 C 版本中最適合教學使用的版本。

## 概述

這個 898 行的 C 程式將 Nand2Tetris 第 11 章的 Python 版 Jack 編譯器（JackConstant.py、Lex.py、SymbolTable.py、VMWriter.py、Parser.py）完整翻譯為單一 C 檔案。它具備四個核心模組：

1. **詞法分析器（Lexer）**：將 `.jack` 原始碼分解為 token 序列
2. **符號表（Symbol Table）**：管理 class / subroutine 雙層作用域的變數資訊
3. **VM 寫入器（VM Writer）**：產生符合 Hack VM 規範的中間碼
4. **語法分析器（Parser）**：採用遞迴下降法，在分析的同時呼叫 VM Writer 產生程式碼

每個 `compile_xxx` 函式上方都附有對應的 BNF 語法規則註解，方便對照教材理解。

## 架構總覽

### 模組劃分

| 區段 | 行數 | 對應 Python 模組 | 職責 |
|------|------|-----------------|------|
| 1. 常數定義 | 31–69 | JackConstant.py | TokenType、Keyword、SymbolKind、VM 段名映射 |
| 2. 結構體定義 | 73–120 | 各模組類別 | Token、Lex、Symbol、SymbolTable、VMWriter、Parser |
| 3. 函數原型宣告 | 125–175 | — | 所有函式的前置宣告 |
| 4. 錯誤處理 | 180–183 | — | `report_error()` + `ERROR` 巨集 |
| 5. Lexer 實作 | 188–299 | Lex.py | `remove_comments`、`lex_tokenize`、`lex_init`、`lex_advance`、`lex_peek` |
| 6. Symbol Table 實作 | 305–366 | SymbolTable.py | `symbol_table_init`、`define`、`var_count`、`lookup` |
| 7. VM Writer 實作 | 372–404 | VMWriter.py | 各種 VM 指令輸出函式 |
| 8. Parser 實作 | 410–849 | Parser.py | 所有 `compile_xxx` 遞迴下降函式 |
| 9. 主程式 | 855–898 | Compiler.py | `analyze_file`、`analyze_directory`、`main` |

### 整體呼叫流程

```
main()
  ├→ S_ISDIR? → analyze_directory() → 逐一呼叫 analyze_file()
  └→ analyze_file(path)
       └→ parser_init(parser, path)
            ├→ lex_init(parser->lex, path)
            │    ├→ fopen() 讀入原始碼
            │    ├→ remove_comments() 移除 // 和 /* */ 註解
            │    └→ lex_tokenize() 分解為 token 陣列
            ├→ symbol_table_init(parser->symbols)
            ├→ vm_writer_init(parser->vm, path)   // 建立 output/ 目錄、開啓 .vm 檔
            └→ compile_class(parser)              // 遞迴下降編譯的入口
                 ├→ compile_class_var_dec()        // classVarDec*
                 └→ compile_subroutine()           // subroutineDec*
                      ├→ compile_parameter_list()
                      ├→ compile_var_dec()         // varDec*
                      ├→ vm_writer_write_function()
                      └→ compile_statements()      // 陳述句序列
                           ├→ compile_let() / compile_if() / compile_while()
                           ├→ compile_do()
                           └→ compile_return()
```

## 原理

### 詞法分析

Jack 語言的詞法單元分為五類：

| 類型 | 識別方式 | 範例 |
|------|---------|------|
| `T_KEYWORD` | 21 個保留字的精確匹配 | `class`, `if`, `this` |
| `T_SYM` | 19 個單字元符號 | `{`, `(`, `+`, `<` |
| `T_NUM` | 連續數字 | `42`, `0` |
| `T_STR` | 雙引號間的字元 | `"abc"` |
| `T_ID` | 以字母/底線開頭的識別碼 | `x`, `Math` |

註解移除（`remove_comments`）在 tokenize 之前進行，使用狀態機區分單行 `//` 和多行 `/* */` 註解。

### 遞迴下降語法分析

每個 Jack 文法規則對應一個 C 函式，以下列出關鍵的 BNF 規則與對應函式：

```c
// class: 'class' className '{' classVarDec* subroutineDec* '}'
void compile_class(Parser* p)

// classVarDec: ('static'|'field') type varName (',' varName)* ';'
void compile_class_var_dec(Parser* p)

// subroutineDec: ('constructor'|'function'|'method') ('void'|type)
//                subroutineName '(' parameterList ')' subroutineBody
void compile_subroutine(Parser* p)

// subroutineBody: '{' varDec* statements '}'
// 內含 compile_var_dec 和 compile_statements

// term: integerConstant | stringConstant | keywordConstant | varName
//     | varName '[' expression ']' | subroutineCall
//     | '(' expression ')' | unaryOp term
void compile_term(Parser* p)

// expression: term (op term)*
void compile_expression(Parser* p)
```

### 符號表的雙層作用域

```
┌─────────────────────────────────────┐
│  class_symbols                      │  ← static, field 變數
│  index_static, index_field          │     作用域：整個類別
├─────────────────────────────────────┤
│  subroutine_symbols                 │  ← argument, local 變數
│  index_arg, index_var               │     作用域：單一子程式
│  (每進入新 subroutine 時清空)        │
└─────────────────────────────────────┘
```

lookup 搜尋順序：subroutine → class（由內而外）。

### 編譯策略：邊分析邊產生

本編譯器不建立抽象語法樹（AST），而是在解析語法的同時直接產生 VM 程式碼。這是「單_pass 編譯」的做法，適用於 Jack 這種不需要最佳化的小型語言。

## 實作細節

### 字串常數的編譯

Jack 的字串是物件，編譯器需要產生初始化程式碼：

```
// Jack: "hello"
push constant 5        // 字串長度
call String.new 1      // 建立空字串
push constant 104      // 'h' 的 ASCII
call String.appendChar 2
push constant 101      // 'e'
call String.appendChar 2
// ... 逐字 append
```

### 陣列存取的編譯

Jack 的陣列是透過指標操作的：

```
// let a[i] = expr
push a           // push 陣列基底位址
push i           // push 索引
add              // 計算 base + index
pop pointer 1    // 將 THAT 指標指向目標位址

// --- 此時堆疊上有 expr ---
pop temp 1       // 暫存 expr 的值
pop pointer 1    // 重設 THAT（因為上面的 pop pointer 1 已改變）
push temp 1      // 把 expr 放回來
pop that 0       // *(base+index) = expr
```

### constructor 與 method 的 this 指標

- **constructor**：需要配置物件記憶體（`Memory.alloc`），然後將回傳的指標存入 `pointer 0`（即 `this`）
- **method**：`this` 指標透過隱含的第一個參數（`argument 0`）傳入

```
// constructor MyClass.new(...)
push constant nFields     // 物件大小 = field 變數的數量
call Memory.alloc 1
pop pointer 0             // this = 新配置的記憶體

// method MyClass.foo(...)
push argument 0           // 取得呼叫端傳入的 this
pop pointer 0             // 設定 this 指標
```

### 標籤命名規則

使用 `label_counter` 全域計數器，每次需要新標籤時遞增，產生唯一標籤：

- `WHILE_EXP{n}`、`WHILE_END{n}`：while 迴圈的條件檢查入口與退出點
- `IF_FALSE{n}`、`IF_END{n}`：if 陳述句的 else 入口與整體結束點

## 測試與驗證

```bash
gcc -o jack2vm jack2vm.c
./jack2vm OS/Math.jack          # 編譯單一檔案
./jack2vm OS/                   # 編譯目錄下所有 .jack
```

輸出的 `.vm` 檔案會寫入 `<原始路徑>/output/` 目錄。可在 VM Emulator 中載入執行，或與 Python 版的輸出做 diff 比對。

## 延伸討論

- **單一檔案 vs 模組化**：將所有模組合併為單一 C 檔便於編譯與分發，但失去了模組化的可維護性。Python 版的模組化設計更適合教學與擴充。
- **無 AST 設計**：邊分析邊產生的策略使編譯器結構緊湊，但若需要語義檢查（如型別檢查）或最佳化，則需引入 AST。
- **錯誤恢復**：遇到語法錯誤即 `exit(1)`，不嘗試恢復。真實編譯器通常會累積錯誤並嘗試繼續編譯。
- **記憶體管理**：使用固定大小陣列而非動態配置，限制了可編譯的程式規模，但避免了記憶體洩漏的風險。
