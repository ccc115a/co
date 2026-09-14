# Riscv32：RV32S 指令集與 CPU 核心（32 位元、word 定址）

本目錄是 Nand2Tetris 第 5 章的延伸作業：把 HACK 擴展成 **RV32S**——
32 位元資料通路、32 位元指令、RISC-V 基礎指令集子集，並用 `_web_eda32/`
（hackjs 的 32-bit 分叉）整鏈路模擬。

## RV32S 指令集

- **定址**：以 word 為單位，`pc+1`、RAM 位址 `[0..14]`（32K word）。
- **16 個暫存器？** 不，32 個（`x0..x31`）；`x0` 恆為 0，寫入被忽略。
- **指令格式**（RV 原版欄位）：
  - R 型（`0110011`）：`funct7 rs2 rs1 funct3 rd opcode`
  - I 型（`0010011`）+ LW（`0000011`）：`imm[11:0] rs1 funct3 rd opcode`
  - S 型（`0100011`）：位移拆成 `imm[11:5]→[31:25]`、`imm[4:0]→[11:7]`
  - B 型（`1100011`）：位移拆成 `[12|10:5]→[31:25]`、`[4:1|11]→[11:7]`
  - JAL（`1101111`）：`imm[20|10:1|11|19:12]`；JALR（`1100111`）、LUI（`0110111`）、
    AUIPC（`0010111`）、HALT（`1111111`）
- **算術**：add/addi/sub/and/andi/or/ori/xor/xori/slti；比較 beq/bne/blt/bge。
- **記憶體**：lw/sw（word，16 位元位移）。

## 組譯器 `asm.js`

純 JavaScript 單檔，讀 `progN.asm` 寫 `progN.bin`：

```sh
node asm.js prog1.asm
```

支援標籤、`loop:`／`0x20`／制表符對齊（同 Nand2Tetris hack 組譯器風格）；自動補：R 型
`funct7=0`、`lui` 立即數取 `imm[31:12]`（位移 12）、sw 位移依 S 型 split。

## CPU 核心

| 檔案 | 說明 |
|------|------|
| `Rv32_1.hdl` | 單週期核心（IF+ID+EX+MEM+WB 合一），邏輯最直接 |
| `Rv32_5.hdl` | 五級管線核心（IF/ID/EX/MEM/WB 各一級） |
| `_lib/` | Dec、Alu32r、Cmp32、SImm/Se12、PR3/5/9、Pad5/Pad16、Comp5 等元件 |

管線處理：兩層前饋（EX/MEM 優先 MEM/WB、再於 EX 端 1-back 覆蓋）、load-use stall、
分支/JAL/JALR 於 EX 解出即 flush、HALT 自我鎖定凍結 PC。

除錯接口：`dbgRd[5]` 讀暫存器、`pc`；記憶體用 `RAM32W[i]` 探測。

## 工具鏈分叉說明

`../_web_eda32/` 是 hackjs（`../_web_eda/`）的分叉，只為 RV32S 擴展：

- 內建晶片：`ROM32`、`RAM32W`、`RF32`（暫存器堆，ports `a1/a2/a3/d1/d2/d3/rd/wd/we`）。
- 加法器 `Add32c`、比較器等依 32-bit 有號語意顯示。
- **16-bit 教材目錄**（`01..05`）照舊可用，但其驗證線路在 32-bit 環境下，
  「有號顯示」結果刻意保留原先的 16-bit 語意——這是本作業**接受的分叉差異**，
  與「絕對正確性」無關（RV32S 的正確性以 `Riscv32/*.tst` 之 `.cmp` 為準）。

## 驗證

```sh
bash verify.sh   # 組譯＋單週期＆管線共 4 個測試，全數 .cmp 比對
bash run.sh      # 快速示範：組譯＋跑管線 Rv32_5（prog3）
```

測試測資：

| 測試 | 核心 | 程式 | 涵蓋 |
|------|------|------|------|
| `Rv32_1.tst` | 單週期 | prog1（61 指令） | 全指令面、立即數、分支、JAL/JALR、lw/sw |
| `Rv32_1_3.tst` | 單週期 | prog3（10 指令） | 負立即數、負位移、後跳迴圈 bne |
| `Rv32_5.tst`  | 管線   | prog1 | 全指令面＋stall/flush/前饋 |
| `Rv32_5_3.tst`| 管線   | prog3 | 後跳（吻合竄流 flush） |