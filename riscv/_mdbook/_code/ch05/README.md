# ch05 範例（對應書中 5.1 單週期與資料路徑、5.2 五階管線、5.3 冒險與轉發）

單週期子集核心可綜合驗證檔；管線本節只取轉發單元做成獨立模組驗證。

## 檔案說明

- `alu.v`：RV32I ALU（add/sub/and/or/xor/slt/sll/srl），分支比較輸出 `zero`。
- `regfile.v`：32x32 暫存器檔，x0 恆零且不可寫，同週期寫後讀旁路。
- `singlecycle.v`：單週期頂層，支援 addi/add/sw/lw/beq，內含 IMEM 測試程式與註解資料路徑。
- `singlecycle_tb.v`：testbench，跑加法+存取+分支小程式並自檢暫存器，另抽檢轉發單元三組向量。
- `forwarding.v`：EX 級轉發單元（MEM 新值優先於 WB 舊值，x0 不轉發）。
- `Makefile`：`iverilog -Wall` 編譯＋`vvp` 執行，預期印出 `PASS`。

## 執行指令

```sh
make        # 編譯並執行自檢，預期 PASS
make clean  # 清除產物
```
