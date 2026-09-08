# jack2vm_v2.c 程式說明

C 語言實作的 Jack 編譯器第二版，以簡化版的 `Parser` 結構體和直接函式呼叫取代了 v1 的函數指標設計。

## 概述

本檔案是 jack2vm_v1.c 的簡化重構版。兩版的詞法分析器、符號表、VM 寫入器完全相同，主要差異在 Parser 層：

1. **Parser 結構體不再包含函數指標**（第 85–92 行），只保留 `lex`、`symbols`、`vm`、`current_class`、`current_subroutine`、`label_counter` 六個欄位。
2. **所有 `compile_xxx` 函式改為自由函式**，直接呼叫而非透過函數指標間接呼叫。
3. 程式碼從 959 行縮減至 747 行，省去了函數指標的宣告與賦值。

## 架構總覽

模組結構與 v1 相同，共九個區段：

| 區段 | 功能 |
|------|------|
| 1. 常數定義 | Token 類型、關鍵字、符號種類 |
| 2. 結構體定義 | Token、Lex、Symbol、SymbolTable、VMWriter、Parser（**無函數指標**） |
| 3. 函數原型宣告 | 所有函式的前置宣告 |
| 4. 錯誤處理 | `report_error()` |
| 5. Lexer | 移除註解、token 化、advance/peek |
| 6. Symbol Table | 雙層作用域符號管理 |
| 7. VM Writer | VM 指令輸出 |
| 8. Parser | 遞迴下降語法分析（**直接呼叫**） |
| 9. 主程式 | 檔案/目錄遍歷 |

### 呼叫流程（與 v1 的差異）

```
parser_init()
  └→ lex_init() / symbol_table_init() / vm_writer_init()
  └→ compile_class(parser)          // 直接呼叫，不再用函數指標
```

v1 使用 `parser->compile_class(parser)`，v2 直接使用 `compile_class(parser)`。

## 原理

語法分析與 VM 指令產生的原理與 v1 完全相同，請參閱 `jack2vm_v1.c.md`。核心差異僅在 C 語言的結構組織方式，不影響編譯器的語義行為。

### 直接呼叫的好處

- **編譯效率**：省去函數指標的間接跳轉。
- **程式碼可讀性**：函式簽名直接出現在原型宣告中（第 131–144 行），不必對照結構體中的函數指標欄位。
- **除錯便利**：堆疊追蹤中直接顯示函式名稱，不需透過指標間接定位。

## 實作細節

### 與 v1 的具體差異對照

| 特徵 | jack2vm_v1.c | jack2vm_v2.c |
|------|-------------|-------------|
| Parser 結構體 | 含 14 個函數指標 | 僅含 6 個資料欄位 |
| Parser 大小 | ~70 bytes（含指標） | ~50 bytes |
| 呼叫方式 | `parser->compile_xxx(parser)` | `compile_xxx(parser)` |
| `parser_init` | 賦值函數指標 → 呼叫 `parser->compile_class(parser)` | 直接呼叫 `compile_class(parser)` |
| 程式碼行數 | 959 | 747 |
| 編譯結果 | 相同 | 相同 |

### 緊湊迴圈寫法

v2 在多處使用了 C 語言逗號運算子的緊湊寫法，例如：

```c
} while (is_sym(p, ',') && (lex_advance(p->lex), 1));
```

這表示：若下一個 token 是逗號，就先 advance 跳過逗號，然後迴圈繼續（逗號運算子回傳 `1` 使 `while` 為真）；若不是逗號，則 `is_sym` 回傳 `0`，迴圈結束。

## 測試與驗證

編譯與執行方式與 v1 相同：

```bash
gcc -o jack2vm_v2 jack2vm_v2.c
./jack2vm_v2 <file.jack>
./jack2vm_v2 <directory>
```

可分別用 v1 和 v2 編譯同一個 `.jack` 檔案，比對兩者產出的 `.vm` 檔案是否一致，以驗證重構未改變語義。

## 延伸討論

v2 是從 v1 到最終版（jack2vm.c）的過渡版本。它確立了「直接呼叫」的設計方向，而最終版 jack2vm.c 則在此基礎上加入了詳盡的 BNF 註解與文件化註解，使其更適合教學用途。三版的編譯邏輯完全相同，差異僅在結構組織與文件化程度。
