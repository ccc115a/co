module top(input clk, input rst, output reg [7:0] q);
  // x^8 + x^6 + x^5 + x^4 + 1, maximal length
  wire fb = q[7] ^ q[5] ^ q[4] ^ q[3];
  always @(posedge clk) q <= rst ? 8'h01 : {q[6:0], fb};
endmodule
