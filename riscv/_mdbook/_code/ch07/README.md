# ch07 範例（對應書中 7.1 Ibex/PicoRV32、7.2 Rocket Chip、7.3 BOOM 剖析輔助）

不複製開源核心程式碼；`tiny_core.v` 為自寫三階教學模型，upstream 連結見 `upstream.md`。

## 檔案說明

- `cores_compare.py`：輸出 PicoRV32/Ibex/Rocket/BOOM 對照表（管線級數、面積量級、OoO/Chisel），assert 檢查表完整性。
- `tiny_core.v`：IF/EX/WB 三階迷你核心教學模型（addi/add/sw/lw/beq 子集，無轉發、分支一個延遲槽）。
- `tiny_core_tb.v`：testbench，跑內建小程式並自檢暫存器，預期印出 `PASS`。
- `upstream.md`：各開源核心 upstream 連結與一句話定位。
- `Makefile`：`iverilog -Wall`＋`vvp` 跑 tb，另跑 `cores_compare.py`。

## 執行指令

```sh
make                         # 跑 tb 自檢＋對照表
python3 cores_compare.py     # 也可單獨執行
make clean                   # 清除產物
```
