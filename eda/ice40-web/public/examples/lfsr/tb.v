`timescale 1ns/1ps
module tb;
  reg clk = 0, rst = 1; wire [7:0] q;
  top dut(.clk(clk), .rst(rst), .q(q));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("wave.vcd"); $dumpvars(0, tb);
    #22 rst = 0;
    #2600 $display("q=%h", q);
    $finish;
  end
endmodule
