// forwarding.v — EX 階段資料前遞：新值優先 MEM（EX/MEM），其次 WB（MEM/WB）
// fwd 編碼：00=暫存器讀值 01=WB 寫回值 10=MEM 階段值（ALU 結果或載入資料）
module forwarding (
  input  wire [4:0] ex_rs1,
  input  wire [4:0] ex_rs2,
  input  wire       mem_reg_write,
  input  wire [4:0] mem_rd,
  input  wire       wb_reg_write,
  input  wire [4:0] wb_rd,
  output reg  [1:0] fwd_a,
  output reg  [1:0] fwd_b
);
  always @(*) begin
    fwd_a = 2'b00;
    fwd_b = 2'b00;
    // MEM 優先（較新的指令）
    if (mem_reg_write && mem_rd != 5'd0 && mem_rd == ex_rs1) fwd_a = 2'b10;
    else if (wb_reg_write && wb_rd != 5'd0 && wb_rd == ex_rs1) fwd_a = 2'b01;
    if (mem_reg_write && mem_rd != 5'd0 && mem_rd == ex_rs2) fwd_b = 2'b10;
    else if (wb_reg_write && wb_rd != 5'd0 && wb_rd == ex_rs2) fwd_b = 2'b01;
  end
endmodule
