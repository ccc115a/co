# v3.x 重構規劃：雙路徑架構整理（HackCPU／RISCV）

> 性質：規劃文件。範圍僅限 `_web_eda_riscv/` 目錄內；
> `riscv/_web_tools`（唯讀依賴，見 AGENTS.md）、`../01`～`../12` 語料、
> `Riscv32i/*.hdl` 本體都不碰。所有重構以「輸出位元一致」為驗收前提。
>
> 版次對應（v3.x 起執行）：**v3.0＝P0＋P1＋P4**（低風險先行）、
> **v3.1＝P2＋P3**（動頁面邏輯）、**v3.2＝P5**（CLI 對齊）；
> P6（測試去重）、P7（Riscv32i 定位）暫緩，待 v3.2 後再議。

## 1. 現況：其實是三條路徑，一個共用前端

```
Jack → VM（lib/jack/jack2vm.js，共用前端）
  ├─ 路徑 H（HackCPU）：VM → lib/asm/vm2asm.js → lib/asm/hackasm.js → lib/vm/hackemu.js
  ├─ 路徑 R（RISCV）：VM → lib/riscv/vm2riscv.js →（外部 rvasm/rvemu，唯讀）
  └─ 路徑 C（HDL CPU）：Riscv32i/*.hdl → 本目錄 hdl2js 引擎（與 H 共用 HDL 棧）
```

前端頁面：`dist/jack.html`（H／R 切換）→ `dist/index.html`（H 模擬器）
／`dist/rvemu.html`（R 模擬器）；`dist/hdl.html`（HDL 批次，含 `06 RV32I` 章節）。
命令列：`cli/vm2asm.js`＋`cli/hackasm.js`＋`cli/hackemu.js`（H）對
`cli/vm2riscv.js`＋`cli/riscv_run.js`（R）；測試：`test/test.js`（H 為主）
對 `test/test_vm2riscv.js`（R）；煙霧：`tools/browser_smoke.js`（HDL）
對 `tools/browser_jack_smoke.js`（Jack）。

## 2. 發現的問題

### R1：兩份 VM 翻譯器骨架重複（lib 層，最大的一塊）

`lib/asm/vm2asm.js`（219 行）與 `lib/riscv/vm2riscv.js`（447 行）函式一一對應：
`trim`／`removeComment`／`label_count`／`return_count`／`current_file`／
`scope`／`cur_func`／`processCommand` 分發／`writeArithmetic`／`writePush`／
`writePop`／`writeLabel`／`writeGoto`／`writeIfGoto`／`writeFunction`／
`writeCall`／`writeReturn`／`writeBootstrap`／`translate`／`translateFile`／
`labelName`。連「同一個檔名取 basename」都有兩套名字（`basename` 對 `sanFile`）。
今天改 VM 語法檢查（例如 `a2` 整數判定）要改兩個地方，已經是兩份真相來源。

### R2：`dist/jack.js` 的後端分支是 if/else 硬分叉

`doRun`（`dist/jack.js:207`）內整段 `if (backend === 'riscv') {...} else {...}`：
各自做 userVm→全量→組譯→執行→`lastRun`→狀態列。旁邊又有平行陣列
`STAGES_HACK`／`KEYS_HACK` 對 `STAGES_RV`／`KEYS_RV`（58–61 行），
以及 `runSim` 對 `runRv` 兩份報表產生器（173–205 行）。
`BRIDGES` 表（348–359 行）已證明資料驅動寫得下，但只用在送模擬器一處。

### R3：12 支範例清單寫死四份

同一份 `{name, dir, needsOS} × 12` 出現在 `dist/jack.js:44`、
`dist/rvemu.js:50`、`tools/browser_jack_smoke.js:24`、
`test/test_vm2riscv.js:439`。加一支範例要改四檔，目前四份仍一致，
但沒有任何機制保證一致。

### R4：兩個模擬器頁是複製後分叉

`dist/app.js`（281 行）與 `dist/rvemu.js`（440 行）同架構
（`tick`／`repaint`／`renderListing`＋`markPc`／速度映射／`held` 按鍵陣列／
`readMem`／橋接握手／hash 深連結），但修 bug 只修一邊：
`curIdx` 快取、`逐 word repaint`、`freshEmu`、`跑滿續跑`、`readBudget` 只在
rvemu 有；app 仍是每幀全表 `innerHTML` 重建。下次修要記得修兩份，
目前只能靠記憶。

### R5：命名三套說法

後端值 `hackcpu`／`riscv`，UI 寫 `HackCPU`／`RISCV`／`HACK 模擬器`／
`RISCV 模擬器`，檔名是 `index.html` 對 `rvemu.html`，
全域是 `HackVm2Asm` 對 `HackVm2Rv`，RV32 又叫 `Rv32`（`Riscv32i/`）。
常數也各寫各的：`MIRROR_BASE`（lib）對 `MIRROR`（rvemu.js:14），
`RV_STATIC_BASE`（jack.js:31，重複 lib 的 `STATIC_BASE`，靠註解人工同步），
`SCREEN_WORD0` 對 `SCREEN_BASE`，`KBD_MIRROR` 對 `KBD_ADDR`。

### R6：跑多久，預設五套

`jack.js` RV 跑 200 萬步、Hack 跑 200 萬步（267 行），
`rvemu.js` 預設無限，`riscv_run.js` 預設 20 萬（`DEFAULT_MAX`），
`hackemu.js` 預設 10 萬（40 行）。各有理由，但沒有一處講清楚彼此關係，
新人會以為是同一個開關。

### R7：CLI 介面與輸出格式各說各話

引數順序：`vm2asm`／`vm2riscv` 是 `<out> <in…>`，
`hackasm` 是 `<Name>`，`hackemu` 是 `--headless <file>`，
`riscv_run` 是 `<in.s>`，`jack2vm` 是 `<檔|目錄>`。
報表格式：`RAM[16] static: 5`（hackemu:112）對 `MEM[0x..]: [...]`（riscv_run）；
exit code 有 1 也有 2；用法字串中英混雜（`用法：`＋英文 usage 並存）。

### R8：測試與煙霧工具有重疊

`test/test.js`（815 行，H＋bundle）與 `test/test_vm2riscv.js`（478 行，R＋bundle）
都 eval `dist/embed.js` 做 bundle 回歸，各自為政；
`tools/browser_smoke.js` 與 `tools/browser_jack_smoke.js` 是兩套 harness，
後者內嵌第四份 PROGRAMS（見 R3）。

### R9：文件已經不同步（不碰程式也能修）

`lib/riscv/vm2riscv.js.md` 有兩個 `## 記憶體與暫存器約定`，
第二節的位址（STACK 0x10000／temp 0x7000／static 0x8000）與程式碼
（0x1C000／0x10000／0x11000）矛盾。以程式碼為準，第二節應整段刪除。

### R10：Riscv32i 是第三條路，卻沒有 backend 概念

`Riscv32i/`（HDL 單週期 RV32I）只掛在 `hdl.html` 章節 06 與 verify v2.4／v2.5，
`jack.html` 的後端切換只有 H／R 兩種。現在沒問題，但「雙路徑」心智模型
已經不完整，文件（README／AGENTS／_book/00）應正名為「三執行路徑、
一個共用前端」，否則後人會把 Riscv32i 當附屬品忽略。

## 3. 重構方案（P0–P7，皆可獨立驗收）

- **P0（只改文件）**：刪 `vm2riscv.js.md` 第二個約定節；README／AGENTS／
  `_book/00` 補「三路徑＋共用前端」圖；`_book/` 補本規劃的執行紀錄。
  驗收：無程式變動。
- **P1（lib 層，投報率最高）**：新增 `lib/vm/vmparse.js`（VM 行解析＋驗證：
  `trim`／`removeComment`／行切分／`a1`／`a2` 整數檢查／錯誤訊息），
  `vm2asm` 與 `vm2riscv` 改吃它（函式名、輸出位元不變）。
  驗收：`test/test.js`＋`test/test_vm2riscv.js` 全過，且全鏈路 `.asm`／`.s`
  產物與重構前位元一致（用 `verify.sh` 現有 oracle 覆蓋）。
- **P2（jack.js）**：把 `BRIDGES` 的做法擴大為後端描述表
  （stages／keys／翻譯／組譯／執行／報表／送模擬器目標），`doRun` 收斂為
  單一管線；`STAGES_*`／`KEYS_*`／`runSim`／`runRv` 併入表內。
  驗收：頁面行為不變（12 支範例兩後端輸出與重構前一致，可用
  `browser_jack_smoke` 覆蓋）。
- **P3（模擬器頁）**：抽 `app.js`／`rvemu.js` 共通骨架為
  `dist/emu-common.js`（classic script：tick 迴圈、按鍵 `held` 陣列、
  hash 深連結、橋接握手、`?v=` 跟進），兩頁只留引擎相關
  （repaint／listing／記憶體面板）；並把 rvemu 已有的修復
 （`curIdx`、`freshEmu` 語義、預算續跑）以同機制帶到 app 頁。
  驗收：兩頁手動＋`browser_smoke` 通過；`verify.sh` 相關斷言更新。
- **P4（常數單一來源）**：`Vm2Rv` 已匯出位址常數；
  `jack.js` 的 `RV_STATIC_BASE`、`rvemu.js` 的 `MIRROR`／`SCREEN_WORD0`／
  `KBD_MIRROR` 改從 bundle 取值（bundle 已載入，無新增依賴）；
  命名以 lib 為準，頁面只留顯示別名。驗收：同 P2。
- **P5（CLI 對齊）**：統一用法字串語言與 exit code（1＝用法錯／執行錯，
  沿用多數）；`hackemu` 與 `riscv_run` 的 `--max`／`--dump` 語意、
  報表前綴對齊（`RAM[`／`MEM[` 二選一並寫進 AGENTS）；
  五套步數預設集中到一份對照表（註明各場景理由：互動無限、CLI 速驗、
  全量 OS 需百萬級）。只改介面文字與預設，不改引擎。
  驗收：`verify.sh`／`test.sh` 全過（含 grep 斷言同步更新）。
- **P6（測試去重）**：12 支清單收斂到單一 manifest
  （`tools/programs.js` 或由 `gen_corpus.js` 衍生，Node 與瀏覽器皆可讀），
  `dist/*.js`、`tools/*smoke.js`、`test/test_vm2riscv.js` 改讀它；
  bundle 回歸收斂到單一 describe（H 與 R 各留引擎用例）。
  驗收：兩套 `node --test` 全過。
- **P7（Riscv32i 定位）**：文件正名（P0 已含）＋ `hdl.js` 章節維持現狀；
  是否把 Riscv32i 接成 jack 第三後端列為遠期選項（需 `.s`→HDL 橋，不在本輪）。

## 4. 不做什麼

- 不改 `riscv/_web_tools`（唯讀上游）。
- 不改 `../01`～`../12` 語料與 `Riscv32i/*.hdl` 本體。
- 不改任何引擎語意與輸出位元；重構 PR 必須附重構前後產物 diff 為空的證據。
- 不動 `dist/*.html` 版面結構（只動 `?v=` 與 script 引用）。

## 5. 建議順序與風險

v3.0（P0 → P1 → P4）低風險先行；v3.1（P2 → P3）動頁面邏輯，需人工點一遍 Pong；
v3.2（P5）動 CLI 文字，需同步 `verify.sh`／`test.sh`／`_book/41`；
P6、P7 暫緩，待 v3.2 後再議。
全程每步以 `bash verify.sh`（嚴格）為門，另跑 `bash test.sh`（容錯）對照。
