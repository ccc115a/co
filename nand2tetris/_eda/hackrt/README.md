# hackrt — HackHDL 執行期（library）

`hackrt` 是 `.hdl` 模擬的**執行期**：負責讀取並執行官方 `.tst` 測試腳本、
把暫存值格式化成與官方硬體模擬器**逐位元一致**的輸出（`.cmp` 比對用）。
純 library，沒有 command line；由 `hdl2rs` 產出的模擬程式呼叫。

## 資料流

```
.tst 腳本 ──parse_script──▶ Script ──run(model, script)──▶ 逐行執行
                                                              │
                                            report_compare ───┤──▶ tip 比對結果
```

## 主要 API（`src/lib.rs`）

| 函式 | 作用 |
|---|---|
| `parse_script(&str) -> Result<Script, String>` | 解析 `.tst`（load / output-list / tick / set / eval 等） |
| `run(model, script)` | 依腳本驅動模擬模型，餵給 `fmt` 產出輸出列 |
| `report_compare(...)` | 與 `.cmp` 逐列比對，回報 PASS / FAIL |
| `nand(a, b) -> u16` | 內建 Nand 的 Boolean 行為（模擬時唯一原語） |

模組：`tst.rs`（腳本解析與執行）、`fmt.rs`（輸出格式）。

## 實作重點（`.fmt` 格式）

與官方 HardwareSimulator 輸出規則一致，逐位元相同：

- `Bin`：右對齊、零填滿；`Dec`：有號右對齊。
- `%S` 時間欄位左對齊；`constant` / undefined 值以 `*` 表列。

## 測試 / 驗證

```bash
cargo test -p hackrt
```

`hdl2rs` 的整合測試（ch01–05 全部 `.tst`）跑 `_eda/verify.sh`。