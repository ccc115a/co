# AGENTS.md

This is the repository for 金門大學 資訊工程系 course *計算機結構* (Computer Architecture, teacher 陳鍾誠, semester 115). It is a Nand2Tetris teaching repo: exercises by chapter plus working reference implementations.

## Language convention

All prose — READMEs, chapter handouts, `.md` companions — is written in **Traditional Chinese (繁體中文)**. Write new docs the same way. Code comments are optional/rare; many source files have an AI-generated `.md` companion (e.g. `asm.c` + `asm.c.md`) explaining the code — keep them in sync if you change the code.

## Layout

Chapter dirs `nand2tetris/NN/`, 00–12 plus `Cpu2stage/`. Subdirs `_basic/`, `_bak/` hold old drafts; each chapter's top-level files are canonical.

- `00–05`: hardware `.hdl` exercises. `04` is HACK assembly (deliverables in `04/mult/`, `04/fill/`). `06` assembler is C (`asm.cpp`/`vm.c`/`dasm.c`) plus a `py/` Python variant. `07`/`08` both come from `vm2asm.c`.
- `09`: Jack programs (`Square/`). `10`: Jack programs (`ArrayTest/`, `Square/`) + `_PyJackAnalyzer/` (Python). These are course materials, not compiler experiments.
- `11`: Jack compiler with **two independent implementations**: `py/` (Python) and `c/` (C). Confusing them is the #1 mistake. 語料本體：`jack/`（教材程式，需 OS）與 `jackNoOs/`（自帶 `Sys.jack` 的無 OS 案例）。
- `12`: the OS, written in Jack.
- `verilog/`: Verilog implementations (`hackcpu/`, `mcu0/`), simulated with Icarus Verilog (`iverilog` + `vvp`, at `/opt/homebrew/bin`).
- `_more/`: reference material — `book/`, `wiki/`, `pdf/`.

There are **three separate toolchains** for the same Nand2Tetris pipeline; don't conflate them:
- `nand2tetris/_web_eda/` — **hackjs（32-bit，主線；RV32S 用）**，JavaScript 工具鏈（`cli/hdl2js.js`, `hackasm.js`, `vm2asm.js`, `jack2vm.js`, `hackemu.js`；`lib/` 純 ES module；`_doc/v0.1.md … v1.2.md`）。`dist/` 是**已部署**的網頁工具（`index.html` asm Emulator、`hdl.html`、`jack.html`，GitHub Pages 發布，`!dist/` 被收進 git）。
- `nand2tetris/_web_eda16/` — **hackjs（16-bit 原版）**，同一套工具鏈、寬度鎖 16-bit，`dist/` 同樣發布。與 `_web_eda/` 的差別只在 5 個 lib（`hdl/codegen.js`、`hdl/elab.js`、`rt/fmt.js`、`rt/model.js`、`rt/tst.js`）；其餘檔逐位元相同。
- `nand2tetris/_rust_eda/` — **hackeda**，把整條工具鏈用 Rust 重做一遍。Workspace 8 crate：`hackhdl`、`hackrt`、**`hdl2rs`（主 CLI：HDL→Rust 模擬程式）**、`hackasm`、`vm2asm`、`jack2vm`、`hackemu`、`hackserve` ＋ `web/` 薄前端。實作紀錄 `_doc/v0.1.md … v1.0.md`。Jack 語料對照表在 `hackserve/src/jack.rs` 的 `JACK_PROGRAMS`/`JACK_NOOS_PROGRAMS`/`VIRTUAL_PROGRAMS`。
- 章節 `11/c`、`11/py` 是**課程作業**的 Jack 編譯器（C/Python），與上面兩套引擎無關。

Static course books: `nand2tetris/_md_book/` — 教科書電子書（`X.Y.md` 原地渲染為 `X.Y.html`，由 `build.py` 產生、`.html` commit 進 git）；`nand2tetris/_html_book/` — 習題書靜態站（`chNN.html`，commit 進 git，repo 內無 build script）。

## Build / verify commands

- Chapter 06: `make` builds `asm`/`vm`/`dasm`; `./asm <Name>` (reads `<Name>.asm`, writes `<Name>.bin`), `./vm <Name>.bin` traces.
- Chapters 07/08: `bash build.sh` → `./vm2asm`; `bash all2asm.sh` for all cases, single via `./vm2asm.sh <BaseName>`. **Arg order**: `vm2asm <out>.asm <in>.vm`.
- Chapter 11 C: `bash build.sh` (or `gcc -Wall -Wextra -g -fsanitize=address,undefined`), `bash all2vm.sh`. `jack2vm`/`all2vm.sh` take a **directory** of Jack sources (`../jack/Seven`), not a file. Python: `bash pyrun.sh` or `python py/Compiler.py jack/Seven`.
- `verilog/`: per module `iverilog -o <Base> <Base>_test.v && vvp <Base>` (`<Base>_test.v` are testbenches, e.g. `gate_test.v`).
- `_web_eda/`（32-bit 主線，cwd 在 `nand2tetris/_web_eda`）:
  - `npm test`（＝`node --test`，逐模組單測 97/97）；`bash verify.sh` 全回歸 v0.1–v1.0（node --test ＋ `cli/hdl2js.js --dir ../01..05` 全部 `.tst` ＋ Jack 全鏈路 ＋ browser smoke）；`bash test.sh` 容錯版。
  - **重建 commit 的 `dist/`**：`node tools/gen_corpus.js && node tools/embed.js`。`npm run build` 是壞的（`tools/build.js` 不存在）。改 `lib/`/`cli/` 後改網頁，要重建並 commit `dist/`。
  - `Cpu2stage`（兩級管線 CPU 作業）：`bash cpu2stage.sh`（hdl2js 跑 ch01–04 ＋ `../Cpu2stage`）。`Cpu2stage.hdl/.tst` 目前未 commit。
- `_web_eda16/`（16-bit 原版，cwd 在 `nand2tetris/_web_eda16`）：命令與 `_web_eda/` 相同（`npm test`／`bash verify.sh`／`node tools/gen_corpus.js && node tools/embed.js` 重建 `dist/`）。課程 16-bit 專案（`Riscv32i16/`）只走這裡，勿指到 `_web_eda`。
- ebook: 從 repo 根目錄 `bash static-site-builder.sh`（用 `~/.venv/bin/python`，需 `markdown_it`；`build.py` 會在習題 code block 後插 `[習題模擬]` 連結到 `_web_eda/dist/`；該路徑現為 32-bit 引擎，向後相容 16-bit 語料）。
- `_rust_eda/`（cwd 在 `nand2tetris/_rust_eda`）:
  - `cargo test -q` — workspace 單元測；`bash verify.sh` — 嚴格版（set -e）v0.1–v0.8 區段＋v0.9 區段另起 hackserve（port 8086）跑 WS HDL 測；`bash test.sh` — 容錯版。
  - `target/{debug,release}/hdl2rs` — `--dir <ch>`（必須、可重複；01/02/03[a/b]/05）、`--test <檔>.tst`、`--out gen`、`--release`、`--keep`。產出 `gen/<Top>_sim/`，乘載 `cargo build` 子程序。`cargo run -q -p hdl2rs -- …` 也可。
  - 網頁：`cargo build --release -p hackserve && ./target/release/hackserve [--port 8080]` → `/`（asm Emulator）、`/hdl.html`、`/jack.html`；WS 由 `hackserve` spawn 各引擎二元檔實現，**不要為網頁改引擎/CLI 本體**。
  - v1.0 驗證**不進 `verify.sh`/`test.sh`**：只在 `cargo test -q -p hackserve`（含 `jack.rs` 單元測）＋ WS 冒煙測。v0.9 章節語料＝`../01 ../02 ../03(ab) ../05`（04 無 `.hdl` 測資）；`.hdl/.cmp` 留 repo 唯讀，執行時只複製 `.tst`＋相關檔到暫存目錄。

## Gotchas

- Generated artifacts are committed to git — `*.bin` (ch06), `sum.hack0`, `.vvp` (verilog), even `.DS_Store`; root `.gitignore` is a stale generic Cargo template and covers none of these. Don't add new build outputs to commits (`_rust_eda/gen/`, `target/`, `_web_eda/gen/…`, `_web_eda16/gen/…`, 臨時 `.out`)。**例外：`_web_eda/dist/`、`_web_eda16/dist/` 收 git**（發布的網頁，靠各自 `.gitignore` 的 `!dist/` 解除根 `dist/` 忽略）——網頁相關改動要重建＋commit 它。
- Chapter READMEs (e.g. `01/README.md`) are the **handouts/exercises**, not docs describing a codebase. Don't delete or refactor them as if stale docs.
- Binary CLI tools (`asm`, `vm`, `vm2asm`, `jack2vm`, `_rust_eda/target/…/hdl2rs`, `hackserve`) are build artifacts, not tracked; always `build.sh`/`make`/`cargo build` first.
- 命名地雷：`_rust_eda/`＝「hackeda」，`hdl2rs` 是其主 CLI 子專案名（不是 HDL 檔、也不是移植名）；`_web_eda/`＝「hackjs（32-bit）」，`_web_eda16/`＝「hackjs（16-bit 原版）」——**18/32-bit 別搞混**。章節 11 的 `11/c` 與 `11/py` 是**另一套** Jack 實作，跟 `_rust_eda/jack2vm`、`_web_eda/cli/jack2vm.js` 無關。
- git: 一般性改動走正常 commit、不要改寫歷史（本 repo 曾有 `git checkout`/`git reset` 誤砍搬移中檔案的紀錄）。