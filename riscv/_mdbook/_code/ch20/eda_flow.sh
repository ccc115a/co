#!/bin/bash
# eda_flow.sh：開源 EDA 環境檢查＋投片五關指引（對應書 20.2）
# 檢查 yosys / openroad / pdk 是否存在，並印開源投片五關。
# 用法：bash eda_flow.sh（僅報告環境，不因缺工具失敗）
set -u

echo "== 工具檢查 =="
for t in yosys openroad opensta verilator klayout; do
  if command -v "$t" >/dev/null 2>&1; then
    echo "  [有] $t ($(command -v "$t"))"
  else
    echo "  [無] ${t}（缺：商用對應見下表，開源可用 conda/apt 補）"
  fi
done
echo "== PDK 檢查 =="
if [ -n "${PDK_ROOT:-}" ] && [ -d "$PDK_ROOT" ]; then
  echo "  [有] PDK_ROOT=$PDK_ROOT"
  ls "$PDK_ROOT" 2>/dev/null | head -5 | sed 's/^/    /'
else
  echo "  [無] 未設 PDK_ROOT 或目錄不存在（例：export PDK_ROOT=\$HOME/pdks，放入 sky130）"
fi

echo ""
echo "== 開源投片五關（RTL-to-GDSII，書 20.2）=="
printf '%-10s %-18s %-14s %s\n' "關卡" "開源工具" "商用對應" "輸入→輸出"
echo "--------------------------------------------------------------------------------"
printf '%-10s %-18s %-14s %s\n' "1 合成" "Yosys" "Design Compiler" ".v → 網表"
printf '%-10s %-18s %-14s %s\n' "2 佈局繞線" "OpenROAD" "Innovus/ICC2" "網表 → GDSII"
printf '%-10s %-18s %-14s %s\n' "3 靜態時序" "OpenSTA" "PrimeTime" "時序報告 WNS/TNS"
printf '%-10s %-18s %-14s %s\n' "4 物理驗證" "KLayout+Magic" "Calibre" "DRC/LVS 報告"
printf '%-10s %-18s %-14s %s\n' "5 投片" "Efabless+sky130" "晶圓廠 NDA" "GDSII → MPW"
echo "--------------------------------------------------------------------------------"
echo "記：FPGA 跑得動只是起點，五關全過才算可投片。"
