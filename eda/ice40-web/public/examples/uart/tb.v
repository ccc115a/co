`timescale 1ns/1ps
module tb;
  reg clk = 0, start = 0; reg [7:0] data = 8'h41; wire tx, busy;
  uart_tx #(.CLKS_PER_BIT(4)) dut(.clk(clk), .start(start), .data(data), .tx(tx), .busy(busy));
  always #5 clk = ~clk;
  reg [7:0] rx; integer i;
  initial begin
    $dumpfile("wave.vcd"); $dumpvars(0, tb);
    repeat (3) @(posedge clk);
    start <= 1; @(posedge clk); start <= 0;
    @(negedge tx);                       // start bit
    repeat (6) @(posedge clk);           // 1.5 bit times: middle of D0
    for (i = 0; i < 8; i = i + 1) begin rx[i] = tx; repeat (4) @(posedge clk); end
    $display("received 0x%02x '%c' -> %s", rx, rx, rx == 8'h41 ? "PASS" : "FAIL");
    repeat (20) @(posedge clk);
    $finish;
  end
endmodule
