# jack2vm — Jack → VM 編譯器（ch11）

`jack2vm` 把 Jack 高階語言（ch09 之後進入 ch11）編譯成 HACK VM 組合語言
（`.vm`）。移植自課程 C 版 `11/c/jack2vm.c`，輸出**逐位元（byte）相容**。

## 用法（CLI）

```bash
# 在 _eda/ 下
target/debug/jack2vm ../../nand2tetris/11/jack/Seven/Main.jack   # 單一檔案
target/debug/jack2vm ../../nand2tetris/11/jack/Seven             # 整個目錄（*.jack）
target/debug/jack2vm -o out/ ../../nand2tetris/11/jack/Seven     # 指定輸出目錄
```

- 給目錄時自動收集其中所有 `*.jack`（**只看後綴**；不像 C 版 `strstr(".jack")`
  會誤吃 `.jack.md`）。
- 預設輸出到輸入所在目錄下的 `output/`（與 C 版一致）；`-o <dir>` 可換位置。
- 編譯訊息印 `Analyzing <path>` / `  → <out>.vm`（與 C 版相同）。

## Library API（`src/lib.rs`）

```rust
pub fn lex_all(source: &str) -> Vec<Tok>   // 先移除註解再 lexer 出 token
pub fn compile(source: &str) -> String     // 整支 Jack class → VM 文字
```

## 實作重點

- 支援完整 Jack：class/static/field、constructor/function/method、
  let/if/while/do/return、陣列 `varName[expr]`、字串常數、
  `.` 方法與「純類別」函式呼叫。
- 註解/空白處理照 C：先整份移除區塊/行註解（不支援巢狀 `/* */`）。
- `do expr;` 的結果 `pop temp 0`；陣列 `let a[i]=…` 的臨時位址用 `temp 1`。
- 標籤 `WHILE_EXP{n}`/`WHILE_END{n}`/`IF_FALSE{n}`/`IF_END{n}`：每檔全域
  計數器直接寫進格式字串。

## 測試 / 驗證

```bash
cargo test -p jack2vm
```

byte 相容驗證：`11/jack` 全部 11 支 Jack 程式與 `/tmp/coracle/jack2vm`
（plain-gcc 編譯的 C 版）單檔模式比對，`cmp` 零差異（`_eda/_doc/v0.5.md`）。