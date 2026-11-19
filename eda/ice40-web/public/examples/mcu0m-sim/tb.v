`timescale 1ns/1ps
module main;
reg clock;
cpu cpux(clock);
initial clock = 0;
always #10 clock=~clock;
initial begin $dumpfile("wave.vcd"); $dumpvars(0, main); end
initial #2000 $finish;
endmodule
