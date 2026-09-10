# hdl2rs — HackHDL → Rust 模擬器（CLI）

`hdl2rs` 是本專案的**主 CLI**：把「hackhdl 解析＋hackrt 執行」串成完整的
模擬器。以「Verilator 精神」把 `.hdl` 電路描述轉譯成獨立的 Rust crate、
編譯後直接跑官方 `.tst` / `.cmp` 測試並比對輸出。

## 用法

```bash
# 跑指定目錄下所有 .tst
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --out gen

# 只跑單一測試
cargo run -q -p hdl2rs -- --dir ../01 --test ../02/ALU.tst --out gen

# 整章回歸（ch01~ch05，見 _eda/verify.sh）
bash verify.sh
```

## 常用旗標

| 旗標 | 作用 |
|---|---|
| `--dir <DIR>` | 可重複；指定搜尋 `.hdl` / `.tst` 的目錄 |
| `--test <檔案>` | 只跑指定 `.tst`（可多次）；省略則跑所有找得到的 |
| `--top <名稱>` | 指定 top chip（預設取自 `.tst` 的 `load` 指令） |
| `--out <DIR>` | 產出 crate 的根目錄（預設 `gen`） |
| `--keep` | 保留產出的 crate（預設跑完即刪除） |
| `--release` | 用 release 模式編譯產出的模擬器（長跑測試加速，建議） |

## 執行流程

```
.readt …(scripts & cmp)                    .hdl 程式庫
   │  parse_script(hackrt)                    │  load_library(hackhdl)
   ▼                                          ▼
 top 晶片  ◀───── 腳本的 load ─被產成        elab(lib, top) → Elab IR
                                               │
                                          gen.rs 產生獨立 Rust crate
                                               │  cargo build
                                          <Top>_sim  執行 .tst 並比對 .cmp
```

- 產出目錄：`gen/<Top>_sim/`，binary 為 `gen/<Top>_sim/target/(debug|release)/<Top>_sim`。
- 每支測試分別產出自己的 crate，互不干擾；跑完即刪（除非 `--keep`）。

## 實作重點

- **逐位元 `.cmp` 格式化**：與官方硬體模擬器完全一致（見 `hackrt` README）。
- **循序電路**：支援 `tick` / `tock` 語意與 `Dff`、`Bit`、`Register`、`RAM`、
  以及整台 `Computer.hdl`（含 `ROM32K load`、CPU 內部暫存器）。
- **內建 Keyboard**：KBD 由腳本 `set RAM[24576] …` 模擬輸入。

## 測試 / 驗證

```bash
cargo test -p hdl2rs        # codegen 單元測試
bash verify.sh              # ch01~ch05 全部 .tst 回歸（現為 40/40 PASS）
```