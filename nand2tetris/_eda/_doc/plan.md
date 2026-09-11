# _eda 工具鏈版本規劃（roadmap）

> 目標：以 Verilator 精神，把 Nand2Tetris 的 `.hdl` 逐步轉譯成 Rust 模擬器，
> 一個版本打通一個章節（或一組里程碑），最終組成完整的 HACK 開發鏈：
> **`.hdl` / `.jack` / `.vm` / `.asm` 都能寫、都能驗證、都能執行**。
> 每版驗收標準：該章節**全部**官方 `.tst`（含本課程自訂測試）PASS。

## 版本對照總表

| 版本 | 對應章節 | 主題 | 狀態 |
|------|----------|------|------|
| v0.1 | 01+02 | 組合電路（hackhdl/hackrt/hdl2rs 誕生） | ✅ 已完成（21/21） |
| v0.2 | 03 | 循序電路（tick/tock、暫存器、記憶體） | ✅ 已完成（29/29） |
| v0.3 | 05 | 整台電腦（CPU + 內建暫存器 + ROM32K + 內部 Probe） | ✅ 已完成（CPU 2/2） |
| v0.4 | 04 | HACK 平台整合（Mult/Fill 跑在 Computer.hdl） | ✅ 已完成（2/2） |
| v0.5 | 06+07+08+11 | 工具鏈誕生（hackasm CLI、vm2asm、jack2vm，C 版 byte 相容）＋ 全鏈路 e2e | ✅ 已完成（40/40） |
| v0.6 | 05→06 之後 | hackemu 虛擬機（執行 .bin/.hack，egui GUI 顯示 SCREEN） | ✅ 已完成（40/40＋交叉驗證） |
| v0.7 | 12 | ch12 OS 整包在 hackemu 上執行（含 Pong 可玩） | ✅ M7.1–M7.5 全過（v0.7.1 `--keys`、v0.7.2 M7.3 四支模組測試＋修 drawPixel 位元方向 bug）；M7.6 跳過（見 `_doc/v0.7.md`） |
| v0.8 | 網頁版 | 瀏覽器 thin client + Rust 伺服器（WebSocket）當 CPU/OS Emulator（路線 B） | ✅ 完成（見 `_doc/v0.8.md`） |

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

**狀態：✅ 已完成（2026-09-10）**

- 範圍：`Bit` / `Register` / `RAM8` / `RAM64` / `RAM512` / `RAM4K` / `RAM16K` / `PC`，
  以及官方 `DFF` 循序語意對應的 `tick` / `tock`。
- 關鍵設計：
  - **`tick`/`tock` 語意**：tick 讀取輸入存入暫存器、tock 輸出新值（Master-Slave 兩階段）。
  - `Dff` 內建晶片從「回傳現在 `q`」改為真正的兩階段更新，`q_bar` 保留。
  - `PC` 的 `inc/load/reset` 計數邏輯；`RAM` 由資料寬度×位址空間直接參數化產生。
  - 支援 `03/a`、`03/b` 子目錄 → `--dir` 需**遞迴掃描**（含 `.hdl` 同層查找）。
  - `While`/`Repeat`/`Output` 在 tick 之間的時序語意正確化
    （時間戳 `0+`/`1`/`1+` 與 data row 對應）。
- 驗收：`03/a`、`03/b` 全部 `.tst` 29/29 PASS。
- 紀錄：見 `_doc/v0.2.md`。

---

## v0.3 — 整台電腦（ch05）

**狀態：✅ 已完成（2026-09-10）**

- 範圍：`CPU`（內建 `ARegister`/`DRegister`、user `PC`）、`ROM32K`/`Screen`/`Keyboard`
  內建型別、內部 `PinRef[]` 探測、`outM` 未定義語意。
- 關鍵設計：
  - **內建 `RegChip`**：ARegister/DRegister 共用 16-bit master/slave
    `{ latch, q }`；probe 讀 **latch**（tick 後立即顯示取樣值，已用 `CPU.cmp` 驗證）。
  - **`ROM32K load <file>.hack`**：`Rom32KChip::load` 解析文字二進位列；
    `TopModel::load_rom` 沿 user 子晶片遞迴轉發。
  - **內部 Probe**：`get_output` 對非 top pin 名稱以 `PinRef` 拆 `name[i]` 後
    查 `probe_whole/probe_bit`。
  - `outM` 於 `writeM==0` 時回 `None`（官方顯 `*******`）× `fmt` 未定義欄位
    填滿整個 `a+b+c` 寬度。
- 驗收：`CPU-external.tst`（純外部 pin）與 `CPU.tst`（含 `DRegister[]` 探測）
  雙 PASS；ch01~ch03 回歸 29/29。
- 紀錄：見 `_doc/v0.3.md`。

---

## v0.4 — HACK 平台整合（ch04 + 執行 .asm / .hack 程式）

**狀態：✅ 已完成（2026-09-10）**

- 範圍：把整台模擬器當「硬體平台」，直接執行 ch04 的組合語言程式。
- 交付：
  - `ROM32K load <file>.hack` 由腳本觸發（v0.3 只有 crystal 觸發）；
  - ch04 `Mult` / `Fill` 在 `Computer.hdl` 上跑完並比對視訊記憶體 / 鍵盤。
- 驗收：`Mult-hw`、`Fill-hw` 雙 PASS；ch01~ch05 回歸不受影響。
- 紀錄：見 `_doc/v0.4.md`。

---

## v0.5 — 工具鏈誕生（ch06–08 + ch11）

**狀態：✅ 已完成（2026-09-10）**

- 範圍：由 4 crate 擴成 6 crate，補齊「寫程式」一側的工具。
- 交付：
  - `hackasm` CLI：`hackasm <in.asm> [out.hack] [--bin]`（`.hack` 文字 + `.bin` u16 LE）。
  - `vm2asm`：VM → HACK 組語（ch07/08），共用計數器處理多檔；
    與 `08/vm2asm.c` **byte 相容**（07×6 + 08×11 = 17/17）。
  - `jack2vm`：Jack → VM（ch11），與 `11/c/jack2vm.c` **byte 相容**（11/11）。
  - 全鏈路 e2e：`Main.jack+Sys.jack → chain.hack` 在 Computer.hdl 上 RAM[16]=5。
- 驗收：`verify.sh` 40/40（ch01–03 29 + ch04 2 + ch05 8 + chain 1）。
- 紀錄：見 `_doc/v0.5.md`。

---

## v0.6 — hackemu 虛擬機（GUI + headless）

**狀態：✅ 已完成（2026-09-10）**

- 範圍：第 7 個 crate `hackemu`（原名 `hackvm`，避免與 `.vm` 中間語言混淆）。
- 交付：
  - 純 std 的 VM 核心 `lib.rs`（32K RAM + SCREEN + KBD，`CPU.hdl` 同步語意）。
  - egui/eframe 0.36 GUI：顯示 512×256 螢幕、鍵盤碼 128–152、載入/執行/單步/重置/速度。
  - `--headless` 無視窗模式供自動化 grep 驗證。
- 驗收：`verify.sh` 40/40 + headless 交叉檢查（chain.bin → RAM[16]=5，與 hdl2rs 一致）。
- 紀錄：見 `_doc/v0.6.md`。

---

## v0.7 — ch12 OS 在 hackemu 上執行

**狀態：✅ 已完成（2026-09-10）**

- 範圍：把 `12/*.jack` 整包 OS 透過既有工具鏈編譯、開機、跑起來，
  並且能跑像 Pong 這種需要 OS 的應用程式（GUI 可互動）。
- 已達成：
  - M7.1 `jack2vm` 8/8 byte 與 C oracle 一致（含 Screen.jack 官方兩 bug 修正）。
  - vm2asm 多檔模式 label 依函式 scope（單檔仍與 C 逐位元一致）→ 多檔 bootstrap 可用。
  - 關鍵發現：Hack 的 `@x` 只有 15 位址位元，**ROM > 32768 words 結構上無法定址**；
    全 OS+app 組譯 35330 words > 32K。改以「裁剪版 OS」（去 Output 字型 +
    極簡 Output 替身 + 自訂 Sys「Memory.init 先行」）跑進 32K。
  - M7.2 裁剪版 OS headless 驗證全過（`gen/show.bin`，17770 words）。
  - M7.4 Pong 上 32K：`gen/pong.bin` **29544 words**，headless 驗證
    ball/bat/地板全渲染、ball 會動、無窮迴圈穩定；GUI 方向鍵可玩。
  - M7.5 `hackemu --keys` 方向鍵自動化回歸（v0.7.1，left/right bat 分離 >100px）。
  - M7.3 精簡版逐模組單測（v0.7.2：Math/String/Screen/Memory 四支），
    順手修掉官方 `Screen.drawPixel` 位元方向 bug 並發現 jack2vm「無優先權、
    由左而右」parser 陷阱。
- 設計與驗收細節：見 `_doc/v0.7.md`（含待解問題、步驟拆解）。

---

## v0.8 — 網頁版 CPU/OS Emulator（HACK simulator served via WebSocket）

**狀態：✅ 完成（2026-09-12；`verify.sh` 含 v0.8 區段全綠，詳見 `_doc/v0.8.md`）**

- 路線 B：Rust 伺服器（`hackserve`，axum + WS + 靜態）跑同一顆 `hackemu::Vm` /
  `hackasm::assemble_err`；瀏覽器薄前端（`web/`，純 HTML/JS/Canvas）。
- 仿官方 CPU Emulator：載入/直接輸入 `.asm` → 組譯 → 即時跑，觀察暫存器、
  記憶體分頁、SCREEN、KBD 的立即反應；PC 高亮、組譯錯誤逐行標記、FPS 顯示。
- 每視覺幀 = 「前端節拍 → `simulate{steps}` → 伺服器回 snapshot → 繪製」；
  Speed 滑桿 = 每幀步數（與 egui 版同一模型）。
- 保留 egui 原生 GUI 與 headless CLI（`--keys/--trace/--sample/--img`）。
- （選做 v0.8.x）伺服器端跑 `jack2vm`+`vm2asm` → 可貼 .jack/.vm 上網執行。
- 其餘既有發想（效能/波形/模擬器互驗）暫緩。

---

## 執行慣例

- 每版完成時：更新 `README.md` 里程碑勾選與 `_doc/vN.N.md` 版本紀錄，
  產出編譯物不進 git（`*.out` / `gen/` / `target/` 不入庫）。
- 驗證：先 `bash verify.sh` 確認無回歸，再跑 `bash test.sh`（容錯版）；
  兩者皆應全綠。