`timescale 1ns/1ps
module tb;
  reg clk = 0; wire [3:0] led;
  top dut(.clk(clk), .led(led));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("wave.vcd"); $dumpvars(0, tb);
    #2000 $display("c=%0d", dut.c);
    $finish;
  end
endmodule
