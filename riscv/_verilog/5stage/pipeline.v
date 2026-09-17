// pipeline.v — RV32I 五階段管線處理器頂層
// IF（取指）/ ID（解碼讀暫存器）/ EX（ALU＋分支解決）/ MEM（存取）/ WB（寫回）
// 控制冒險：靜態預測 not-taken，分支/JAL/JALR 在 EX 解決，taken 即沖掉 IF/ID 與 ID/EX（2 bubble）
// 資料冒險：EX forwarding（MEM、WB）＋ load-use stall 一拍；regfile 另有寫優先旁路
// 支援 RV32I 全部整數指令；FENCE 視為 NOP；ECALL 到 MEM 即 halted 鎖定（供 testbench 結束）。
// 指令記憶體 256 字（prog.hex），資料記憶體 1024 位元組小端序。
module pipeline (
  input  wire clk,
  input  wire rst,      // 同步高位有效重置：PC 歸零、管線清空、halted 清除
  output reg  halted
);
  parameter HEX = "prog.hex";
  localparam NOP = 32'h00000013; // addi x0, x0, 0

  reg [31:0] imem [0:255];
  reg [7:0]  dmem [0:1023];
  reg [31:0] pc;

  // 跨階段訊號宣告集中於此（例化與 always 位置不影響模擬；
  // 集中宣告可消 iverilog -Wall 的使用早於宣告提示）
  reg [4:0]  ex_mem_rd, mem_wb_rd;
  reg        ex_mem_reg_write;
  wire [31:0] wb_data;
  wire        wb_reg_write;

  integer m;
  initial begin
    for (m = 0; m < 256; m = m + 1) imem[m] = 32'd0;
    $readmemh(HEX, imem);
    for (m = 0; m < 1024; m = m + 1) dmem[m] = 8'd0;
    pc = 32'd0;
    halted = 1'b0;
  end

  // ================= IF =================
  wire [31:0] if_instr = imem[pc[9:2]];

  // ================= IF/ID =================
  reg [31:0] if_id_pc, if_id_instr;
  wire [4:0] id_rs1 = if_id_instr[19:15];
  wire [4:0] id_rs2 = if_id_instr[24:20];
  wire [4:0] id_rd  = if_id_instr[11:7];
  wire [6:0] id_op  = if_id_instr[6:0];
  wire [2:0] id_f3  = if_id_instr[14:12];
  wire id_uses_rs1 = (id_op == 7'b0010011) || (id_op == 7'b0110011) ||
                     (id_op == 7'b0000011) || (id_op == 7'b0100011) ||
                     (id_op == 7'b1100011) || (id_op == 7'b1100111);
  wire id_uses_rs2 = (id_op == 7'b0110011) || (id_op == 7'b0100011) ||
                     (id_op == 7'b1100011);

  // ================= ID =================
  wire id_reg_write, id_alu_src_b, id_alu_a_pc, id_alu_a_zero;
  wire id_mem_read, id_mem_write, id_mem_to_reg;
  wire id_branch, id_jump, id_is_jalr, id_wb_pc4, id_is_ecall;
  wire [3:0] id_alu_op;
  control ctrl (
    .opcode(id_op), .funct3(id_f3), .funct7b5(if_id_instr[30]),
    .reg_write(id_reg_write), .alu_src_b(id_alu_src_b), .alu_a_pc(id_alu_a_pc),
    .alu_a_zero(id_alu_a_zero), .mem_read(id_mem_read), .mem_write(id_mem_write),
    .mem_to_reg(id_mem_to_reg), .branch(id_branch), .jump(id_jump),
    .is_jalr(id_is_jalr), .wb_pc4(id_wb_pc4), .is_ecall(id_is_ecall),
    .alu_op(id_alu_op)
  );
  wire [31:0] id_imm;
  immgen ig (.instr(if_id_instr), .imm(id_imm));
  // regfile 寫回埠接 WB 訊號（宣告見頂層）
  wire [31:0] id_rs1_data, id_rs2_data;
  regfile rf (
    .clk(clk), .we(wb_reg_write & ~halted),
    .ra1(id_rs1), .ra2(id_rs2), .wa(mem_wb_rd), .wd(wb_data),
    .rd1(id_rs1_data), .rd2(id_rs2_data)
  );

  // ================= ID/EX =================
  reg [31:0] id_ex_pc, id_ex_rs1, id_ex_rs2, id_ex_imm;
  reg [4:0]  id_ex_rs1n, id_ex_rs2n, id_ex_rd;
  reg [2:0]  id_ex_f3;
  reg        id_ex_reg_write, id_ex_alu_src_b, id_ex_alu_a_pc, id_ex_alu_a_zero;
  reg        id_ex_mem_read, id_ex_mem_write, id_ex_mem_to_reg;
  reg        id_ex_branch, id_ex_jump, id_ex_is_jalr, id_ex_wb_pc4, id_ex_is_ecall;
  reg [3:0]  id_ex_alu_op;

  // ================= EX =================
  wire [1:0] fwd_a, fwd_b;
  forwarding fwd (
    .ex_rs1(id_ex_rs1n), .ex_rs2(id_ex_rs2n),
    .mem_reg_write(ex_mem_reg_write), .mem_rd(ex_mem_rd),
    .wb_reg_write(wb_reg_write), .wb_rd(mem_wb_rd),
    .fwd_a(fwd_a), .fwd_b(fwd_b)
  );
  // MEM 階段前遞值：Load 取記憶體讀出，否則取 ALU 結果
  wire [31:0] mem_fwd_data = ex_mem_mem_to_reg ? mem_rdata : ex_mem_alu;
  wire [31:0] ex_rs1_f = (fwd_a == 2'b10) ? mem_fwd_data :
                         (fwd_a == 2'b01) ? wb_data : id_ex_rs1;
  wire [31:0] ex_rs2_f = (fwd_b == 2'b10) ? mem_fwd_data :
                         (fwd_b == 2'b01) ? wb_data : id_ex_rs2;
  wire [31:0] ex_alu_a = id_ex_alu_a_pc ? id_ex_pc :
                         (id_ex_alu_a_zero ? 32'd0 : ex_rs1_f);
  wire [31:0] ex_alu_b = id_ex_alu_src_b ? id_ex_imm : ex_rs2_f;
  wire [31:0] ex_alu_y;
  alu alu0 (.a(ex_alu_a), .b(ex_alu_b), .op(id_ex_alu_op), .y(ex_alu_y));

  // 分支條件（用前遞後運算元判定）
  reg ex_taken;
  always @(*) begin
    case (id_ex_f3)
      3'b000:  ex_taken = (ex_rs1_f == ex_rs2_f);
      3'b001:  ex_taken = (ex_rs1_f != ex_rs2_f);
      3'b100:  ex_taken = ($signed(ex_rs1_f) < $signed(ex_rs2_f));
      3'b101:  ex_taken = ($signed(ex_rs1_f) >= $signed(ex_rs2_f));
      3'b110:  ex_taken = (ex_rs1_f < ex_rs2_f);
      3'b111:  ex_taken = (ex_rs1_f >= ex_rs2_f);
      default: ex_taken = 1'b0;
    endcase
  end
  wire ex_take = (id_ex_branch & ex_taken) | id_ex_jump;
  wire [31:0] ex_target = id_ex_is_jalr ? ((ex_rs1_f + id_ex_imm) & 32'hFFFFFFFE)
                                        : (id_ex_pc + id_ex_imm);

  wire stall;
  hazard hz (
    .id_ex_mem_read(id_ex_mem_read), .id_ex_rd(id_ex_rd),
    .if_id_rs1(id_rs1), .if_id_rs2(id_rs2),
    .id_uses_rs1(id_uses_rs1), .id_uses_rs2(id_uses_rs2),
    .stall(stall)
  );

  // ================= EX/MEM =================
  reg [31:0] ex_mem_alu, ex_mem_rs2, ex_mem_pc;
  reg [2:0]  ex_mem_f3;
  reg        ex_mem_mem_read, ex_mem_mem_write;
  reg        ex_mem_mem_to_reg, ex_mem_wb_pc4, ex_mem_is_ecall;

  // ================= MEM =================
  wire [31:0] mem_addr = ex_mem_alu;
  wire [31:0] mem_word = {dmem[mem_addr+3], dmem[mem_addr+2],
                          dmem[mem_addr+1], dmem[mem_addr]};
  reg [31:0] mem_rdata;
  always @(*) begin
    case (ex_mem_f3)
      3'b000: mem_rdata = {{24{mem_word[7]}}, mem_word[7:0]};
      3'b001: mem_rdata = {{16{mem_word[15]}}, mem_word[15:0]};
      3'b010: mem_rdata = mem_word;
      3'b100: mem_rdata = {24'd0, mem_word[7:0]};
      3'b101: mem_rdata = {16'd0, mem_word[15:0]};
      default: mem_rdata = mem_word;
    endcase
  end

  // ================= MEM/WB =================
  reg [31:0] mem_wb_alu, mem_wb_rdata, mem_wb_pc;
  reg        mem_wb_reg_write, mem_wb_mem_to_reg, mem_wb_wb_pc4;

  // ================= WB =================
  assign wb_data = mem_wb_wb_pc4 ? (mem_wb_pc + 32'd4) :
                   (mem_wb_mem_to_reg ? mem_wb_rdata : mem_wb_alu);
  assign wb_reg_write = mem_wb_reg_write;

  // ================= PC =================
  wire [31:0] pc_plus4 = pc + 32'd4;
  wire [31:0] pc_next = ex_take ? ex_target : pc_plus4;

  // ================= 時序 =================
  always @(posedge clk) begin
    if (rst) begin
      pc <= 32'd0;
      halted <= 1'b0;
      if_id_pc <= 32'd0; if_id_instr <= NOP;
      id_ex_pc <= 32'd0; id_ex_rs1 <= 32'd0; id_ex_rs2 <= 32'd0;
      id_ex_imm <= 32'd0;
      id_ex_rs1n <= 5'd0; id_ex_rs2n <= 5'd0; id_ex_rd <= 5'd0;
      id_ex_f3 <= 3'd0; id_ex_alu_op <= 4'd0;
      id_ex_reg_write <= 1'b0; id_ex_alu_src_b <= 1'b0;
      id_ex_alu_a_pc <= 1'b0; id_ex_alu_a_zero <= 1'b0;
      id_ex_mem_read <= 1'b0; id_ex_mem_write <= 1'b0;
      id_ex_mem_to_reg <= 1'b0;
      id_ex_branch <= 1'b0; id_ex_jump <= 1'b0; id_ex_is_jalr <= 1'b0;
      id_ex_wb_pc4 <= 1'b0; id_ex_is_ecall <= 1'b0;
      ex_mem_alu <= 32'd0; ex_mem_rs2 <= 32'd0; ex_mem_pc <= 32'd0;
      ex_mem_rd <= 5'd0; ex_mem_f3 <= 3'd0;
      ex_mem_reg_write <= 1'b0; ex_mem_mem_read <= 1'b0;
      ex_mem_mem_write <= 1'b0; ex_mem_mem_to_reg <= 1'b0;
      ex_mem_wb_pc4 <= 1'b0; ex_mem_is_ecall <= 1'b0;
      mem_wb_alu <= 32'd0; mem_wb_rdata <= 32'd0; mem_wb_pc <= 32'd0;
      mem_wb_rd <= 5'd0;
      mem_wb_reg_write <= 1'b0; mem_wb_mem_to_reg <= 1'b0;
      mem_wb_wb_pc4 <= 1'b0;
    end else if (!halted) begin
      // Store：SB / SH / SW
      if (ex_mem_mem_write) begin
        case (ex_mem_f3[1:0])
          2'b00: dmem[mem_addr] <= ex_mem_rs2[7:0];
          2'b01: begin
            dmem[mem_addr]   <= ex_mem_rs2[7:0];
            dmem[mem_addr+1] <= ex_mem_rs2[15:8];
          end
          default: begin
            dmem[mem_addr]   <= ex_mem_rs2[7:0];
            dmem[mem_addr+1] <= ex_mem_rs2[15:8];
            dmem[mem_addr+2] <= ex_mem_rs2[23:16];
            dmem[mem_addr+3] <= ex_mem_rs2[31:24];
          end
        endcase
      end
      // ECALL 到 MEM 即停機；管線凍結，ECALL 之後的殘留指令不再提交
      if (ex_mem_is_ecall) halted <= 1'b1;

      // PC：stall 凍結，否則跳轉目標或 +4
      if (!stall) pc <= pc_next;

      // IF/ID：taken 沖掉，stall 凍結，否則鎖存
      if (ex_take) begin
        if_id_pc <= 32'd0; if_id_instr <= NOP;
      end else if (!stall) begin
        if_id_pc <= pc; if_id_instr <= if_instr;
      end

      // ID/EX：taken 或 stall 塞 bubble，否則鎖存
      if (ex_take || stall) begin
        id_ex_pc <= 32'd0; id_ex_rs1 <= 32'd0; id_ex_rs2 <= 32'd0;
        id_ex_imm <= 32'd0;
        id_ex_rs1n <= 5'd0; id_ex_rs2n <= 5'd0; id_ex_rd <= 5'd0;
        id_ex_f3 <= 3'd0; id_ex_alu_op <= 4'd0;
        id_ex_reg_write <= 1'b0; id_ex_alu_src_b <= 1'b0;
        id_ex_alu_a_pc <= 1'b0; id_ex_alu_a_zero <= 1'b0;
        id_ex_mem_read <= 1'b0; id_ex_mem_write <= 1'b0;
        id_ex_mem_to_reg <= 1'b0;
        id_ex_branch <= 1'b0; id_ex_jump <= 1'b0; id_ex_is_jalr <= 1'b0;
        id_ex_wb_pc4 <= 1'b0; id_ex_is_ecall <= 1'b0;
      end else begin
        id_ex_pc <= if_id_pc;
        id_ex_rs1 <= id_rs1_data; id_ex_rs2 <= id_rs2_data;
        id_ex_imm <= id_imm;
        id_ex_rs1n <= id_rs1; id_ex_rs2n <= id_rs2; id_ex_rd <= id_rd;
        id_ex_f3 <= id_f3; id_ex_alu_op <= id_alu_op;
        id_ex_reg_write <= id_reg_write; id_ex_alu_src_b <= id_alu_src_b;
        id_ex_alu_a_pc <= id_alu_a_pc; id_ex_alu_a_zero <= id_alu_a_zero;
        id_ex_mem_read <= id_mem_read; id_ex_mem_write <= id_mem_write;
        id_ex_mem_to_reg <= id_mem_to_reg;
        id_ex_branch <= id_branch; id_ex_jump <= id_jump;
        id_ex_is_jalr <= id_is_jalr;
        id_ex_wb_pc4 <= id_wb_pc4; id_ex_is_ecall <= id_is_ecall;
      end

      // EX/MEM：鎖存（前遞後的 rs2 供 Store 用）
      ex_mem_alu <= ex_alu_y; ex_mem_rs2 <= ex_rs2_f; ex_mem_pc <= id_ex_pc;
      ex_mem_rd <= id_ex_rd; ex_mem_f3 <= id_ex_f3;
      ex_mem_reg_write <= id_ex_reg_write; ex_mem_mem_read <= id_ex_mem_read;
      ex_mem_mem_write <= id_ex_mem_write;
      ex_mem_mem_to_reg <= id_ex_mem_to_reg;
      ex_mem_wb_pc4 <= id_ex_wb_pc4; ex_mem_is_ecall <= id_ex_is_ecall;

      // MEM/WB：鎖存
      mem_wb_alu <= ex_mem_alu; mem_wb_rdata <= mem_rdata;
      mem_wb_pc <= ex_mem_pc;
      mem_wb_rd <= ex_mem_rd;
      mem_wb_reg_write <= ex_mem_reg_write;
      mem_wb_mem_to_reg <= ex_mem_mem_to_reg;
      mem_wb_wb_pc4 <= ex_mem_wb_pc4;
    end
  end
endmodule
