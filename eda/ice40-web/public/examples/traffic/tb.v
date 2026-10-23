`timescale 1ns/1ps
module tb;
  reg clk = 0; wire red, yellow, green;
  traffic #(.TICK(2)) dut(.clk(clk), .red(red), .yellow(yellow), .green(green));  // 1 tick = 2 clocks
  always #5 clk = ~clk;
  initial begin
    $dumpfile("wave.vcd"); $dumpvars(0, tb);
    $timeformat(-9, 0, " ns", 6);
    $monitor("%0t  R=%b Y=%b G=%b", $time, red, yellow, green);
    #450 $finish;
  end
endmodule
