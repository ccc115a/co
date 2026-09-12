# AGENTS.md

This is the repository for 金門大學 資訊工程系 course *計算機結構* (Computer Architecture, teacher 陳鍾誠, semester 115). It is a Nand2Tetris teaching repo: exercises by chapter plus working reference implementations.

## Language convention

All prose — READMEs, chapter handouts, `.md` companions — is written in **Traditional Chinese (繁體中文)**. Write new docs the same way. Code comments are optional/rare; many source files have an AI-generated `.md` companion (e.g. `asm.c` + `asm.c.md`) explaining the code — keep them in sync if you change the code.

## Layout

- `nand2tetris/NN/` — Nand2Tetris project chapters 00–12. Subdirs `_basic/`, `_bak/` hold old drafts; the top-level files in each chapter dir are canonical.
  - `00–05`: hardware `.hdl` exercises; `04` is HACK assembly (deliverables `Mult.asm`, `Fill.asm`).
  - `06`: assembler + VM simulator (`asm.cpp`/`vm.c`/`dasm.c` in C/C++).
  - `07`: VM→asm translator, stack arithmetic. `08`: same, with functions/control flow. Both share a `vm2asm.c` + `build.sh`.
  - `09`: compiler experiments, one self-contained dir per experiment (`01-anbn`, `05-p0func`, …), each with its own `compiler.py`/`vm.py`.
  - `11`: Jack compiler with **two independent implementations**: `py/` (Python) and `c/` (C). Confusing them is the #1 mistake. 語料本體：`11/jack`（教材程式，需 OS）與 `11/jackNoOs`（自帶 `Sys.jack` 的無 OS 案例）；兩者都是網頁版 v1.0 的 Jack 語料。
  - `12`: the OS, written in Jack.
- `verilog/` — Verilog implementations (`hackcpu/`, `mcu0/`), simulated with Icarus Verilog (`iverilog` + `vvp`, installed at `/opt/homebrew/bin`).
- `_more/` — reference material: `book/` (full Nand2Tetris textbook), `wiki/` (architecture glossary), `pdf/`.
- `nand2tetris/_eda/` — **hackeda**（專案代號）：把整條 Nand2Tetris 工具鏈用 Rust 重做一遍。workspace 8 個 crate：`hackhdl`（parse/elab）、`hackrt`（執行 `.tst`/`.cmp`）、**`hdl2rs`（主 CLI：HDL→Rust 模擬程式）**、`hackasm`（組譯器）、`vm2asm`、`jack2vm`、`hackemu`（虛擬機 GUI/headless）、`hackserve`（網頁伺服器）＋ `web/` 薄前端（`index.html` asm、`hdl.html` HDL、`jack.html` Jack）。實作紀錄在 `_eda/_doc/v0.1.md … v1.0.md`（繁體中文）。

## Build / verify commands

- Chapter 06:
  - `make` builds `asm`, `vm`, `dasm`; `make clean` removes them. Use `./asm <Name>` (reads `<Name>.asm`, writes `<Name>.bin`), `./vm <Name>.bin` for an execution trace.
- Chapters 07/08:
  - `bash build.sh` → `./vm2asm`, then `bash all2asm.sh` to run all cases, or single case via `./vm2asm.sh <BaseName>`. Note the **argument order**: `vm2asm <out>.asm <in>.vm`.
- Chapter 09:
  - e.g. `python compiler.py p0/test1.p0 > p0/test1.ir && python vm.py p0/test1.ir`.
- Chapter 11:
  - C impl: `bash build.sh` (also works via `gcc -Wall -Wextra -g -fsanitize=address,undefined`), `bash all2vm.sh`. `jack2vm` and `all2vm.sh` take a **directory** of Jack sources (`../jack/Seven`), not a file.
  - Python impl: `bash pyrun.sh` or `python py/Compiler.py jack/Seven`.
- `verilog/`:
  - Per module: `iverilog -o <Base> <Base>_test.v && vvp <Base>`. `<Base>_test.v` files are the testbenches (e.g. `gate_test.v`, `computer_test.v`).
- `nand2tetris/_eda/`（hackeda，Rust workspace，bash 工具 cwd 記得切 `nand2tetris/_eda`）:
  - `cargo test -q` — workspace 單元測試。
  - `bash verify.sh` — 嚴格版（set -e）全回歸：前一版區段 v0.1–v0.8，v0.9 區段另起 hackserve（port 8086）跑 WS HDL 測。
  - `bash test.sh` — 容錯版（set -x + `|| true`），最尾 v0.9 區段同 WS 測。
  - `target/{release,debug}/hdl2rs` — 主 CLI：HDL→Rust 模擬程式。flags：`--dir <章節目錄>`（可重複、遞迴，01/02/03/05）、`--test <檔>.tst`、`--out gen`、`--release`。產出 `gen/<Top>_sim/`，乘載 `cargo build` 子程序。搞笑地在 `_eda/` 下跑 `cargo run -q -p hdl2rs -- …` 也可，但開新終端不要 `cd` 出錯。
  - 網頁伺服器：`cargo build --release -p hackserve && ./target/release/hackserve [--port 8080]` → 瀏覽器 `http://127.0.0.1:8080/`（`index.html` asm Emulator）、`/hdl.html`（v0.9 HDL 批次模擬）、`/jack.html`（v1.0 Jack 全鏈路）。WS 協定 `hdl-list`/`hdl-source`/`hdl-run` 由 `hackserve` 內部 spawn `hdl2rs` 二元檔實現，`jack-list`/`jack-source`/`jack-run` 則 spawn `jack2vm`/`vm2asm`/`hackasm`/`hackemu` 二元檔——**不要為網頁改這些引擎/CLI 本體**。v1.0 的 Jack 語料對照表在 `hackserve/src/jack.rs` 的 `JACK_PROGRAMS`/`JACK_NOOS_PROGRAMS`/`VIRTUAL_PROGRAMS` 常數（分別對應 `../11/jack`、`../11/jackNoOs`、`gen/chain`）。
  - v1.0 驗證**不進 `verify.sh`/`test.sh`**：只在 `cargo test -q -p hackserve`（含 `jack.rs` 單元測）＋ WS 冒煙測。
  - v0.9 章節語料＝`../01`、`../02`、`../03`（a/b 子目錄）、`../05`（04 無 `.hdl` 測試）。`.hdl/.cmp` 留 repo 唯讀，執行時只複製 `.tst`＋相關檔到暫存目錄。

## Gotchas

- Generated artifacts are committed to git — `*.bin` (ch. 06), `sum.hack0`, `.vvp` (verilog), even `.DS_Store`. `.gitignore` is a stale generic Cargo template and covers none of these. Don't add new build outputs to commits. `_eda/` 的 `gen/`、`target/`、`_eda` 外的臨時 `.out` 也都不要入 commit。
- **git 樹目前 index 已清空（約千個檔處在 staged deletion），工作樹另有大量 untracked（`_more/` 搬移中）**。要復原請用 `git add -A` 整批重新掛上；**不要用 `git checkout`/`git reset`**（那會把搬移中狀態或修改砍掉）。一般性改動走正常 commit，不要改寫歷史。
- Chapter READMEs (e.g. `01/README.md`) are the **handouts/exercises**, not docs describing a codebase. Don't delete or refactor them as if stale docs.
- Binary CLI tools (`asm`, `vm`, `vm2asm`, `jack2vm`) are build artifacts, not tracked; always `build.sh`/`make` first. 同理 `_eda/target/{debug,release}/hdl2rs`、`hackserve` 等也要先 `cargo build`。
- 命名地雷：`_eda/` 就是「hackeda」；`hdl2rs` 是其中主 CLI 子專案名（不是 HDL 檔案、也不是移植名）。章節 11 的 `11/c` 與 `11/py` 是**另一套** Jack 實作，跟 `_eda/jack2vm` 無關。