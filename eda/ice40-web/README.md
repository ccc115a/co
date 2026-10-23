# iCE40 Web Flow

Browser UI + small Node.js server running the native open-source FPGA toolchain:
Yosys → nextpnr-ice40 → icepack, plus Icarus Verilog for testbench simulation.
Zero npm dependencies (Node ≥ 20).

## Run
    bash linux.sh            # Linux: installs missing tools with apt (or OSS CAD Suite if no apt), then starts the server
    bash linux.sh --oss      # Linux: use the newest OSS CAD Suite (Yosys 0.70 / nextpnr 0.11 tested) in ./oss-cad-suite
    bash imac.sh             # macOS (Intel or Apple Silicon): downloads OSS CAD Suite, starts the server, opens the browser

Needs Node.js >= 20 (the scripts tell you if it is missing). Open http://localhost:8080.
Env vars: PORT (8080), HOST (127.0.0.1 = this machine only), MAX_JOBS (2), SANDBOX (auto: linux | none).

macOS has no `unshare`/`prlimit`, so there the server runs in `SANDBOX=none` mode: time limits only, no network or
memory isolation. That is fine for your own machine; do not expose it to other people.

## Test (server must be running)
    node unit.test.js         # parsers, route slimming
    node test.js              # end-to-end flow, input validation, limits (~35 s: includes a 30 s timeout case)

## What you get
- Editor (design.v, tb.v, design.pcf), 5 devices with verified packages, live streamed log, click an error to jump to the line.
- Report: fmax vs target, utilisation, critical path.
- Layout: pan/zoom placement + routing from nextpnr's JSON; critical path in pink; net search.
- Waveform: VCD viewer (scroll, Ctrl+wheel zoom, hover values). Download the .bin.

## Security model — read before exposing to the internet
Each tool runs under `unshare -n` (no network), `prlimit` (4 GB address space, CPU, file size, 64 procs),
a wall-clock kill (synth 60 s, P&R 120 s, sim 30 s), in a throw-away temp dir. Names/devices/packages are whitelisted
and no shell is used. This is process-level isolation only: it does NOT stop a hostile design from reading
world-readable files on the host. For public use, run the server inside a container/VM with no secrets, as a
non-root user, and put a rate limiter in front. Verilator is deliberately not exposed (it compiles and runs C++).

## Known limits
- Tool versions are Ubuntu's (Yosys 0.33, nextpnr 0.6). Newer = OSS CAD Suite.
- `--routed-svg` is not used (83 MB for a tiny design); the viewer draws from `--write` JSON instead.
- Only inter-tile hops are drawn; intra-tile routing is omitted.
- Single design file per run; no persistence or sharing yet.
