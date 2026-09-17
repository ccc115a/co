// alu.v：RV32I 算術邏輯單元（對應 5.1 資料路徑之 EX 核心）
`timescale 1ns/1ps
module alu (
  input  wire [31:0] a,        // 左運算元（rs1）
  input  wire [31:0] b,        // 右運算元（rs2 或立即數）
  input  wire [3:0]  alu_op,   // 運算選擇
  output reg  [31:0] result,   // 運算結果
  output wire        zero       // 結果為零旗標（分支比較用）
);
  // 運算編碼
  localparam [3:0] OP_ADD = 4'd0,
                   OP_SUB = 4'd1,
                   OP_AND = 4'd2,
                   OP_OR  = 4'd3,
                   OP_XOR = 4'd4,
                   OP_SLT = 4'd5,
                   OP_SLL = 4'd6,
                   OP_SRL = 4'd7;

  // 組合運算
  always @(*) begin
    case (alu_op)
      OP_ADD: result = a + b;
      OP_SUB: result = a - b;
      OP_AND: result = a & b;
      OP_OR:  result = a | b;
      OP_XOR: result = a ^ b;
      OP_SLT: result = ($signed(a) < $signed(b)) ? 32'd1 : 32'd0;
      OP_SLL: result = a << b[4:0];
      OP_SRL: result = a >> b[4:0];  // 邏輯右移，補零
      default: result = 32'd0;
    endcase
  end

  // 零旗標：beq/bne 比較用
  assign zero = (result == 32'd0);
endmodule
