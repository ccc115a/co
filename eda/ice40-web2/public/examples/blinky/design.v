module top(input clk, output [3:0] led);
  reg [25:0] c = 0;
  always @(posedge clk) c <= c + 1;
  assign led = c[25:22];
endmodule
