# iCE40 Web Flow

Browser UI + small Node.js server running the native open-source FPGA toolchain:
Yosys → nextpnr-ice40 → icepack, plus Icarus Verilog for testbench simulation.
Zero npm dependencies (Node ≥ 20).

## Run
    ./linux.sh            # Linux: installs missing tools with apt (or OSS CAD Suite if no apt), then starts the server
    ./linux.sh --oss      # Linux: use the newest OSS CAD Suite (Yosys 0.70 / nextpnr 0.11 tested) in ./oss-cad-suite
    ./imac.sh             # macOS (Intel or Apple Silicon): downloads OSS CAD Suite, starts the server, opens the browser

Needs Node.js >= 20 (the scripts tell you if it is missing). Open http://localhost:8080.
Env vars: PORT (8080), HOST (127.0.0.1 = this machine only), MAX_JOBS (2), SANDBOX (auto: linux | none).

macOS has no `unshare`/`prlimit`, so there the server runs in `SANDBOX=none` mode: time limits only, no network or
memory isolation. That is fine for your own machine; do not expose it to other people.

## Test (server must be running)
    node unit.test.js         # parsers, route slimming
    node asm.test.js          # the assembler
    node test.js              # end-to-end flow, input validation, limits (~35 s: includes a 30 s timeout case)
    node examples.test.js     # every bundled example, with the result it should produce

## Examples (public/examples/)
| Example | What it shows |
|---|---|
| Blinky counter | the smallest FPGA design |
| Formal: BCD counter with a bug | bmc finds the counterexample (waveform), fix one digit and `prove` proves it |
| **MCU0 CPU on FPGA** (assembly source) | 16-bit accumulator CPU on one block RAM (173 LCs, about 49 MHz on UP5K); LEDs count the running sum 1,3,6,10,15,21,28,36,45,55. Checked in RTL, gate-level, and with a sparse clock enable |
| **MCU0m CPU, from the article** | the article's behavioural CPU, unchanged; simulation only; its output matches the article line for line |
| Traffic-light FSM | parameterised state machine, fast simulation clock |
| UART transmitter | 8N1 TX with a testbench that decodes the bits |
| 8-bit LFSR | maximal-length shift register |
| Syntax error demo | click the red error line to jump to the source |

An example is a folder with an entry in `index.json`; add your own the same way.

## Project files
Besides design.v, tb.v and design.pcf you can add up to 8 files with the + tab (`.v .sv .vh .hex .mem .txt`).
`.v/.sv` files are compiled together with the design; `.hex` files are visible to `$readmemh` in both Yosys and Icarus.
The "Synthesis + P&R" and "Simulation" checkboxes choose which stages run; simulation-only skips Yosys entirely.

## MCU0 assembler
Put a `name.asm` file in the project (the + tab); every run assembles it into `name.hex`, which `$readmemh` can read.
`Assemble` in the options bar checks it without running anything and prints a listing. Syntax (same instruction set as the MCU0m article):

    SIZE 256                 // pad the image to 256 words (one block RAM)
    LOOP:  LD   I            // LD ADD JMP ST CMP JEQ, operand = label or number, label+2 also works
           JEQ  EXIT         // ; or // start a comment
    EXIT:  JMP  EXIT
    ORG 0x14                 // move to an even byte address (an error if the code already passed it)
    SUM:   WORD 0            // 16-bit data;  FORMAT BYTES gives the article's two-bytes-per-line hex

All errors are reported at once with file and line, and are marked in the editor.

## Fast reprogram (icebram)
Tick "Fast reprogram" and pick the memory image (a `.hex`, or the one an `.asm` produces) and its shape. The first run synthesizes and
places the design with a unique placeholder in that memory; the placed bitstream is cached. Every later run with the same design only
swaps the real program in with `icebram`: about 40 ms instead of several seconds. The result is bit-identical to a full rebuild
(the tests compare them). Simulation and formal verification always use the real program. Limits: one 4 kbit block RAM
(16x256, 8x512, 4x1024, 2x2048), the design must load it with `$readmemh("file", ...)`, the cache holds 8 designs and is cleared on restart.

## Formal verification
Write `assert()`, `assume()` and `cover()` inside `` `ifdef FORMAL `` blocks, tick Formal, choose a mode and a module, and Run (SymbiYosys with boolector).
- **bmc**: no assertion can fail in the first N cycles from reset. A bounded check, not a proof for all time.
- **prove**: k-induction, a proof for all time when the property is inductive; otherwise a failure may need a stronger invariant.
- **cover**: find a trace that reaches each `cover()`; use it to check that a property is not vacuous.
A counterexample or cover trace opens in the Waveform tab (Source: Formal trace); failing assertions are listed and clickable.
Two traps the examples show: put the properties' module in "module" (assumptions about inputs that the top module drives contradict each other
and nothing gets checked; the server detects this), and always add a `cover()` or a deliberately wrong value to confirm a passing property is not vacuous.
Needs `sby`: present in the OSS CAD Suite (`bash linux.sh --oss`, `bash imac.sh`), not in the plain apt install.

## What you get
- **Editor**: CodeMirror with Verilog highlighting, line numbers and inline error markers (click a red log line to jump to it). Falls back to a plain textarea if the bundle cannot load. Ctrl/Cmd+Enter runs.
- **Run / Cancel**: the Run button becomes Cancel while a job runs (Esc also cancels). The server kills the tool and its helper processes within about 100 ms.
- **Report**: fmax vs target, utilisation, critical path. Click a critical-path row to see it in the Layout.
- **Schematic**: RTL block diagram from Yosys `prep`, drawn by netlistsvg. A module selector lets you look inside instances; Save SVG.
- **Layout**: pan/zoom placement and routing. Click a cell for its type, BEL, LUT init and connected nets; click a net to highlight it; "congestion" shades tiles by routing hops; zooming in shows tile coordinates and LC numbers. Pink = critical path.
- **Waveform**: VCD viewer (scroll, Ctrl+wheel zoom, hover values). Download the .bin.

## Front-end bundles (public/vendor/)
`editor.js` (CodeMirror 6) and `schematic.js` (netlistsvg + ELK) are prebuilt and shipped, so running needs no npm.
To rebuild after changing `build/*-entry.js`: `cd build && npm install && npm run build`.
Third-party licenses: CodeMirror and netlistsvg are MIT; elkjs is EPL-1.0.

## Security model — read before exposing to the internet
Each tool runs under `unshare -n` (no network), `prlimit` (4 GB address space, CPU, file size, 64 procs),
a wall-clock kill (synth 60 s, P&R 120 s, sim 30 s), in a throw-away temp dir. Names/devices/packages are whitelisted
and no shell is used. This is process-level isolation only: it does NOT stop a hostile design from reading
world-readable files on the host. For public use, run the server inside a container/VM with no secrets, as a
non-root user, and put a rate limiter in front. Verilator is deliberately not exposed (it compiles and runs C++).

## Known limits
- Tool versions are Ubuntu's (Yosys 0.33, nextpnr 0.6). Newer = OSS CAD Suite.
- `--routed-svg` is not used (83 MB for a tiny design); the viewer draws from `--write` JSON instead.
- The layout draws inter-tile hops only (intra-tile hops appear in the congestion shading, not as lines). Tile types (RAM, DSP) are not shaded, because nextpnr's JSON does not carry them.
- The schematic shows one module at a time and refuses modules over 800 cells (the layout step runs in the page and would freeze it).
- Formal depth is bounded by the solver: the MCU0 property needs 250 cycles (3 s with boolector; yices took minutes on the same problem).
- Cancel needs a connection that really closes: behind a buffering proxy it may be delayed.
- No persistence or sharing yet.
