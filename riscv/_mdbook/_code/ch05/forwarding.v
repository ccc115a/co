// forwarding.v：EX 級轉發單元（對應 5.3 資料冒險解法）
// 比較 EX 級來源暫存器與後級目的暫存器，選擇 ALU 運算元來源：
// 2'b00=暫存器堆，2'b10=EX/MEM（新值優先），2'b01=MEM/WB
`timescale 1ns/1ps
module forwarding (
  input  wire       mem_regwrite,  // MEM 級是否寫回
  input  wire       wb_regwrite,   // WB 級是否寫回
  input  wire [4:0] mem_rd,        // MEM 級目的暫存器
  input  wire [4:0] wb_rd,         // WB 級目的暫存器
  input  wire [4:0] ex_rs1,        // EX 級來源 1
  input  wire [4:0] ex_rs2,        // EX 級來源 2
  output reg  [1:0] forward_a,     // ALU 左運算元選擇
  output reg  [1:0] forward_b      // ALU 右運算元選擇
);
  // rs1 轉發決策：MEM（新值）優先於 WB（舊值），x0 永不轉發
  always @(*) begin
    if (mem_regwrite && (mem_rd != 5'd0) && (mem_rd == ex_rs1))
      forward_a = 2'b10;
    else if (wb_regwrite && (wb_rd != 5'd0) && (wb_rd == ex_rs1))
      forward_a = 2'b01;
    else
      forward_a = 2'b00;
  end

  // rs2 轉發決策（同上）
  always @(*) begin
    if (mem_regwrite && (mem_rd != 5'd0) && (mem_rd == ex_rs2))
      forward_b = 2'b10;
    else if (wb_regwrite && (wb_rd != 5'd0) && (wb_rd == ex_rs2))
      forward_b = 2'b01;
    else
      forward_b = 2'b00;
  end
endmodule
