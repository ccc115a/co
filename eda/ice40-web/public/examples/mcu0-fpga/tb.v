`timescale 1ns/1ps
module tb;
  reg clk = 0; wire [7:0] out; wire [15:0] pc;
  mcu0 dut(.clk(clk), .ce(1'b1), .out(out), .PC(pc));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("wave.vcd"); $dumpvars(0, tb);
    #2000;
    $display("SUM = %0d (expect 55) -> %s", {dut.m[20], dut.m[21]}, {dut.m[20], dut.m[21]} == 16'd55 ? "PASS" : "FAIL");
    $finish;
  end
endmodule
