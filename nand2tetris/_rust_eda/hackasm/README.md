# hackasm — HACK 組合語言組譯器（ch06）

`hackasm` 是 HACK 組合語言的**兩 pass 組譯器**，把 `.asm` 轉成 16 位元
機器字。作為 library 提供核心 `assemble()`，另有 command line 可供直接使用。

## 用法（CLI）

```bash
# 在 _eda/ 下
target/debug/hackasm file.asm                 # 產生 file.hack（或先 cargo build -p hackasm）
target/debug/hackasm file.asm out.hack        # 指定輸出檔名
target/debug/hackasm file.asm file.hack --bin # 外加 file.bin（little-endian u16）
```

| 輸出 | 格式 | 用途 |
|---|---|---|
| `.hack`（預設） | 每行 16 位元 0/1 的文字檔 | 載入官方 HardwareSimulator / hdl2rs `Computer` |
| `.bin`（`--bin`） | 原始 u16 little-endian bytes | 載入 `hackemu` 虛擬機 |

## Library API（`src/lib.rs`）

```rust
pub fn assemble(src: &str) -> Result<Vec<u16>, String>   // .asm 文字 → 指令序列
pub fn to_hack_text(words: &[u16]) -> String             // 指令序列 → .hack 文字
```

## 實作重點

- **pass1**：收集 `(LABEL)` 標記位址。
- **pass2**：`@symbol` 依「預設符號 → 標記 → 新變數（從 RAM[16] 起）」順序
  解析，編碼 A / C 指令；C 指令依 `comp`/`dest`/`jump` 欄位。
- 結果以 `Vec<u16>` 為唯一內部型別：`.hack` 是它的文字化、`.bin` 是它的
  little-endian 位元組化。

## 測試 / 驗證

```bash
cargo test -p hackasm
```

組譯結果可接著餵給 hdl2rs（`Computer.hdl`）或 `hackemu` 的 `--headless`
交叉驗證（見 `_eda/verify.sh`）。