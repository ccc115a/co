// tiny_core_tb.v：三階迷你核心自檢 testbench
// 跑內建小程式並以 if 判 PASS/FAIL
`timescale 1ns/1ps
module tiny_core_tb;
  reg clk = 0;
  reg rst_n = 0;

  wire [31:0] pc;
  tiny_core dut (.clk(clk), .rst_n(rst_n), .pc_o(pc));

  always #5 clk = ~clk;  // 10ns 週期

  integer fail = 0;

  task check_reg;
    input [4:0] idx;
    input [31:0] expect;
    begin
      $display("x%0d = %0d (expect %0d)", idx, dut.rf[idx], expect);
      if (dut.rf[idx] !== expect) fail = fail + 1;
    end
  endtask

  initial begin
    #12 rst_n = 1;                  // 放開重置
    repeat (24) @(posedge clk);     // 12 條指令流過三階管線
    #1;
    check_reg(1, 32'd10);
    check_reg(2, 32'd20);
    check_reg(3, 32'd30);
    check_reg(4, 32'd30);
    check_reg(5, 32'd99);           // 取決於 beq 跳轉＋延遲槽
    $display("dmem[0] = %0d (expect 30)", dut.dmem[0]);
    if (dut.dmem[0] !== 32'd30) fail = fail + 1;
    if (fail == 0) $display("PASS");
    else $display("FAIL (%0d errors)", fail);
    $finish;
  end
endmodule
