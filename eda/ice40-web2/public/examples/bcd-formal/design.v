// A BCD counter (counts 0..9 and wraps) with a bug, and a formal property that catches it.
// 1. Enable "Formal", mode bmc, press Run: the solver finds a counterexample; open the Formal tab to see it as a waveform.
// 2. Fix the bug: change 10 to 9 below, switch the mode to prove, Run again: the property is proven for all time.
module bcd(input clk, input en, output reg [3:0] count = 0);
  always @(posedge clk)
    if (en) count <= (count == 10) ? 4'd0 : count + 4'd1;     // BUG: should wrap after 9

`ifdef FORMAL
  always @* assert(count <= 9);                  // a BCD digit is never above 9
  always @(posedge clk) cover($past(count) == 9 && count == 0 && en);   // wrapping from 9 to 0 is possible
`endif
endmodule
