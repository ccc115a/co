# hackhdl — HackHDL 解析與詳述（library）

`hackhdl` 是 `.hdl` 硬體描述語言的**前端**：把 Nand2Tetris 的晶片描述
解析成 AST，再展開（elaboration）成可直接產生 Rust 程式碼的 IR。
純 library，沒有 command line；由 `hdl2rs` 呼叫。

## 資料流

```
<top>.hdl (+BUILTIN) ──parse_hdl──▶ AST ──elab──▶ Elab（IR）
        │                                       │
        └── load_library / merge_libs（搜尋目錄）┘
```

## 主要 API（`src/lib.rs`）

| 函式 | 作用 |
|---|---|
| `parse_hdl(&str) -> Result<Chip, String>` | 單一 `.hdl` 原始碼 → AST（`parser.rs`） |
| `load_library(dir) -> Result<HashMap<name, Chip>, String>` | 掃描目錄內所有 `.hdl` |
| `merge_libs(a, b)` | 合併多個程式庫（後者覆蓋同名晶片） |
| `elab(lib, top) -> Result<Elab, ElabError>` | 由 top 展開全部子晶片 → 拓樸排序 IR |

模組：`ast.rs`（資料型別）、`parser.rs`（語法分析）、`elab.rs`（詳述）。

## 實作重點

- **多驅動 wire**：允許「子輸出分切」的寫法（例：`out[0..7]=outLow`），
  elab 檢查目的位元範圍互不重疊。
- **OUT 全覆蓋**：晶片的 `OUT` pin 必須被 inputs 或子晶片輸出完全涵蓋，
  否則視為 bug（避免 `0` 預設值悄悄成為答案）。
- **拓樸排序**：偵測組合回圈（feedback）直接回報錯誤。
- **內建晶片**：`Nand` 在執行期（hackrt）處理，elab 視為原語。

## 測試 / 驗證

```bash
cargo test -p hackhdl
```

`hdl2rs` 的整合測試（ch01–05 全部 `.tst`）跑 `_eda/verify.sh`。