// riscvgpu_test.v — 4 通道 SPMD GPU 向量加法自檢
// 跑 prog.hex（由 prog.s 經 cli/rvasm.js 產生），等 done 後檢查：
//   lane0 a0 = 0（lane0 迴圈驗證錯誤數）、C[0..7] = 11*(i+1)、A/B 陣列、4 通道皆 halted。
// 用法：iverilog -o sim riscvgpu_test.v riscvgpu.v lane.v alu.v control.v immgen.v regfile.v && vvp sim
`timescale 1ns/1ps
module riscvgpu_test;
  reg clk = 1'b0;
  reg rst = 1'b1;
  wire done;
  wire [3:0] lanes_halted;
  wire [31:0] dbg_a0;

  riscvgpu #(.NUM_LANES(4)) dut (
    .clk(clk), .rst(rst), .done(done),
    .lanes_halted(lanes_halted), .dbg_a0(dbg_a0)
  );

  always #5 clk = ~clk; // 10ns 週期

  integer errors;
  integer cycles;
  integer i;

  function [31:0] mem_word;
    input [31:0] addr;
    begin
      mem_word = {dut.dmem[addr+3], dut.dmem[addr+2],
                  dut.dmem[addr+1], dut.dmem[addr]};
    end
  endfunction

  initial begin
    errors = 0;
    repeat (2) @(posedge clk);
    rst = 1'b0;
    cycles = 0;
    while (!done && cycles < 2000) begin
      @(posedge clk);
      cycles = cycles + 1;
    end
    if (!done) begin
      $display("FAIL: 2000 週期內未 done（halted=%b）", lanes_halted);
      $finish;
    end
    $display("done at cycle %0d, lanes_halted=%b", cycles, lanes_halted);

    // lane0 迴圈驗證：錯誤數應為 0
    if (dbg_a0 !== 32'd0) begin
      $display("FAIL: lane0 a0 = %0d（錯誤數），預期 0", dbg_a0);
      errors = errors + 1;
    end
    // 4 通道皆 halted
    if (lanes_halted !== 4'b1111) begin
      $display("FAIL: lanes_halted = %b，預期 1111", lanes_halted);
      errors = errors + 1;
    end
    // A[i]=i+1、B[i]=10*(i+1)、C[i]=11*(i+1)
    for (i = 0; i < 8; i = i + 1) begin
      if (mem_word(32'h100 + i*4) !== (i + 1)) begin
        $display("FAIL: A[%0d] = %0d，預期 %0d", i, mem_word(32'h100+i*4), i+1);
        errors = errors + 1;
      end
      if (mem_word(32'h120 + i*4) !== (10*(i + 1))) begin
        $display("FAIL: B[%0d] = %0d，預期 %0d", i, mem_word(32'h120+i*4), 10*(i+1));
        errors = errors + 1;
      end
      if (mem_word(32'h140 + i*4) !== (11*(i + 1))) begin
        $display("FAIL: C[%0d] = %0d，預期 %0d", i, mem_word(32'h140+i*4), 11*(i+1));
        errors = errors + 1;
      end
    end

    if (errors == 0) $display("PASS: 向量加法全對（C=11,22,..,88，a0=0）");
    else $display("FAIL: %0d 項不符", errors);
    $finish;
  end
endmodule
