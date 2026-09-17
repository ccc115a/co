#!/usr/bin/env bash
# spirv_flow.sh：GLSL→SPIR-V→RISC-V GPU 編譯管線（對應 10.3）。
# 缺工具時印安裝指引並 dry-run，不報錯。用法：bash spirv_flow.sh [shader.vert]
set -u
SRC="tri.vert"
if [ $# -ge 1 ]; then SRC="$1"; fi
say() { printf '%s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1; }

say "== 輸入：${SRC}（若無此檔，僅 dry-run 印指令） =="
missing=0
for t in glslangValidator spirv-val spirv-opt spirv-llvm-translator llc; do
  if need "$t"; then say "[OK] $t"; else say "[MISS] $t"; missing=1; fi
done

if [ "$missing" -eq 1 ]; then
  say "安裝指引：brew install glslang spirv-tools llvm（macOS）"
  say "或：sudo apt install glslang-tools spirv-tools llvm（Debian/Ubuntu）"
fi

say "== 管線（dry-run 亦印出） =="
say "glslangValidator -V ${SRC} -o tri.vert.spv"
say "spirv-val tri.vert.spv && spirv-opt -O tri.vert.spv -o tri.vert.opt.spv"
say "spirv-llvm-translator tri.vert.opt.spv -o tri.ll"
say "llc -march=riscv32 -mattr=+m tri.ll -o tri_rv.s"

if [ "$missing" -eq 1 ] || [ ! -f "$SRC" ]; then
  say "結論：dry-run 完成（工具或 shader 缺失時不真執行，屬正常）。"
  exit 0
fi

set -e
glslangValidator -V "$SRC" -o tri.vert.spv
spirv-val tri.vert.spv && spirv-opt -O tri.vert.spv -o tri.vert.opt.spv
spirv-llvm-translator tri.vert.opt.spv -o tri.ll
llc -march=riscv32 -mattr=+m tri.ll -o tri_rv.s
say "結論：已產出 tri_rv.s。"
