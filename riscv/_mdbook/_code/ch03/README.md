# ch03 範例（對應書中 3.1–3.5：指令格式、ALU、訪存、分支跳躍、ecall）

## 檔案說明

- `decode.py`：把 32-bit 指令字解碼為 R/I/S/B/U/J 欄位；6 種格式各一例（含 `0x00208133`=add x2,x1,x2），`assert` 全過。
- `alu_demo.s`：R 型（add/sub/and/or/xor/sll/srl/sra/slt）與 I 型（addi/andi/slli）整數運算。
- `loadstore.s`：lb/lbu/lh/lhu/lw/lwu/ld 與 sb/sh/sw/sd，展示符號/零擴展差異。
- `branch_jump.s`：beq/blt/jal/jalr（含 jr 偽指令）求兩數最大值。
- `ecall_hello.s`：Linux RV64 慣例（a7=64 write、93 exit）的 hello 骨架。
- `Makefile`：cross 組譯全部 `.s` 並執行 `decode.py`；預設 target 跑完所有驗證。

## 執行指令

```sh
make   # 組譯 4 個 .s 並跑 decode.py 自我檢查
```
