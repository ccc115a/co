// 8 位元計數器：en=1 時每個時脈上升緣加一
module counter(
  input wire clk,
  input wire en,
  output reg [7:0] count
);
  always @(posedge clk) begin
    if (en) count <= count + 1'b1;
  end
endmodule
