// tiny_core.v：三階管線 IF/EX/WB 迷你核心教學模型（對應 7.1 小核心精神）
// 支援 addi / add / sw / lw / beq 子集。教學簡化取捨：
//   - 無轉發：相鄰資料相依間需 1 條 NOP（範例程式已安排）。
//   - 分支 1 個延遲槽：beq 後一條必執行（範例放無害 NOP）。
// 資料路徑：IF 取指 -> IF/EX 管線暫存器 -> EX 解碼/讀RF/ALU/分支判決
//         -> EX/WB 管線暫存器 -> WB 寫回 RF；分支在 EX 解析，次拍重定向 PC。
`timescale 1ns/1ps
module tiny_core (
  input  wire        clk,
  input  wire        rst_n,     // 低位有效重置
  output wire [31:0] pc_o       // 除錯：目前 PC
);
  localparam [3:0] ALU_ADD = 4'd0, ALU_SUB = 4'd1;

  reg [31:0] pc;                // IF：程式計數器
  reg [31:0] imem [0:15];       // 指令記憶體：16 個字
  reg [31:0] dmem [0:15];       // 資料記憶體：16 個字
  reg [31:0] rf [0:31];         // 32 個通用暫存器（x0 恆零）
  integer k;

  // 測試程式（NOP 相隔避開資料冒險，beq 後一條為延遲槽）：
  //  0: addi x1, x0, 10    4: nop
  //  8: addi x2, x0, 20   12: nop
  // 16: add x3, x1, x2    20: nop
  // 24: sw x3, 0(x0)      28: lw x4, 0(x0)
  // 32: nop（隔開 lw-use）36: beq x3, x4, +8（跳到 44）
  // 40: nop（延遲槽）     44: addi x5, x0, 99
  initial begin
    imem[0]  = 32'h00a00093;  // addi x1, x0, 10
    imem[1]  = 32'h00000013;  // nop
    imem[2]  = 32'h01400113;  // addi x2, x0, 20
    imem[3]  = 32'h00000013;  // nop
    imem[4]  = 32'h002081b3;  // add x3, x1, x2
    imem[5]  = 32'h00000013;  // nop
    imem[6]  = 32'h00302023;  // sw x3, 0(x0)
    imem[7]  = 32'h00002203;  // lw x4, 0(x0)
    imem[8]  = 32'h00000013;  // nop
    imem[9]  = 32'h00418463;  // beq x3, x4, +8
    imem[10] = 32'h00000013;  // nop（延遲槽）
    imem[11] = 32'h06300293;  // addi x5, x0, 99
    for (k = 12; k < 16; k = k + 1) imem[k] = 32'h00000013;
  end

  // IF/EX 與 EX/WB 管線暫存器
  reg [31:0] ifex_instr, ifex_pc;
  reg [31:0] exwb_result, exwb_rdata, exwb_pc;
  reg [4:0]  exwb_rd;
  reg        exwb_regwrite, exwb_memtoreg;

  // EX 解碼（IF/EX 欄位）
  wire [6:0] opcode = ifex_instr[6:0];
  wire [4:0] rs1 = ifex_instr[19:15];
  wire [4:0] rs2 = ifex_instr[24:20];
  wire [4:0] rd  = ifex_instr[11:7];
  wire is_addi   = (opcode == 7'b0010011);
  wire is_op     = (opcode == 7'b0110011);
  wire is_load   = (opcode == 7'b0000011);
  wire is_store  = (opcode == 7'b0100011);
  wire is_branch = (opcode == 7'b1100011);

  // 讀 RF（x0 恆零）
  wire [31:0] rd1 = (rs1 == 5'd0) ? 32'd0 : rf[rs1];
  wire [31:0] rd2 = (rs2 == 5'd0) ? 32'd0 : rf[rs2];

  // 立即數與 ALU
  wire [31:0] imm_i = {{20{ifex_instr[31]}}, ifex_instr[31:20]};
  wire [31:0] imm_s = {{20{ifex_instr[31]}}, ifex_instr[31:25], ifex_instr[11:7]};
  wire [31:0] imm_b = {{19{ifex_instr[31]}}, ifex_instr[31], ifex_instr[7],
                        ifex_instr[30:25], ifex_instr[11:8], 1'b0};
  wire [31:0] alu_b = (is_addi | is_load | is_store) ? (is_store ? imm_s : imm_i) : rd2;
  wire [31:0] alu_out = is_branch ? (rd1 - rd2) : (rd1 + alu_b);
  wire        zero = (alu_out == 32'd0);

  // 分支判決與目標（EX 組合邏輯，次拍生效）
  wire        ex_taken = is_branch & zero;
  wire [31:0] ex_target = ifex_pc + imm_b;

  // 訪存讀（lw 組合讀，EX 拍取值存入管線暫存器）
  wire [31:0] mem_rdata = is_load ? dmem[alu_out[5:2]] : 32'd0;

  // WB 寫回選擇
  wire [31:0] wb_data = exwb_memtoreg ? exwb_rdata : exwb_result;

  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      pc <= 32'd0;
      ifex_instr <= 32'h00000013; ifex_pc <= 32'd0;
      exwb_result <= 0; exwb_rdata <= 0; exwb_pc <= 0;
      exwb_rd <= 0; exwb_regwrite <= 0; exwb_memtoreg <= 0;
      for (k = 0; k < 32; k = k + 1) rf[k] <= 32'd0;
      for (k = 0; k < 16; k = k + 1) dmem[k] <= 32'd0;
    end else begin
      // IF：取指；EX 上拍已算出分支則重定向（延遲槽指令已在管線內）
      pc <= ex_taken ? ex_target : (pc + 32'd4);
      ifex_instr <= imem[pc[5:2]];  // 4-bit 索引恆在 16 字範圍內
      ifex_pc <= pc;
      // EX -> WB：鎖存結果與控制
      exwb_result <= alu_out;
      exwb_rdata <= mem_rdata;
      exwb_pc <= ifex_pc;
      exwb_rd <= rd;
      exwb_regwrite <= is_addi | is_op | is_load;
      exwb_memtoreg <= is_load;
      // MEM 寫（sw 在 EX 拍寫入）與 WB 寫回 RF（x0 不可寫）
      if (is_store) dmem[alu_out[5:2]] <= rd2;
      if (exwb_regwrite && (exwb_rd != 5'd0)) rf[exwb_rd] <= wb_data;
    end
  end

  assign pc_o = pc;
endmodule
