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

if [ ! -x oss-cad-suite/bin/yosys ]; then
  tag=$(curl -sI https://github.com/YosysHQ/oss-cad-suite-build/releases/latest | tr -d '\r' | sed -n 's|^[Ll]ocation:.*/tag/||p')
  [ -n "$tag" ] || { echo "Could not determine the latest OSS CAD Suite release (no network?)."; exit 1; }
  path=$(curl -sL "https://github.com/YosysHQ/oss-cad-suite-build/releases/expanded_assets/$tag" | grep -oE "/YosysHQ/[^\"]*oss-cad-suite-$ARCH-[0-9]+\.tgz" | head -1 || true)
  [ -n "$path" ] || { echo "No $ARCH asset found in release $tag."; exit 1; }
  echo "Downloading OSS CAD Suite $tag ($ARCH), several hundred MB..."
  curl -L --fail -C - -o oss-cad-suite.tgz.part "https://github.com$path"
  tar xzf oss-cad-suite.tgz.part && rm -f oss-cad-suite.tgz.part
  xattr -dr com.apple.quarantine oss-cad-suite 2>/dev/null || true
fi
export PATH="$PWD/oss-cad-suite/bin:$PATH"
