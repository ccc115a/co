# _html 工具鏈版本規劃（hackjs，JavaScript 版）

> 目標：模仿 `_eda/`（hackeda，Rust），把 Nand2Tetris 的 `.hdl` / `.asm` / `.vm` / `.jack`
> 整條工具鏈用 **JavaScript** 重做一遍。主 CLI 叫 `hdl2js`（HDL → JS 模擬器，對應 `hdl2rs`）。
> 與 Rust 版最大的差別，也是本版的第一設計原則：
>
> **出貨版完全不需要 server、不需要 Node.js**——`dist/*.html` 是單檔自足 app，
> 語料與引擎全部內嵌，`file://` 雙擊即開；Node.js 只存在於**開發期**（單元測試、CLI、
> 語料內嵌建置、回歸），並以自動測試為硬性驗收。
>
> 每一行使用者能貼進來的程式（`.hdl` / `.tst` / `.cmp` / `.asm` / `.vm` / `.jack`）
> 都能在瀏覽器裡直接執行對應管線，完成「都能寫、都能驗證、都能執行」的閉環。

## 與 hackeda（Rust 版）的關係與設計取捨

Rust 版走「HDL 編譯成原生程式（cargo build）＋伺服器＋WS 協定」；本版走純前端路線。

| | `_eda/`（hackeda） | `_html/`（hackjs） |
|---|---|---|
| 語言 / 執行環境 | Rust，編譯成二進位 | JavaScript（ES Modules），瀏覽器原生直跑 |
| HDL 模擬 | `.hdl → codegen → cargo build` 產獨立 crate | `.hdl → codegen → .js` 模組，`import()` 即跑 |
| 網頁版後端 | `hackserve`（axum + WS，spawn CLI 子程序） | **無**——引擎直接在瀏覽器跑，零 server |
| 對外互動 | WS 協定（`hdl-run` / `jack-run` …） | 頁內直接呼叫同一顆 `lib/` API（同名對應） |
| 語料取得 | 伺服器讀 repo 內章節檔案 | 開發期 `tools/embed.js` 內嵌成 `web/_corpus.js`＋**自訂貼上** |
| 出貨方式 | 需起 server + 瀏覽器 | `dist/*.html` 單檔自足，`file://` 雙擊即開 |
| 測試 | `cargo test`（30 個）＋ `verify.sh` | `node --test`（Node 內建測試器，零依賴）＋ `verify.sh` |

核心差別一句話：Rust 版「要起 server 才能上網」，本版「打包完就是一個會動的網頁」。

## 開發時 vs 出貨時（環境分流）

```
開發時（需要 Node.js ≥ 20，npm 零依賴、零 build step）：
    lib/        ES Modules（嚴格 ESM，Node 測試直接用）
    cli/        hdl2js / hackasm / vm2asm / jack2vm / hackemu 的命令列版（CI 用）
    test/       node --test 單元測試（node:test，免裝套件）
    tools/      embed.js（掃描章節 → 產生 web/_corpus.js）
                build.js（綴合 lib + 語料 → dist/*.html 單檔）
    verify.sh / test.sh    全回歸（含 byte-compat oracle、dist 冒煙）

出貨時（不需要任何東西）：
    dist/*.html     單檔自足：引擎 + 語料全內嵌、<script> classic（非 module），
                    file:// 雙擊即開、無 CORS、無 server
```

> 為何 build 成 classic script？瀏覽器在 `file://` 下載入 ES `<script type="module">`
> 會被 CORS 擋掉。`tools/build.js` 把 `lib/` 依依賴序綴合成 IIFE（掛全域
> `window.HackJS`），網頁再加 `_corpus.js`（語料字串常數）→ 一份 HTML 搞定。

## 目錄架構

```
_html/
├─ package.json            # scripts: test / build / dev；dependencies: 無
├─ README.md               # 對應 _eda/README.md
├─ _doc/
│  ├─ plan.md              # 本檔（roadmap）
│  ├─ getting_started.md
│  └─ v0.1.md … v1.0.md    # 版本紀錄
├─ lib/                    # 共享 ESM（瀏覽器 + Node 雙用；瀏覽器由 build.js 綴合）
│  ├─ hdl/
│  │  ├─ ast.js            # AST 型別                     ＝ hackhdl::ast
│  │  ├─ parser.js         # .hdl → AST                   ＝ hackhdl::parser
│  │  ├─ elab.js           # 選路/拓撲排序/OUT 覆蓋/回圈偵測 ＝ hackhdl::elab
│  │  ├─ builtin.js        # Nand/Dff/RegChip/ROM32K/Screen/Keyboard
│  │  ├─ codegen.js        # ElabChip → JS 模擬函式         ＝ hdl2rs::gen
│  │  └─ model.js          # 執行期模型（晶片實例、tick/tock）
│  ├─ rt/
│  │  ├─ tst.js            # .tst 解析器                  ＝ hackrt::tst
│  │  ├─ fmt.js            # .cmp 格式化（%B %D %X %S …）  ＝ hackrt::fmt
│  │  └─ runner.js         # 腳本執行器（set/eval/tick/while…）＝ hackrt::run
│  ├─ asm/
│  │  ├─ hackasm.js        # HACK 組譯器（兩 pass）         ＝ hackasm
│  │  └─ vm2asm.js         # VM → HACK 組語（多檔 bootstrap）＝ vm2asm
│  ├─ jack/
│  │  ├─ lexer.js          # Jack tokenizer
│  │  ├─ parser.js         # Jack AST（class/subroutine/statement/expr，由左而右）
│  │  ├─ symbol.js         # symbol table（class/subroutine scope）
│  │  └─ vmgen.js          # Jack → VM                     ＝ jack2vm
│  └─ vm/
│     └─ hackemu.js        # HACK 虛擬機核心（Uint16Array RAM/SCREEN/KBD）＝ hackemu::lib
├─ cli/                    # Node CLI（對應 Rust 各 binary，CI/回歸用）
│  ├─ hdl2js.js            # --dir/--test/--top/--out/--keep/--release
│  ├─ hackasm.js / vm2asm.js / jack2vm.js
│  └─ hackemu.js           # headless（--max/--keys/--trace/--dump）
├─ tools/
│  ├─ embed.js             # 掃描 01–05/06/11/12 → web/_corpus.js（字串內嵌）
│  └─ build.js             # 綴合 lib + _corpus → dist/*.html 單檔
├─ web/                    # 瀏覽器前端原稿（薄：只做 UI/IO，引擎全在 lib/）
│  ├─ index.html           # asm Emulator＋組語＋.bin/.hack 貼上（＝v0.8）
│  ├─ hdl.html             # HDL 批次模擬＋.hdl/.tst/.cmp 貼上（＝v0.9）
│  ├─ jack.html            # Jack 全鏈路＋.jack/.vm/.asm 貼上（＝v1.0）
│  ├─ app.js / hdl.js / jack.js
│  └─ style.css
├─ dist/                   # build.js 產出（不 commit）：index.html/hdl.html/jack.html
├─ test/                   # node --test 單元測試（對應 cargo test）
├─ verify.sh / test.sh     # 全回歸
└─ gen/                    # node 產出（不 commit）
```

## 資料流（hdl2js 核心，對應 Rust 版）

```
<top>.hdl ──lib/hdl/parser──▶ AST ──lib/hdl/elab──▶ ElabChip 圖
                                                        │
lib/rt/tst.js ◀──load─────────────┐                     ▼
                                  │   lib/hdl/codegen.js（逐 chip 展開 wire）
                                  ▼
                     gen/<Top>_sim.js ──import──▶ <Top>_sim 執行期類別
                                  ▲
      lib/rt/runner.js ◀──────────┘  ◀── CLI: hdl2js <script>.tst
```

- **瀏覽器**：`build.js` 把 codegen 產生的模組與語料一起內嵌，`hdl.html` 直接在頁內
  `eval`/`new Function` 載入使用者貼上的 `.hdl`＋`.tst`。
- **CLI**：`node cli/hdl2js.js --dir ../01 … --out gen`，行為與 `hdl2rs` 一致。

全鏈路資料流（v0.5 起）：

```
.jack ─▶ jack2vm ─▶ .vm ─▶ vm2asm ─▶ .asm ─▶ hackasm ─▶ .hack/.bin ─▶ hackemu ─▶ RAM/SCREEN/KBD
```

## 版本對照總表（roadmap）

| 版本 | 對應章節 | 主題 | 驗收 |
|------|----------|------|------|
| v0.1 | 01+02 | 組合電路：hdl parser/elab + rt runner + codegen（emit JS）＋ node --test 起步 | 21/21 |
| v0.2 | 03 | 循序電路：tick/tock、Dff、Bit/Register/RAM/PC | 29/29 |
| v0.3 | 05 | 整台電腦：CPU 內建暫存器、ROM32K load、內部 PinRef 探測 | CPU+Computer 8/8 ✅ |
| v0.4 | 04 | HACK 平台：Mult-hw / Fill-hw 跑在 Computer.hdl | 2/2 ✅ |
| v0.5 | 06+07+08+11 | 工具鏈誕生：hackasm / vm2asm / jack2vm（byte 相容 C 版）＋ 全鏈路 e2e | 40/40 ✅ |
| v0.6 | 05→06 之後 | hackemu 虛擬機核心（headless CLI + 瀏覽器 canvas 共丮一顆 lib） | 交叉驗證 ✅ |
| v0.7 | 12 | ch12 裁剪版 OS 在 hackemu 執行（show / Pong --keys / 逐模組單測） | 全與 Rust 相同 ✅ |
| v0.8 | 網頁 | `tools/embed.js`＋`build.js` 誕生；`web/index.html` asm Emulator（單檔離線） | dist 冒煙 ✅ |
| v0.9 | 網頁 | `web/hdl.html` 批次 HDL 模擬＋自訂貼上（含 .tst/.cmp） | dist 冒煙 ✅ |
| v1.0 | 網頁 | `web/jack.html` **全語言自訂貼上**（.jack/.vm/.asm）＋三頁打包完成 | dist 冒煙＋鏈路綠 ✅ |

> 想對照 Rust 版：Rust 的 v0.8–v1.0 靠 `hackserve`（伺服器），本版同欄位全部
> 在瀏覽器內完成，且「自訂貼上」範圍從 Rust 版的 `.hdl`/`.jack` 擴大到
> `.hdl/.tst/.cmp/.asm/.vm/.jack` 全部中間語言。

---

## v0.1 — 組合電路（ch01 + ch02）

- 範圍：第一章邏輯閘 / 第二章 ALU；驗收 `node --test` 機制先立起來。
- 交付：
  - `lib/hdl/parser.js`：完整 `.hdl` 語法（`CHIP`/`IN`/`OUT`/`PARTS`、`a[16]` bus、
    子晶片連線 single/slice/OfSlash）。
  - `lib/hdl/elab.js`：**多驅動 wire**（位元切片互不重疊即合法，重疊報錯）、
    **OUT 全覆蓋檢查**、**拓撲排序**＋組合回圈偵測；內建 `Nand` 真理表、`Dff`（v0.1 僅出 q）。
  - `lib/rt/tst.js + fmt.js + runner.js`：`.tst` 全指令（load/output-file/compare-to/
    output-list/set/eval/tick/tock/output/echo/clear/while/repeat），`.cmp` 格式化
    與官方逐位元一致（`*` 表 undefined、時間 `%S` 左對齊、Bin 右對齊零填滿）。
  - `lib/hdl/codegen.js`＋`cli/hdl2js.js`：ElabChip 圖 → JS 函式（`setBits/getBits`
    切割組合），產出 `gen/<Top>_sim.js` 供 runner 呼叫。
- 驗收：ch01 15 + ch02 6 = **21/21 PASS**；`node --test` 單元測試（hdl/rt）全綠。

## v0.2 — 循序電路（ch03）

- 交付：
  - `Dff` 真兩階段語意（tick 存 latch、tock 出新值）；`model.js` 加入晶片實例與
    tick/tock 時間推進。
  - `Bit` / `Register` / `RAM8 … RAM16K`（寬度×位址參數化）/ `PC(inc/load/reset)`。
  - `cli/hdl2js.js` 支援 `--dir` **遞迴掃描**（`03/a`、`03/b`）。
- 驗收：ch03 全部 `.tst` **29/29 PASS**。

## v0.3 — 整台電腦（ch05）

- 交付：
  - 內建 `RegChip`（ARegister/DRegister 共用 master/slave `{latch, q}`，probe 讀 latch）。
  - `ROM32K load <name>.hack`（解析文字二進位列）；`Screen` / `Keyboard` 內建型別。
  - 內部 `PinRef[]` 探測（`DRegister[]`、`RAM16K[..]`）；`outM` 於 `writeM==0` 回 undefined。
  - `getOutput` 改用 `PinRef.parse` 路由（Whole→輸出/輸入/`probe_whole`；
    Bit→`probe_indexed`）；`output-list` 格式字大小寫通吃（`%b`/`%d`…）。
  - `ROM32K.load` 改走 `globalThis.HACKJS_FS` hook（Node CLI/測試注入 fs，瀏覽器版改掛語料）。
- 驗收：`CPU.tst`＋`CPU-external.tst`＋六支 `Computer*`（Add/Max/Rect，內外部）**8/8 PASS**
  （`Memory.tst` 需人工按鍵盤，`collectTst` 自動排除，verify.sh 採與 Rust 相同的明確清單）。

## v0.4 — HACK 平台（ch04）

- 交付：`Computer.hdl` runner 能載入 `.hack`，直接執行組語程式。
- 驗收：`../04/mult/Mult-hw.tst`、`../04/fill/Fill-hw.tst` **2/2 PASS**。

## v0.5 — 工具鏈誕生（ch06–08 + ch11）

- 交付：
  - `lib/asm/hackasm.js`＋`cli/hackasm.js`：兩 pass 組譯器（符號表、dest/comp/jump
    對照表），輸出 `.hack` 文字＋`.bin`（u16 LE）。
  - `lib/asm/vm2asm.js`：VM → HACK 組語，多檔自動 bootstrap（`SP=256`+`call Sys.init`）；
    **與 `08/vm2asm.c` byte 相容**。
  - `lib/jack/（lexer/parser/symbol/vmgen）`：Jack 編譯器，
    **與 `11/c/jack2vm.c` byte 相容**；注意 Jack parser **無優先權、由左而右**。
  - 全鏈路 e2e：`Main.jack+Sys.jack → chain.hack` 在 Computer.hdl 上 RAM[16]=5。
- 驗收：`verify.sh` **40/40**（ch01–03 29 + ch04 2 + ch05 8 + chain 1）。

## v0.6 — hackemu 虛擬機

- 交付：
  - `lib/vm/hackemu.js`：CPU 語意與 `CPU.hdl` 一致（M 寫入位址用「更新前」的 A、
    jump 用「更新後」的 A、word bit15=最左畫素）；RAM 32K、`SCREEN=16384..24576`（每列 32 word）、
    `KBD=24576`。
  - `cli/hackemu.js` headless（`--max/--keys/--trace/--dump`）跑 `.hack`/`.bin`。
  - 瀏覽器 canvas 渲染同函式庫（v0.8 才做 UI）。
- 驗收：headless 交叉驗證 `chain.bin → RAM[16]=5`，與 hdl2js 一致。

## v0.7 — ch12 OS 在 hackemu 執行

- 交付：輸出 `.jack`（`12/*.jack`）整包編譯開機；「裁剪版 OS」塞進 32K ROM 上限
  （`@x` 只有 15 位址位元，ROM >32768 words 無法定址）；`Pong` 可玩、
  `--keys` 方向鍵自動化。

## v0.8 — 網頁版 asm Emulator（單檔離線）

- 交付：
  - `tools/embed.js`：掃描 `01–05`（.hdl/.tst/.cmp）、`04/mult|fill`、`06`（.asm）、
    `gen/chain` 等，編成 `web/_corpus.js`（字串常數）。
  - `tools/build.js`：lib 依序綴合 + 語料 → `dist/index.html`（classic script，
    `file://` 雙擊即開）。
  - `web/index.html`：編輯/選內建語料 `.asm` → 組譯 → 即時跑（暫存器、RAM 分頁、
    SCREEN canvas、KBD、PC 高亮、組譯錯誤行號、FPS）；**可直接貼上自訂 `.asm`**。
- 驗收：build 出 `dist/index.html`；`node --test` 對同一顆 lib API 冒煙；檔案可
  直接用 `open file://…` 開啟。

## v0.9 — 網頁版 HDL 批次模擬

- 交付：
  - `web/hdl.html`：選章節晶片（01–05，從 `_corpus.js` 內嵌語料）或
    **貼上自訂 `.hdl`（選配 `.tst`、`.cmp`）** → 頁內跑 parse/elab/codegen/runner
    → PASS/FAIL 橫幅 + `.out` 表格逐列拆解（對應 Rust v0.9 WS 協定的
    `hdl-list`/`hdl-source`/`hdl-run` 三個 API）。
  - 章節語料留 repo 唯讀──瀏覽器本就只讀內嵌副本，不弄髒 git 樹。
  - 瀏覽器化手段（本版實作）：`tools/gen_corpus.js` 把語料打成 `dist/corpus.js`
    （`window.HACKJS_CORPUS`，121 檔）；`dist/hdl-rt.js` 提供 fs/path shim
    （corpus 唯讀＋overlay 記憶體寫入）；`tools/embed.js` 偵測 node fs/path import，
    在 bundle 頂部注入 `const fs = globalThis.HACKJS_FS`。`lib/rt/tst.js` 的
    `KEYWORDS` 改名 `TST_KEYWORDS`（與 jack2vm 併進同一作用域撞名）。
- 驗收：build 出 `dist/hdl.html` 離線可用；冒煙測內建晶片＋貼上含 `.cmp` 的自訂電路。

## v1.0 — 網頁版 Jack 全鏈路＋全語言貼上

- 交付：
  - `web/jack.html`：選內建程式（`../11/jack` 需 OS、`../11/jackNoOs` 自帶 Sys、
    虛擬 `chain`）或貼上 **自訂多檔 `.jack`**；管線 `.jack → .vm → .asm → .hack →`
    hackemu 執行，各階段產物逐段展開（對應 Rust v1.0 `jack-list`/`jack-source`/`jack-run`）。
  - **全語言貼上**（本版重點）：任一頁皆可貼 `.jack` / `.vm` / `.asm` / `.hdl`
    （＋`.tst`/`.cmp` / `.hack`），從該語言所在管線環節起跑——
    `.hdl→模擬`、`.asm→組譯→執行`、`.vm→vm2asm→組譯→執行`、
    `.jack→編譯→…→執行`；多檔以文字分區貼上（`.jack` 支援含裁剪版 OS）。
  - 三頁（index/hdl/jack）header 互導，`dist/` 三檔打包完成。
- 本版實作註記：
  - 全部在瀏覽器完成：`compileJack`（回傳行陣列，接 `translate` 要 `.join('\n')`）
    → `translate([{path,src}])` 多檔 bootstrapping（OS 的 VM 排最前）
    → `assemble` → `Vm.loadHack`。
  - 內建程式語料對照（＝ Rust `hackserve/src/jack.rs` 的
    `JACK_PROGRAMS`/`JACK_NOOS_PROGRAMS`/`VIRTUAL_PROGRAMS`）：需 OS 6 支＋
    noOS 5 支＋虛擬 chain；語料由 `gen_corpus.js` 內嵌（corpus 121→152 檔）。
- 驗收：`dist/*.html` 全離線可用；鏈路 RAM[16]=5 冒煙；自訂貼上回歸測試。

---

## 自動測試與回歸（硬性驗收）

`node --test`（Node ≥ 20 內建測試器，零 npm 依賴）：

```
node --test test/            # 單元測試
```

`verify.sh`（嚴格版 set -e）跑：

1. `node --test test/` 全部單元測試；
2. `node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b` → 29/29；
3. ch04 `Mult-hw`/`Fill-hw`（跑在 Computer.hdl）→ 2/2；
4. ch05 全部 `.tst`（CPU×2 + ComputerAdd/Max/Rect×6）→ 8/8；
5. **e2e chain**：`jack2vm → vm2asm → hackasm → hdl2js chain.tst`（RAM[16]=5）；
6. **hackemu headless 交叉**：`chain.bin → RAM[16] static: 5`（與 hdl2js 一致）；
7. v0.7：ch12 裁剪版 OS headless（Math/String/Screen/Memory 模組標記）；
8. **byte-compat oracle**：JS 版與 C oracle（plain `gcc -O2` 編 `06/asm.cpp`、
   `08/vm2asm.c`、`11/c/jack2vm.c`，**別加 -fsanitize**）逐位元 diff；
   再與 Rust 二進位（`_eda/target/release/{hackasm,vm2asm,jack2vm}`）交叉比對；
9. **dist 冒煙**：`tools/build.js` 產出 `dist/*.html`，檢查（a）語料完整內嵌、
   （b）無殘留 ESM `import`、（c）引擎符號齊備、檔案可被解析；
10. **自訂貼上回歸**：直接呼叫同一顆 `lib/` API（與 `node --test` 共用測試情境），
    驗證「貼上輸入 → 管線各階段」與 CLI 結果一致。

`test.sh`（容錯版 set -x + `|| true`）供開發時逐步檢錯。

> byte 相容 oracle 注意（沿用 Rust 坑）：oracle 用 **plain `gcc -O2`**，不要
> `-fsanitize=address`（macOS 子程序 crash）。

## 執行慣例

- 每版完成：更新 `README.md` 里程碑勾選與 `_doc/vN.N.md` 版本紀錄；
  `gen/`、`dist/` 產出**不入 commit**。
- 驗證：先 `bash verify.sh`（嚴格），再 `bash test.sh`（容錯），兩者全綠才算完成。
- 開發流程：`node cli/…` 可直接跑；網頁開發 `node tools/build.js` 後
  `open dist/index.html` 即可（不需要 server）。
- 文件語言：繁中，與 repo 其他 `.md` 一致。

## 里程碑 / 待辦

- [x] M1：ch01+02 全部組合電路 PASS（21/21）＋ `node --test` 起步。
- [x] M2：ch03 循序電路（tick/tock、Dff、Bit/Register/RAM、PC）29/29。
- [x] M3：ch05 整台電腦（CPU、ROM32K load、內部 probe）8/8。
- [x] M4：ch04 Mult-hw / Fill-hw 跑在 Computer.hdl。
- [x] M5：工具鏈（hackasm/vm2asm/jack2vm byte 相容）＋ e2e chain → 40/40。
- [x] M6：hackemu 虛擬機（headless ＋ 瀏覽器共用核心）。
- [x] M7：ch12 裁剪版 OS 在 hackemu 跑（show / Pong --keys / 逐模組單測）。
- [x] M8：網頁 asm Emulator（`tools/embed.js`＋`dist/index.html` 離線）。
- [x] M9：網頁 HDL 批次模擬（`hdl.html`，內建語料＋自訂貼上含 .tst/.cmp）。
- [x] M10：網頁 Jack 全鏈路（`jack.html`）＋**全語言貼上**閉環，`dist/` 打包完成。
- [ ] M11（選做）：codegen 產出模組依內容 hash 快取（JS import 天然好做）。
- [ ] M12（選做）：瀏覽器離線 KBD 自動化（虛擬鍵盤）、SCREEN 縮放。
- [ ] M13（選做）：把 `dist/` 冒煙收進 `verify.sh` 常態執行。

## 承接自 Rust 版的重點坑（實作時直接避開）

1. `.tst` 的 `//` 註解、`,;{}` 分隔與 `"..."` 字串常數（lexer 先剝註解）。
2. 多驅動 wire：目的位元範圍互不重疊才合法（`Not16`/`ALU` 的 fanout 慣用法）。
3. OUT 全覆蓋檢查，避免 `0` 預設值悄悄變答案。
4. `tick`/`tock`＝Master-Slave 兩階段；probe 讀 **latch**（CPU.cmp 驗證）。
5. `outM` 未定義欄位以 `*` 填滿 `a+b+c` 寬度。
6. HACK `@x` 只有 15 位址位元 → 32K ROM 上限 → 裁剪版 OS。
7. CPU 語意：M 寫入用「更新前」A、jump 用「更新後」A；word bit15=最左畫素。
8. Jack parser 無優先權、由左而右（`a+b*c` ＝ `(a+b)*c`）。
9. `Screen.jack` 官方 `drawPixel` bug 已在 `12/` 語料修正，compiler 仍與 C 版 byte 相容。
10. `file://` 下不能用 ES module → `dist/` 必須是 classic script 拼接。