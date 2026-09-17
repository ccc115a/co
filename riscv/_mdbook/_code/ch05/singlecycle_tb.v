// singlecycle_tb.v：單週期核心 + 轉發單元自檢 testbench
// 跑內建小程式（加法+存取+分支），用 $display 印暫存器並以 if 判 PASS/FAIL
`timescale 1ns/1ps
module singlecycle_tb;
  reg clk = 0;
  reg rst_n = 0;

  // 待測核心
  wire [31:0] pc;
  singlecycle dut (.clk(clk), .rst_n(rst_n), .pc_o(pc));

  // 轉發單元抽檢（5.3 決策表：MEM 新值優先於 WB 舊值，x0 不轉發）
  reg        mem_rw, wb_rw;
  reg  [4:0] mem_rd, wb_rd, ex_rs1, ex_rs2;
  wire [1:0] fwd_a, fwd_b;
  forwarding u_fwd (.mem_regwrite(mem_rw), .wb_regwrite(wb_rw),
                   .mem_rd(mem_rd), .wb_rd(wb_rd),
                   .ex_rs1(ex_rs1), .ex_rs2(ex_rs2),
                   .forward_a(fwd_a), .forward_b(fwd_b));

  always #5 clk = ~clk;  // 10ns 週期

  integer fail = 0;

  // 檢查暫存器巨集：印實際值，不符記 fail
  task check_reg;
    input [4:0] idx;
    input [31:0] expect;
    begin
      $display("x%0d = %0d (expect %0d)", idx, dut.u_rf.rf[idx], expect);
      if (dut.u_rf.rf[idx] !== expect) fail = fail + 1;
    end
  endtask

  initial begin
    #12 rst_n = 1;        // 放開重置
    repeat (16) @(posedge clk);  // 11 條指令跑完，多留週期排空
    #1;

    // 核心結果檢查
    check_reg(1, 32'd10);
    check_reg(2, 32'd20);
    check_reg(3, 32'd30);
    check_reg(4, 32'd30);
    check_reg(5, 32'd99);   // 取決於 beq 跳過 24 號指令
    check_reg(6, 32'd7);
    check_reg(7, 32'd8);
    $display("dmem[0] = %0d (expect 30)", dut.dmem[0]);
    if (dut.dmem[0] !== 32'd30) fail = fail + 1;

    // 轉發單元抽檢三組向量
    mem_rw = 1; wb_rw = 1; mem_rd = 5'd3; wb_rd = 5'd3;
    ex_rs1 = 5'd3; ex_rs2 = 5'd9; #1;
    $display("fwd_a=%b (expect 10), fwd_b=%b (expect 00)", fwd_a, fwd_b);
    if (fwd_a !== 2'b10) fail = fail + 1;
    if (fwd_b !== 2'b00) fail = fail + 1;

    mem_rw = 0; wb_rw = 1; mem_rd = 5'd0; wb_rd = 5'd9;
    ex_rs1 = 5'd1; ex_rs2 = 5'd9; #1;
    $display("fwd_a=%b (expect 00), fwd_b=%b (expect 01)", fwd_a, fwd_b);
    if (fwd_a !== 2'b00) fail = fail + 1;
    if (fwd_b !== 2'b01) fail = fail + 1;

    mem_rw = 1; wb_rw = 1; mem_rd = 5'd0; wb_rd = 5'd0;
    ex_rs1 = 5'd0; ex_rs2 = 5'd0; #1;  // x0 永不轉發
    $display("fwd_a=%b (expect 00), fwd_b=%b (expect 00)", fwd_a, fwd_b);
    if (fwd_a !== 2'b00) fail = fail + 1;
    if (fwd_b !== 2'b00) fail = fail + 1;

    if (fail == 0) $display("PASS");
    else $display("FAIL (%0d errors)", fail);
    $finish;
  end
endmodule
