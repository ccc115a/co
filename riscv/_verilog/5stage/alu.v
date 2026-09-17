// alu.v — RV32I 算術邏輯單元（純組合邏輯）
// op 編碼：0=ADD 1=SUB 2=AND 3=OR 4=XOR 5=SLL 6=SRL 7=SRA 8=SLT 9=SLTU
module alu (
  input  wire [31:0] a,
  input  wire [31:0] b,
  input  wire [3:0]  op,
  output reg  [31:0] y
);
  always @(*) begin
    case (op)
      4'd0: y = a + b;
      4'd1: y = a - b;
      4'd2: y = a & b;
      4'd3: y = a | b;
      4'd4: y = a ^ b;
      4'd5: y = a << b[4:0];
      4'd6: y = a >> b[4:0];
      4'd7: y = $signed(a) >>> b[4:0];
      4'd8: y = ($signed(a) < $signed(b)) ? 32'd1 : 32'd0;
      4'd9: y = (a < b) ? 32'd1 : 32'd0;
      default: y = 32'd0;
    endcase
  end
endmodule
