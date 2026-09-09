# hdl2rs 版本規劃（roadmap）

> 目標：以 Verilator 精神，把 Nand2Tetris 的 `.hdl` 逐步轉譯成 Rust 模擬器，
> 一個版本打通一個章節（或一組硬體里程碑），最終能跑完整台 HACK 電腦。
> 每版驗收標準：該章節**全部**官方 `.tst`（含本課程自訂測試）PASS。

## 版本對照總表

| 版本 | 對應章節 | 主題 | 狀態 |
|------|----------|------|------|
| v0.1 | 01+02 | 組合電路 | ✅ 已完成（21/21） |
| v0.2 | 03 | 循序電路（tick/tock、暫存器、記憶體） | 🔲 規劃中 |
| v0.3 | 05 | 整台電腦（CPU + ROM/RAM + 內建暫存器） | 🔲 規劃中 |
| v0.4 | 04+06+05 範例 | HACK 平台整合（執行 .hack / .asm 程式） | 🔲 規劃中 |
| v0.5 | 未來 | 擴充（效能、追蹤、介面） | 💡 發想 |

---

## v0.1 — 組合電路（ch01 + ch02）

**狀態：✅ 已完成（2026-09-10）**

- 範圍：第一章基本邏輯閘 / 多工器 / 第二章 ALU。
- 交付：
  - `hackhdl`：`.hdl` parser + AST + elab（多驅動 wire、拓撲排序、OUT 全覆蓋檢查）。
  - `hackrt`：`.tst` 解析器 + runner + `.cmp` 逐位元格式化。
  - `hdl2rs`：CLI + codegen（產出獨立 Rust crate）。
- 驗收：**ch01 15 + ch02 6 = 21 項測試全 PASS**（含 `ALU-nostat`）。
- 紀錄：見 `_doc/v0.1.md`。

---

## v0.2 — 循序電路（ch03）

**狀態：規劃中**

- 範圍：`Bit` / `Register` / `RAM8` / `RAM64` / `RAM512` / `RAM4K` / `RAM16K` / `PC`，
  以及官方 `DFF` 循序語意對應的 `tick` / `tock`。
- 關鍵設計：
  - **`tick`/`tock` 語意**：tick 讀取輸入存入暫存器、tock 輸出新值（Master-Slave 兩階段）。
  - `Dff` 內建晶片從「回傳現在 `q`」改為真正的兩階段更新，`q_bar` 保留。
  - `PC` 的 `inc/load/reset` 計數邏輯；`RAM` 由資料寬度×位址空間直接參數化產生。
  - 支援 `03/a`、`03/b` 子目錄 → `--dir` 需**遞迴掃描**（含 `.hdl` 同層查找）。
  - `While`/`Repeat`/`Output` 在 tick 之間的時序語意正確化
    （時間戳 `0+`/`1`/`1+` 與 data row 對應）。
- 驗收：`03/a`、`03/b` 全部 `.tst` PASS。
- 風險：`clear` 與 `RAM` 的時序合流；`output` 在 tick/tock 間的取值時點。

---

## v0.3 — 整台電腦（ch05）

**狀態：規劃中**

- 範圍：`Memory` / `CPU` / `Computer`（`ROM32K` 取代 DFF 之主 memory）。
- 關鍵設計：
  - **內建 `ARegister` / `DRegister`**：ch05 的 CPU 用 `ARegister.hdl`/`DRegister.hdl`
    內建暫存器（一般 register 具 `load`，內建版直接接受 16-bit 輸入）。
  - **`ROM32K load <file>.hack`**：`.tst` 開頭載入機器碼，作為程式記憶體初值。
  - **內部 `PinRef[]` 探測**：`RAM16K[0]`、`PC[]`、`outM` 等 subindex 欄位
    接到模擬器查詢（`get_output` 支援 `name[i]`）。
  - `Memory` 之 `inM`/`outM`/`addressM` 與 `M` 位址別名。
- 驗收：`05/` 全部 `.tst` PASS，包含跑 `Add.hack` / `Max.hack` / `Rect.hack` 等程式。
- 依賴：v0.2 的 tick/tock 必須先完成（`Computer` 內部全是循序電路）。

---

## v0.4 — HACK 平台整合（ch04 + 執行 .asm / .hack 程式）

**狀態：規劃中**

- 範圍：把整台模擬器當「硬體平台」，直接執行 ch04 的組合語言程式。
- 關鍵設計：
  - 整合 repo 內 ch06 的 assembler（`asm.cpp`）產出的 `.hack` 位元檔；
    或內建 HACK 組合語法 translator（輸入 `.asm` → `.hack`）。
  - 模擬器 CLI：`--rom <file.hack>`、`--max-cycles`、`--trace`（執行追蹤）。
  - 支援 I/O 對映（`SCREEN` / `KBD` / `MEM[M]`）＋ timed `output`。
- 驗收：ch04 範例程式（`Mult` / `Fill`）於模擬器上跑完並比對視訊記憶體 / 鍵盤。
- 依賴：v0.3 的 `Computer` 完成。

---

## v0.5 — 擴充（未來發想）

**狀態：💡 未定型**

- 效能：組合區塊快取、逐位級寬度窄化、可比對 Verilator 的編譯式速度。
- 除錯：波形匯出（VCD / GTKWave）、單步 + 斷點、內部 probe 可視化。
- 介面：把 `hdl2rs --dir NM` 接到 repo 其他章節（06 之後）當驗證後端。
- 可選：與 `verilog/`（hackcpu 等）做正確性交叉驗證。

---

## 執行慣例

- 每版完成時：更新 `README.md` 里程碑勾選與 `_doc/vN.N.md` 版本紀錄，
  產出編譯物不進 git（`*.out` / `gen/` 不入庫）。
- 驗證：先 `bash verify.sh`（可加 `-- --dir ../0N`）確認無回歸
  （v0.1 之後手動含 ch01/02）。