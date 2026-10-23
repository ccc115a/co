// 四位元 ALU：op 選擇運算（0=加、1=減、2=AND、3=OR、4=XOR、5=左移、6=右移、7=取反）
module alu4(
  input  wire [3:0] a,
  input  wire [3:0] b,
  input  wire [2:0] op,
  output reg  [3:0] y,
  output wire       zero
);
  always @(*) begin
    case (op)
      3'd0: y = a + b;
      3'd1: y = a - b;
      3'd2: y = a & b;
      3'd3: y = a | b;
      3'd4: y = a ^ b;
      3'd5: y = a << 1;
      3'd6: y = a >> 1;
      3'd7: y = ~a;
    endcase
  end
  assign zero = (y == 4'd0);
endmodule
