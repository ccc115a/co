// pipeline_test.v — RV32I 五階段管線處理器功能測試
// 跑 prog.hex（由 prog.s 經 cli/rvasm.js 產生），等 halted 後對拍暫存器與記憶體。
// golden 由 node cli/rvemu.js prog.s 取得：exit=0、steps=68。
// 管線排空需額外週期，timeout 設 2000 週期。
// 用法：iverilog -o sim pipeline_test.v pipeline.v alu.v control.v immgen.v regfile.v forwarding.v hazard.v && vvp sim
`timescale 1ns/1ps
module pipeline_test;
  reg clk = 1'b0;
  reg rst = 1'b1;
  wire halted;

  pipeline dut (.clk(clk), .rst(rst), .halted(halted));

  always #5 clk = ~clk; // 10ns 週期

  integer errors;
  integer cycles;

  task check_reg;
    input [4:0] idx;
    input [31:0] expect;
    begin
      if (dut.rf.regs[idx] !== expect) begin
        $display("FAIL: x%0d = 0x%08h, 預期 0x%08h", idx, dut.rf.regs[idx], expect);
        errors = errors + 1;
      end
    end
  endtask

  function [31:0] mem_word;
    input [31:0] addr;
    begin
      mem_word = {dut.dmem[addr+3], dut.dmem[addr+2],
                  dut.dmem[addr+1], dut.dmem[addr]};
    end
  endfunction

  initial begin
    errors = 0;
    // 重置兩個週期後放開
    repeat (2) @(posedge clk);
    rst = 1'b0;
    // 等 halted，最多 2000 週期（prog.s golden 為 68 步＋管線排空）
    cycles = 0;
    while (!halted && cycles < 2000) begin
      @(posedge clk);
      cycles = cycles + 1;
    end
    if (!halted) begin
      $display("FAIL: 2000 週期內未 halted（ecall 未執行？）");
      $finish;
    end
    $display("halted at cycle %0d, pc=0x%08h", cycles, dut.pc);

    // --- 對拍（golden：rvemu 跑 prog.s） ---
    check_reg(5, 32'h00000005); // t0（forwarding 鏈源頭）
    check_reg(6, 32'h00000007); // t1
    check_reg(7, 32'h00000001); // t2（SLTI 重用後）
    check_reg(8, 32'h00000000); // s0（SLTIU 重用後）
    check_reg(9, 32'h00000000); // s1（XOR 自身）
    check_reg(10, 32'h00000000); // a0 = exit code 0
    check_reg(11, 32'haabbccdd); // a1（LW）
    check_reg(12, 32'h557799ba); // a2（load-use：2*a1 低 32 位）
    check_reg(13, 32'h557799ba); // a3（store 前遞資料回讀）
    check_reg(14, 32'h000000dd); // a4（LBU=221）
    check_reg(15, 32'hffffffdd); // a5（LB=-35）
    check_reg(16, 32'h00000010); // a6 = 16（6 分支 taken + JAL 子程式 10）
    check_reg(17, 32'h0000000a); // a7 = 10（ecall exit）
    check_reg(18, 32'h00000007); // s2（OR）
    check_reg(19, 32'h00000005); // s3（AND）
    check_reg(20, 32'h00000280); // s4（SLL=640）
    check_reg(21, 32'h00000000); // s5（SRL）
    check_reg(22, 32'h00000001); // s6（SLT）
    check_reg(23, 32'h00000000); // s7（SLTU）
    check_reg(24, 32'h000000c8); // s8 = 200（MEM/WB 前遞）
    check_reg(25, 32'h0000077f); // s9 = 0x77F
    check_reg(26, 32'h12345000); // s10（LUI）
    check_reg(27, 32'h00000068); // s11（AUIPC 取本條 PC）
    check_reg(28, 32'h000000ef); // t3（SRLI 重用後）
    check_reg(29, 32'h00000000); // t4（SRAI 重用後）
    check_reg(30, 32'h00000200); // t5（基址，li 重用後）
    check_reg(31, 32'haabbccdd); // t6（li 重用後）
    check_reg(1, 32'h00000118); // ra（JAL/JALR 連結位址）
    check_reg(0, 32'h00000000); // x0 恆零
    check_reg(2, 32'h00000000); // sp 未用
    check_reg(3, 32'h00000000); // gp 未用
    check_reg(4, 32'h00000000); // tp 未用

    // 記憶體：0x200 放 SW 的字，0x204 放前遞 store 的字，0x208 起 SB/SH 混寫
    if (mem_word(32'h00000200) !== 32'haabbccdd) begin
      $display("FAIL: mem[0x200] = 0x%08h, 預期 0xaabbccdd", mem_word(32'h00000200));
      errors = errors + 1;
    end
    if (mem_word(32'h00000204) !== 32'h557799ba) begin
      $display("FAIL: mem[0x204] = 0x%08h, 預期 0x557799ba", mem_word(32'h00000204));
      errors = errors + 1;
    end
    if (mem_word(32'h00000208) !== 32'hccdd00dd) begin
      $display("FAIL: mem[0x208] = 0x%08h, 預期 0xccdd00dd", mem_word(32'h00000208));
      errors = errors + 1;
    end

    if (errors == 0) $display("PASS: prog.s 全對（a0=0, a6=16, a2=0x557799ba）");
    else $display("FAIL: %0d 項不符", errors);
    $finish;
  end
endmodule
