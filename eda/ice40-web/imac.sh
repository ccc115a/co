#!/usr/bin/env bash
# Install the toolchain and start the iCE40 web flow on macOS (Intel or Apple Silicon).
# Tools come from the official OSS CAD Suite (Yosys, nextpnr, icestorm, Icarus Verilog), unpacked into ./oss-cad-suite.
# Environment: PORT (8080), HOST (127.0.0.1), MAX_JOBS (2)
set -euo pipefail
cd "$(dirname "$0")"
[ "$(uname -s)" = Darwin ] || { echo "This script is for macOS. On Linux use ./linux.sh"; exit 1; }

command -v node >/dev/null || { echo "Node.js >= 20 is required. Install it with:  brew install node   (or https://nodejs.org)"; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "Node.js >= 20 required, found $(node -v)."; exit 1; }

# A terminal running under Rosetta reports x86_64 even on Apple Silicon, so ask the hardware.
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; then ARCH=darwin-arm64; else ARCH=darwin-x64; fi

for t in yosys nextpnr-ice40 icepack iverilog vvp; do command -v "$t" >/dev/null || { echo "Missing $t in oss-cad-suite/bin (delete ./oss-cad-suite and retry)."; exit 1; }; done
echo "yosys:    $(yosys -V 2>&1 | head -1)"
echo "nextpnr:  $(nextpnr-ice40 --version 2>&1 | head -1)"
echo "iverilog: $(iverilog -V 2>&1 | head -1)"

PORT="${PORT:-8080}"
( sleep 2; open "http://localhost:$PORT" ) >/dev/null 2>&1 &
# macOS has no unshare/prlimit: the server falls back to time limits only. Local use only.
SANDBOX=none exec node server.js
