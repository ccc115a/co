# vm2asm — VM → HACK 組合語言轉換器（ch07/08）

`vm2asm` 把 HACK VM 指令（`.vm`，ch07/08 中間語言）翻譯成 HACK 組語。
移植自課程 C 版 `08/vm2asm.c`，輸出**逐位元（byte）相容**。

## 用法（CLI）

```bash
# 在 _eda/ 下
target/debug/vm2asm out.asm in.vm            # 單一檔案（不含 bootstrap）
target/debug/vm2asm out.asm dir/             # 目錄（自動收集所有 .vm，照檔名排序）
target/debug/vm2asm out.asm a.vm b.vm c.vm   # 多檔案
```

- 超過一個 VM 檔時，會自動加上 `SP=256` + `call Sys.init 0` 的 bootstrap
  （與 `vm2asm.c` 的判定一致）。
- 參數順序：**`<output.asm>` 在前、`<input.vm|dir>` 在後**。

## Library API（`src/lib.rs`）

```rust
pub fn translate_file(vm: &str, current_file: &str) -> String  // 單一 VM 檔內容 → 組語
pub fn translate(inputs: &[(String, String)], bootstrap: bool) -> String // 多檔，共用計數器
```

## 實作重點

- 支援完整 VM 指令：stack 算術（add/sub/neg/and/or/not/eq/gt/lt）、
  push/pop（constant/local/argument/this/that/temp/pointer/static）、
  label/goto/if-goto、function/call/return。
- **共享 `Writer` / 共用計數器**：eq/gt/lt 的 `TRUE_{n}`/`END_{n}` 與
  call 的 `{func}$ret.{n}` 跨檔案累積（C 版是 `static int`），確保多檔
  case（NestedCall、FibonacciElement、StaticsTest…）標記不撞名。
- 檔案頭註解、每行 `// <line>`、靜態段以 `{current_file}.{index}` 引用：
  全部照 C。

## 測試 / 驗證

```bash
cargo test -p vm2asm
```

byte 相容驗證：07 全部 6 檔 + 08 全部 11 檔與 `/tmp/coracle/vm2asm`
（plain-gcc 編譯的 C 版）比對，`cmp` 零差異（記錄於 `_eda/_doc/v0.5.md`）。