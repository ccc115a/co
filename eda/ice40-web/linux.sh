#!/usr/bin/env bash
# Install the toolchain (if needed) and start the iCE40 web flow on Linux.
#   ./linux.sh          use distro packages (apt) if tools are missing; fall back to OSS CAD Suite
#   ./linux.sh --oss    download and use the latest OSS CAD Suite (newer Yosys/nextpnr) into ./oss-cad-suite
# Environment: PORT (8080), HOST (127.0.0.1), MAX_JOBS (2)
set -euo pipefail
cd "$(dirname "$0")"
TOOLS=(yosys nextpnr-ice40 icepack iverilog vvp)
USE_OSS=0
for a in "$@"; do case "$a" in --oss) USE_OSS=1 ;; -h|--help) sed -n '2,6p' "$0"; exit 0 ;; *) echo "unknown option: $a"; exit 2 ;; esac; done

missing() { local m=(); for t in "${TOOLS[@]}"; do command -v "$t" >/dev/null 2>&1 || m+=("$t"); done; echo "${m[*]:-}"; }

command -v node >/dev/null || { echo "Node.js >= 20 is required (https://nodejs.org or your package manager)."; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "Node.js >= 20 required, found $(node -v)."; exit 1; }

install_oss() {
  local arch; case "$(uname -m)" in x86_64|amd64) arch=linux-x64 ;; aarch64|arm64) arch=linux-arm64 ;; *) echo "No OSS CAD Suite build for $(uname -m)."; exit 1 ;; esac
  if [ ! -x oss-cad-suite/bin/yosys ]; then
    local tag path
    tag=$(curl -sI https://github.com/YosysHQ/oss-cad-suite-build/releases/latest | tr -d '\r' | sed -n 's|^[Ll]ocation:.*/tag/||p')
    [ -n "$tag" ] || { echo "Could not determine the latest OSS CAD Suite release (no network?)."; exit 1; }
    path=$(curl -sL "https://github.com/YosysHQ/oss-cad-suite-build/releases/expanded_assets/$tag" | grep -oE "/YosysHQ/[^\"]*oss-cad-suite-$arch-[0-9]+\.tgz" | head -1 || true)
    [ -n "$path" ] || { echo "No $arch asset found in release $tag."; exit 1; }
    echo "Downloading OSS CAD Suite $tag ($arch), several hundred MB..."
    curl -L --fail -C - -o oss-cad-suite.tgz.part "https://github.com$path"
    tar xzf oss-cad-suite.tgz.part && rm -f oss-cad-suite.tgz.part
  fi
  export PATH="$PWD/oss-cad-suite/bin:$PATH"
}

if [ "$USE_OSS" = 1 ]; then
  install_oss
elif [ -n "$(missing)" ]; then
  if command -v apt-get >/dev/null; then
    SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
    echo "Installing with apt: yosys nextpnr-ice40 fpga-icestorm iverilog util-linux"
    $SUDO apt-get update -qq
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends yosys nextpnr-ice40 fpga-icestorm iverilog util-linux
  else
    echo "No apt-get on this system; using OSS CAD Suite instead."
    install_oss
  fi
else
  # an earlier --oss install is reused only when asked for; otherwise system tools win
  :
fi

m=$(missing); [ -z "$m" ] || { echo "Still missing: $m"; exit 1; }
echo "yosys:   $(yosys -V 2>&1 | head -1)"
echo "nextpnr: $(nextpnr-ice40 --version 2>&1 | head -1)"
echo "iverilog: $(iverilog -V 2>&1 | head -1)"
exec node server.js
