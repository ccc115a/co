
for t in yosys nextpnr-ice40 icepack iverilog vvp; do command -v "$t" >/dev/null || { echo "Missing $t in oss-cad-suite/bin (delete ./oss-cad-suite and retry)."; exit 1; }; done
echo "yosys:    $(yosys -V 2>&1 | head -1)"
echo "nextpnr:  $(nextpnr-ice40 --version 2>&1 | head -1)"
echo "iverilog: $(iverilog -V 2>&1 | head -1)"

PORT="${PORT:-8080}"
( sleep 2; open "http://localhost:$PORT" ) >/dev/null 2>&1 &
# macOS has no unshare/prlimit: the server falls back to time limits only. Local use only.
SANDBOX=none exec node server.js
