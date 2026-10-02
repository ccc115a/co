# rv32i.hdl.md — RV32I 單週期處理器（`Riscv32i/rv32i.hdl`）

## 一句話

單週期 RV32I（word 定址；程式格式與 `Riscv32/RV32S` 相容）：
`R32（PC）→ ROM32 → RvDec → RF32 → RvAlu/RvBr → RAM32W → 寫回`，
一週期一條指令，HALT 黏住凍結。測資 `rv32i_prog`（60 指令）跑完
32 個暫存器全中（見 `rv32i_prog.asm` 註解的期望值）。

## 介面

- `IN dbgRd[5]`、`OUT pc[32]、dbgReg[32]`（同 `Rv32_1`，`.tst` 寫法可照抄；
  記憶體經 `RAM32W[i]` 探測）。
- 子元件（本目錄自有；閘級基礎複用 `../01、../02`，其餘 18 個引自
  `Riscv32/_lib` 原樣拷貝，不依賴該目錄）：
  `RvDec`（解碼＋自有 `ctl[15:0]`）、`RvAlu`（11 種運算）、
  `RvSh32`（桶式移位器）、`RvBr`（六種分支）、`Zero32i`。

## 指令集

R 型全 10 種（`add/sub/sll/slt/sltu/xor/srl/sra/or/and`）、I 型
（`addi/slli/srli/srai/slti/sltiu/xori/ori/andi`）、`LW/SW`、
`LUI/AUIPC`、`JAL/JALR`、六種分支、`HALT`（`1111111`）。
省略（word 定址簡化，同 RV32S）：`LB/LH/LBU/LHU/SB/SH`、`FENCE/ECALL`。

## 設計要點（除錯血淚）

1. **JALR 不可清 LSB**：byte 版 RV 回跳位址恆偶數，`& ~1` 無害；
   word 定址下奇數 PC 合法（如 link＝35），清掉會跳錯一格。
   `Rv32_1` 同樣直接省略。
2. **AUIPC 取 `immU`**：`imm` 多工器選 `sel0＝S/B｜U｜AU`、`sel1＝J｜U｜AU`
   才會在 U/AU 時選到 `{imm[31:12],12'b0}`；漏了 `eqAU` 會拿到 J 型立即數。
   （上游 `Dec` 亦有同樣寫法，但 `prog1` 只測 `auipc x25, 0`，兩者皆 0 而沒爆。）
3. **`slt/sltu` 要借減法器的借位**：`RvAlu` 的 `cout` 平時是加法進位，
   解到 `slt/sltu` 時須把 `subsel` 一併拉起（`b` 取反＋`cin＝1`），
   否則 `ltU/ltS` 全錯。
4. **`aluFn` 位元表**（`RvDec` 註解亦有）：
   `0000 and｜0001 or｜0010 xor｜0011 add｜0100 sub｜0101 sll｜
   0110 srl｜0111 sra｜1000 slt｜1001 sltu｜1010 passA`。
   `xor` 的 bit0＝0、`sll` 的 bit1＝0，寫 OR 樹時別多收。
