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
  - `11`: Jack compiler with **two independent implementations**: `py/` (Python) and `c/` (C). Confusing them is the #1 mistake.
  - `12`: the OS, written in Jack.
- `verilog/` — Verilog implementations (`hackcpu/`, `mcu0/`), simulated with Icarus Verilog (`iverilog` + `vvp`, installed at `/opt/homebrew/bin`).
- `_more/` — reference material: `book/` (full Nand2Tetris textbook), `wiki/` (architecture glossary), `pdf/`.

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

## Gotchas

- Generated artifacts are committed to git — `*.bin` (ch. 06), `sum.hack0`, `.vvp` (verilog), even `.DS_Store`. `.gitignore` is a stale generic Cargo template and covers none of these. Don't add new build outputs to commits.
- The working tree has an in-progress move of `book/` → `_more/book/` (large deletion set + untracked `_more/`). Prefer normal commits; don't rewrite history.
- Chapter READMEs (e.g. `01/README.md`) are the **handouts/exercises**, not docs describing a codebase. Don't delete or refactor them as if stale docs.
- Binary CLI tools (`asm`, `vm`, `vm2asm`, `jack2vm`) are build artifacts, not tracked; always `build.sh`/`make` first.