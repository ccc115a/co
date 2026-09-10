# hdl2rs — Hack 組合電路 → Rust 模擬器

以「Verilator 精神」把 Nand2Tetris 的 `.hdl` 電路描述**轉譯成 Rust**，
再編譯成獨立的模擬程式，直接跑官方 `.tst` / `.cmp` 測試並比對輸出。

語言慣例：本目錄的文件以**繁體中文**撰寫（與 repo 其他 `.md` 一致）。

## 架構

```
_eda/
├─ hackhdl/   .hdl parser + AST + elaboration（選路、拓撲排序、OUT 全覆蓋檢查）
├─ hackrt/    執行期：.tst 解析器 + 模擬 runner + .cmp 格式化（fmt）
├─ hdl2rs/    CLI：讀 .hdl → 產出獨立 Rust crate → cargo build → 跑測試
├─ hackasm/   組譯器：HACK 組語 → .hack（16-bit 文字）與 .bin（u16 LE）
├─ vm2asm/    VM → HACK 組語（ch07/08，與 08/vm2asm.c byte 相容）
├─ jack2vm/   Jack → VM 組合語言（ch11，與 11/c/jack2vm.c byte 相容）
└─ hackemu/   HACK 虛擬機：執行 .bin/.hack，egui GUI 顯示 SCREEN + headless 模式
```

每個子模組在自己的目錄各有 `README.md`（`.hdl` 前端/執行期、主 CLI、組譯器、
兩支轉換器、虛擬機的用法與 API），資料流與使用方式另見各章 `_doc/v0.x.md`。

## 文件導覽

- **快速入門**：環境建置與各章工具速查 → `_doc/getting_started.md`
- **版本規劃（roadmap）**：v0.1 → v0.8 對照表與每版驗收 → `_doc/plan.md`
- **版本紀錄**：`_doc/v0.1.md` … `_doc/v0.6.md`（每版實作內容、驗證、踩到的坑）
- **下一里程碑設計**：ch12 OS 在 hackemu 上執行 → `_doc/v0.7.md`

資料流：

```
<top>.hdl (+BUILTIN) ──parse──▶ AST ──elab──▶ ElabChip 圖
                                             │
hackrt::parse_script(.tst) ◀───load─────┐    ▼
                                       │  gen.rs codegen（逐 chip 展開 wire + set_bits）
                                       ▼
                             gen/<Top>_sim/  ──cargo build──▶ <Top>_sim
                                       ▲
hackrt::run(model, script) ◀───────────┘  ◀── argv[1] = <script>.tst
```

## 使用方式

直接跑整章（會自動掃描該目錄下所有 `.tst`）：

```bash
# 在 _eda/ 下
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --out gen
```

單一測試：

```bash
cargo run -q -p hdl2rs -- --dir ../01 --test ../02/ALU.tst --out gen
```

常用旗標：

- `--dir <目錄>`：可重複，指定搜尋 `.hdl` / `.tst` 的目錄（裡面的子目錄不會被掃描）。
- `--test <檔案>`：只跑指定 `.tst`（不給則跑所有找得到的 `.tst`）。
- `--top <名稱>`：指定 top chip（預設取自 `.tst` 的 `load` 指令）。
- `--out <目錄>`：產出 crate 的根目錄（預設 `gen`）。
- `--keep`：保留產出的 crate（預設跑完即刪除）。

驗證全部過關：`bash verify.sh`

## 設計重點

- **多驅動 wire**：Nand2Tetris 常見「子輸出分切」的寫法（例如 `Not16` 用 16 個 `Not`
  各自寫 `out[i]`、`ALU` 把 `out=o2` / `out[0..7]=outLow` / `out[15]=ng` 扇出），
  elab 會檢查目的位元範圍互不重疊，允許「不相交的切分寫入」。
- **OUT 全覆蓋**：晶片的 `OUT` pin 必須被 inputs 或 subchip 輸出完全涵蓋，
  否則當作 bug 回報（避免 `0u16` 預設值悄悄成為答案）。
- **拓撲排序**：wire 的驅動者→讀取者形成 DAG，先算線路再合併到 `OUT`；
  偵測組合回圈（feedback）直接報錯。
- **.cmp 格式化**：與官方硬體模擬器逐位元一致——
  `Bin` 右對齊零填滿、`Dec` 有號右對齊、`%S` 時間欄位左對齊、
  `constant`/undefined 以 `*` 表列。
- **內建晶片**：`Nand`（真理表）以及 `Dff`（尚未啟用 tick/tock 語意，見待辦）。

## 里程碑 / 待辦

各版進度與實作記錄見 `_doc/v0.x.md`（繁體中文）。目前：

- [x] M1：ch01+ch02 全部組合電路測試 PASS（21/21）。
- [x] M2：ch03 循序電路——`tick`/`tock` 語意、`Dff` 真實行為、`Bit`/`Register`/`RAM`。
- [x] M3：ch05 整台電腦——`ROM32K load`、內部 `PinRef[]` 探測、內建 `ARegister`/`DRegister`。
- [x] M4：ch04（Mult、Fill 跑在 Computer.hdl 上）。
- [x] M5：Jack → VM → ASM → HACK 全鏈路 e2e（`jack2vm`/`vm2asm` 逐位元相容 C 版）。
- [x] M6：`hackemu` 虛擬機執行 `.bin`/`.hack`，GUI 顯示 SCREEN + headless 驗證。