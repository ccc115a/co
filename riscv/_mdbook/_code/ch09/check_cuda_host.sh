#!/usr/bin/env bash
# check_cuda_host.sh：在 RISC-V 主機上檢查 CUDA Host 環境（對應 9.2）。
# 無 N 卡/無驅動時友善提示並退出 0（不報錯）。用法：bash check_cuda_host.sh
set -u
ok=1
say() { printf '%s\n' "$*"; }

say "== 1. 平台 =="
say "uname -m: $(uname -m)"
if [ "$(uname -m)" != "riscv64" ]; then
  say "提示：本機不是 riscv64，僅示範檢查流程。"
fi

say "== 2. PCIe 上有 NVIDIA 卡嗎 =="
if command -v lspci >/dev/null 2>&1; then
  if lspci 2>/dev/null | grep -i nvidia; then
    say "[OK] 找到 NVIDIA 裝置"
  else
    say "[MISS] lspci 未見 NVIDIA 卡（無卡即到此為止，屬正常）"
    ok=0
  fi
else
  say "[MISS] 無 lspci 工具，改看 dmesg（若也無則跳過）"
  ok=0
fi

say "== 3. NVIDIA 驅動 =="
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi || say "[MISS] nvidia-smi 執行失敗（驅動未裝好）"
else
  say "[MISS] 無 nvidia-smi：需安裝 riscv64 版 NVIDIA 驅動"
  ok=0
fi

say "== 4. CUDA toolkit =="
if command -v nvcc >/dev/null 2>&1; then
  nvcc --version || true
else
  say "[MISS] 無 nvcc：需安裝 linux-riscv64 版 CUDA toolkit"
  ok=0
fi

if [ "$ok" -eq 1 ]; then
  say "結論：Host-side 環境就緒，可跑 ./vectorAdd。"
else
  say "結論：本機無完整 CUDA Host 環境（預期內），請到 RISC-V + N 卡主機再跑。"
fi
exit 0
