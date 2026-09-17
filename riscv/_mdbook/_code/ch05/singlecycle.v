// singlecycle.v：RV32I 單週期核心頂層（對應 5.1 資料路徑）
// 支援 addi / add / sw / lw / beq 子集。
//
// 資料路徑（一週期走完）：
//   PC -> IMEM 取指令 -> 解碼（opcode/rs1/rs2/rd/立即數）
//     -> RF 讀出 RD1/RD2 -> ALU（第二運算元由 ALUSrc 在 RD2/立即數間選）
//     -> DMEM（lw 讀 / sw 寫）-> 寫回多工器（MemtoReg 選 ALU 結果或記憶體讀值）
//     -> RF 寫回；PC 次態由 Branch&Zero 決定（跳轉或 PC+4）。
// 控制訊號由 opcode 組合解出（見 5.1 真值表）；分支比較用 ALU 做減法看 zero。
`timescale 1ns/1ps
module singlecycle (
  input  wire        clk,
  input  wire        rst_n,     // 低位有效重置
  output wire [31:0] pc_o       // 除錯：目前 PC
);
  // ALU 運算編碼（與 alu.v 一致）
  localparam [3:0] ALU_ADD = 4'd0, ALU_SUB = 4'd1;

  reg  [31:0] pc;               // 程式計數器
  reg  [31:0] imem [0:31];      // 指令記憶體：32 個字
  reg  [31:0] dmem [0:63];      // 資料記憶體：64 個字
  integer k;

  // 測試程式：加法 + 存取 + 分支（與 singlecycle_tb.v 期望值對應）
  //  0: addi x1, x0, 10   x1 = 10
  //  4: addi x2, x0, 20   x2 = 20
  //  8: add  x3, x1, x2   x3 = 30
  // 12: sw   x3, 0(x0)    mem[0] = 30
  // 16: lw   x4, 0(x0)    x4 = 30
  // 20: beq  x3, x4, +8   相等跳過下一條
  // 24: addi x5, x0, 1    被跳過（x5 保持 0）
  // 28: addi x5, x0, 99   x5 = 99
  // 32: beq  x1, x2, +8   不相等不跳
  // 36: addi x6, x0, 7    x6 = 7
  // 40: addi x7, x0, 8    x7 = 8
  initial begin
    imem[0]  = 32'h00a00093;  // addi x1, x0, 10
    imem[1]  = 32'h01400113;  // addi x2, x0, 20
    imem[2]  = 32'h002081b3;  // add x3, x1, x2
    imem[3]  = 32'h00302023;  // sw x3, 0(x0)
    imem[4]  = 32'h00002203;  // lw x4, 0(x0)
    imem[5]  = 32'h00418463;  // beq x3, x4, +8
    imem[6]  = 32'h00100293;  // addi x5, x0, 1（應被跳過）
    imem[7]  = 32'h06300293;  // addi x5, x0, 99
    imem[8]  = 32'h00208463;  // beq x1, x2, +8（不跳）
    imem[9]  = 32'h00700313;  // addi x6, x0, 7
    imem[10] = 32'h00800393;  // addi x7, x0, 8
    for (k = 11; k < 32; k = k + 1) imem[k] = 32'd0;  // 尾部全零：無效操作，不寫回
  end

  // 取指
  wire [31:0] instr = imem[pc[6:2]];

  // 解碼欄位
  wire [6:0] opcode = instr[6:0];
  wire [4:0] rs1    = instr[19:15];
  wire [4:0] rs2    = instr[24:20];
  wire [4:0] rd     = instr[11:7];

  // 指令類型（子集）
  wire is_addi   = (opcode == 7'b0010011);
  wire is_op     = (opcode == 7'b0110011);
  wire is_load   = (opcode == 7'b0000011);
  wire is_store  = (opcode == 7'b0100011);
  wire is_branch = (opcode == 7'b1100011);

  // 立即數產生器（I / S / B 型）
  wire [31:0] imm_i = {{20{instr[31]}}, instr[31:20]};
  wire [31:0] imm_s = {{20{instr[31]}}, instr[31:25], instr[11:7]};
  wire [31:0] imm_b = {{19{instr[31]}}, instr[31], instr[7],
                        instr[30:25], instr[11:8], 1'b0};
  wire [31:0] imm = is_store ? imm_s : imm_i;  // ALU 用 I/S；分支目標另用 imm_b

  // 控制訊號（5.1 真值表子集）
  wire reg_write = is_addi | is_op | is_load;
  wire alu_src   = is_addi | is_load | is_store;
  wire mem_write = is_store;
  wire mem_read  = is_load;
  wire mem_to_reg = is_load;
  wire branch    = is_branch;

  // 暫存器堆
  wire [31:0] rd1, rd2;
  wire [31:0] alu_out, mem_rdata, wd3, alu_b;
  wire        zero;
  wire [3:0]  alu_ctrl = branch ? ALU_SUB : ALU_ADD;  // 分支比相等用減法

  assign alu_b = alu_src ? imm : rd2;
  alu u_alu (.a(rd1), .b(alu_b), .alu_op(alu_ctrl),
             .result(alu_out), .zero(zero));

  // 資料記憶體：字組對齊，讀組合、寫同步
  assign mem_rdata = mem_read ? dmem[alu_out[7:2]] : 32'd0;
  assign wd3 = mem_to_reg ? mem_rdata : alu_out;  // 寫回多工器
  regfile u_rf (.clk(clk), .rst_n(rst_n), .ra1(rs1), .ra2(rs2),
                .wa(rd), .wd(wd3), .we(reg_write), .rd1(rd1), .rd2(rd2));

  // PC 次態：分支成立跳目標，否則 PC+4
  wire [31:0] pc_next = (branch & zero) ? (pc + imm_b) : (pc + 32'd4);

  // 時序：PC 前進；sw 同拍寫記憶體
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      pc <= 32'd0;
      for (k = 0; k < 64; k = k + 1) dmem[k] <= 32'd0;
    end else begin
      pc <= pc_next;
      if (mem_write) dmem[alu_out[7:2]] <= rd2;
    end
  end

  assign pc_o = pc;
endmodule
