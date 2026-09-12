# hackeda — Nand2Tetris 全工具鏈（Rust）

本專案統稱 **hackeda**（位於 `_eda/`）。以「Verilator 精神」把 Nand2Tetris
由硬體到高階語言整條工具鏈用 Rust 實作：`.hdl` 電路可直接轉譯成 Rust 模擬器、
跑官方 `.tst` / `.cmp` 驗證；組合語言、VM、Jack 各有對應工具；最後用虛擬機與
網頁模擬器把程式「跑起來」。

`hdl2rs` 是其中的**主 CLI 子專案**（名稱沿用），負責 `.hdl` → Rust 模擬器一側；
其餘子專案也各自獨立成 crate。

語言慣例：本目錄的文件以**繁體中文**撰寫（與 repo 其他 `.md` 一致）。

## 架構

```
_eda/
├─ hackhdl/    .hdl parser + AST + elaboration（選路、拓撲排序、OUT 全覆蓋檢查）── library
├─ hackrt/     執行期：.tst 解析器 + 模擬 runner + .cmp 逐位元格式化 ── library
├─ hdl2rs/     主 CLI：讀 .hdl → 產出獨立 Rust crate → cargo build → 跑官方測試
├─ hackasm/    組譯器（ch06）：HACK 組語 → .hack（文字）與 .bin（u16 LE）
├─ vm2asm/     VM → HACK 組語（ch07/08，與 08/vm2asm.c byte 相容）
├─ jack2vm/    Jack → VM 組合語言（ch11，與 11/c/jack2vm.c byte 相容）
├─ hackemu/    HACK 虛擬機：執行 .bin/.hack，egui GUI 顯示 SCREEN + headless 模式
├─ hackserve/  HTTP/WebSocket 伺服器：網頁版模擬器的後端
└─ web/        瀏覽器前端（純 HTML/JS/Canvas，無框架、無 build step）
```

建置與單元測試（在 `_eda/` 下）：

```bash
cargo build           # 產出 target/debug/{hdl2rs,hackasm,vm2asm,jack2vm,hackemu,hackserve}
cargo test -q         # 全部 crate 單元測試（30 個）；單一 crate 用 cargo test -p <name>
```

## 工具用法

### hdl2rs — .hdl 模擬器（主 CLI）

把 `.hdl` 電路描述轉譯成獨立的 Rust crate，編譯後直接跑官方 `.tst` / `.cmp`
測試並逐位元比對輸出。

```bash
cargo run -q -p hdl2rs -- --dir ../01 --dir ../02 --out gen          # 跑指定目錄所有 .tst
cargo run -q -p hdl2rs -- --dir ../01 --test ../02/ALU.tst --out gen # 只跑單一測試
```

常見旗標：

| 旗標 | 作用 |
|---|---|
| `--dir <DIR>` | 可重複；指定搜尋 `.hdl` / `.tst` 的目錄（子目錄會被掃描） |
| `--test <檔案>` | 只跑指定 `.tst`（可多次）；省略則跑所有找得到的 |
| `--top <名稱>` | 指定 top chip（預設取自 `.tst` 的 `load` 指令） |
| `--out <DIR>` | 產出 crate 的根目錄（預設 `gen`） |
| `--keep` | 保留產出的 crate（預設跑完即刪） |
| `--release` | release 模式編譯模擬器（長跑測試建議） |

產出：`gen/<Top>_sim/`，執行檔為 `gen/<Top>_sim/target/(debug|release)/<Top>_sim`。

### hackasm — 組譯器（ch06）

兩 pass 組譯器：`.asm` → 16 位元機器字。

```bash
target/debug/hackasm file.asm                 # 產生 file.hack（每行 16 位元 0/1）
target/debug/hackasm file.asm out.hack        # 指定輸出檔名
target/debug/hackasm file.asm file.hack --bin # 外加 file.bin（u16 little-endian）
```

`.hack` 文字檔供 HardwareSimulator / hdl2rs 的 `Computer` 載入；`.bin` 供
`hackemu` 載入。

### vm2asm — VM → HACK 組語（ch07/08）

```bash
target/debug/vm2asm out.asm in.vm            # 單一檔案（不含 bootstrap）
target/debug/vm2asm out.asm dir/             # 目錄：自動收集所有 .vm，照檔名排序
target/debug/vm2asm out.asm a.vm b.vm c.vm   # 多檔案
```

- 參數順序：**`out.asm` 在前、`in.vm|dir` 在後**。
- 超過一個 VM 檔自動加 bootstrap（`SP=256` + `call Sys.init 0`，與 `vm2asm.c` 判定一致）。
- 支援完整 VM 指令；**輸出與 `08/vm2asm.c` 逐位元（byte）相容**。

### jack2vm — Jack → VM 編譯器（ch11）

```bash
target/debug/jack2vm ../../nand2tetris/11/jack/Seven/Main.jack  # 單一檔案
target/debug/jack2vm ../../nand2tetris/11/jack/Seven            # 整個目錄（*.jack）
target/debug/jack2vm -o out/ ../../nand2tetris/11/jack/Seven    # 指定輸出目錄
```

- 給目錄時收集其中所有 `*.jack`（**只看後綴**，不會誤吃 `.jack.md`）。
- 預設輸出到輸入目錄下的 `output/`（與 C 版一致）；`-o <dir>` 可換位置。
- 支援完整 Jack；**輸出與 `11/c/jack2vm.c` 逐位元（byte）相容**。

### hackemu — HACK 虛擬機（GUI + headless）

模擬整台 ch05 電腦（CPU + 32K RAM + 螢幕 + 鍵盤），載入 `.bin` / `.hack` 執行。

```bash
cargo run -p hackemu gen/chain/chain.hack              # 開 egui GUI（需視窗環境）
target/debug/hackemu --headless file.bin --max 500000  # 無視窗，跑 50 萬條指令
```

- GUI 顯示 SCREEN（512×256）、接受鍵盤輸入，可 Load / Run / Pause / Step / Reset /
  調速；文字全英文（egui 預設字型不含中文字形）。
- headless：`--max` 預設 100,000；跑完印出 PC/A/D/SP、`RAM[0..16]` 與
  `RAM[16] static` 供 grep 檢查。
- 其他旗標：`--keys <file>`（時間戳＋按鍵自動化）、`--trace`、`--sample`、
  `--img <ppm>`、`--dump <a,b>`。
- 記憶體映射：`RAM[0..16384)` 一般記憶體、`SCREEN = 16384..24576`（256 列 ×
  512 欄、每列 32 word）、`KBD = 24576`。
- 語意與 `CPU.hdl` 一致：M 的寫入位址用「更新前」的 A、jump 用「更新後」的 A；
  word 的 **bit15 = 最左邊畫素**。

### hackserve — 網頁版模擬器（WebSocket）

瀏覽器薄前端 + Rust 伺服器，仿官方 CPU Emulator：編輯/載入 `.asm` → 組譯 →
即時跑，觀察暫存器、記憶體、SCREEN、KBD。

```bash
cargo build --release -p hackserve
./target/release/hackserve [--port 8080]       # 瀏覽器開 http://127.0.0.1:8080
```

- 每連線一個獨立 `hackemu::Vm`；組譯吃 `hackasm::assemble_err`（錯誤帶原始行號）。
- 與 egui / headless 共用同一顆 `hackemu` / `hackasm` lib（零模擬邏輯分支）。
- WS 協定：`assemble` / `load` / `simulate` / `step` / `reset` / `setKey` /
  `ramDump`（細節見 `_doc/v0.8.md`）。
- **v0.9 增 `hdl.html`**：批次 HDL 模擬頁（`index.html` header 有導流連結）。選章節
  晶片（01–05）或貼上自訂 `.hdl`/`.tst`/`.cmp` → 伺服器跑**真 hdl2rs 管線**
  （codegen + cargo build + 子程序執行 `.tst`）→ 秀 PASS/FAIL 橫幅與 `.out` 表格。
  WS 協定：`hdl-list` / `hdl-source` / `hdl-run`（細節見 `_doc/v0.9.md`）。
- **v1.0 增 `jack.html`**：Jack 全鏈路編譯頁（`index.html`/`hdl.html` header 有導流）。
  選內建教材程式（`../11/jack`，含 OS）／**無 OS 案例（`../11/jackNoOs`，自帶 Sys）**／
  虛擬 e2e `chain`，或貼上自訂多檔 Jack（可併裁剪版 OS）
  → 伺服器把既有 CLI 當子程序串管線（`jack2vm → vm2asm → hackasm → hackemu --headless`）
  → 前端以階段側欄展開各階段產物（`.vm`／`.asm`／`.hack`／SIM 摘要＋軌跡）。
  WS 協定：`jack-list` / `jack-source` / `jack-run`（細節見 `_doc/v1.0.md`）。

## 資料流（hdl2rs 核心流程）

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

`hackhdl`（解析/詳述）與 `hackrt`（`.tst` 執行/`.cmp` 格式化）是純 library，
沒有 CLI，由 `hdl2rs` 產出的模擬程式呼叫。

## 文件導覽

- **快速入門**：環境建置與各章工具速查 → `_doc/getting_started.md`
- **版本規劃（roadmap）**：v0.1 → v1.0 對照表與每版驗收 → `_doc/plan.md`
- **版本紀錄**：`_doc/v0.1.md` … `_doc/v1.0.md`（每版實作內容、驗證、踩到的坑）

各子專案完整用法與 API 見其目錄下的 `README.md`。

## 驗證 / 回歸

```bash
bash verify.sh   # 嚴格版（set -e）：任何一步失敗即中止
bash test.sh     # 容錯版：逐步執行、失敗也繼續，最後印 gen/ 內容
```

`verify.sh` 跑什麼（全綠）：

1. workspace 全部單元測試；
2. ch01–03 全部 `.tst`（hdl2rs → Computer.hdl 模擬）；
3. ch04 `Mult` / `Fill`（跑在整台 Computer 上）；
4. ch05 CPU 內部/外部 + `ComputerAdd/Max/Rect`；
5. **全鏈路 e2e**：`Main.jack+Sys.jack → chain.hack → Computer.hdl`（RAM[16]=5）；
6. **hackemu headless 交叉**：`chain.bin → RAM[16] static: 5`（與 hdl2rs 一致）；
7. v0.7：ch12 裁剪版 OS headless（Math/String/Screen/Memory 四支模組測試）；
8. v0.8：`hackserve` WS 回歸（官方語料組譯＋執行＋錯誤行號＋KBD）；
9. v0.9：`hackserve` HDL WS 回歸（`hdl-list`／`02/ALU` 直接執行／自訂貼上含 cmp／
   壞程式回 `ok:false`／`ComputerAdd` 含 `ROM32K load`）。

> **byte 相容 oracle**：與 C 版（`08/vm2asm.c`、`11/c/jack2vm.c`）逐位元比較時，
> 用 **plain `gcc -O2`** 編譯 oracle，**不要**加 `-fsanitize=address`（macOS
> 子程序會 crash）。

## 設計重點

- **多驅動 wire**：Nand2Tetris 常見「子輸出分切」寫法（如 `ALU` 的
  `out=o2` / `out[0..7]=outLow` / `out[15]=ng`），elab 檢查目的位元範圍互不重疊，
  允許「不相交的切分寫入」。
- **OUT 全覆蓋**：晶片的 `OUT` pin 必須被 inputs 或子晶片輸出完全涵蓋，否則當作
  bug 回報（避免 `0u16` 預設值悄悄成為答案）。
- **拓撲排序**：wire 的驅動者→讀取者形成 DAG，先算線路再合併到 `OUT`；偵測組合
  回圈（feedback）直接報錯。
- **`.cmp` 格式化**：與官方硬體模擬器逐位元一致——`Bin` 右對齊零填滿、`Dec` 有號
  右對齊、`%S` 時間欄位左對齊、constant/undefined 以 `*` 表列。
- **內建晶片**：`Nand`（真理表）與 `Dff`（`tick`/`tock` 兩階段語意）。
- **byte 相容**：`vm2asm` / `jack2vm` 與課程 C 版輸出逐位元一致，C 版可直接當 oracle。
- **介面共用**：egui GUI、headless CLI、網頁版共用同一顆 `hackemu` / `hackasm` lib，
  零模擬邏輯分支。

## 里程碑 / 待辦

各版進度與實作記錄見 `_doc/v0.x.md`（繁體中文）。目前：

- [x] M1：ch01+ch02 全部組合電路測試 PASS（21/21）。
- [x] M2：ch03 循序電路——`tick`/`tock` 語意、`Dff` 真實行為、`Bit`/`Register`/`RAM`。
- [x] M3：ch05 整台電腦——`ROM32K load`、內部 `PinRef[]` 探測、內建 `ARegister`/`DRegister`。
- [x] M4：ch04（Mult、Fill 跑在 Computer.hdl 上）。
- [x] M5：Jack → VM → ASM → HACK 全鏈路 e2e（`jack2vm`/`vm2asm` 逐位元相容 C 版）。
- [x] M6：`hackemu` 虛擬機執行 `.bin`/`.hack`，GUI 顯示 SCREEN + headless 驗證。
- [x] M7（v0.7）：ch12 裁剪版 OS 在 hackemu 上執行（含 Pong 可玩、
  `--keys` 方向鍵自動化）。
- [x] M8（v0.8）：網頁版 `hackserve` ＋ `web/` 薄前端，WS 回歸入 `verify.sh`。
- [x] M9（v0.9）：網頁版 **HDL** 批次模擬（`hdl.html` 選章節/自訂貼上 → 真 hdl2rs
  codegen＋cargo → PASS/FAIL＋`.out` 表格），WS 回歸入 `verify.sh`/`test.sh`。
- [x] M10（v1.0）：網頁版 **Jack 全鏈路**（`jack.html`：`.jack → .vm → .asm → .hack →`
  hackemu 執行，各階段產物展開）；只動網頁版（hackserve＋web），不進既有回歸。
- [ ] M11（選做）：按內容 hash 快取 hdl2rs 的產出 crate（重複晶片免重編）。
- [ ] M12（選做）：`hackserve` 日本語料進 `verify.sh`（v0.9/v1.0 網頁功能自動化）。