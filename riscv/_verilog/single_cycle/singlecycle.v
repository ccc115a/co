// singlecycle.v — RV32I 單週期處理器頂層
// 支援 RV32I 全部整數指令；FENCE 視為 NOP；ECALL/EBREAK 使 halted 鎖定為 1（供 testbench 結束模擬）。
// 指令記憶體 256 字（1KB，從 prog.hex 載入），資料記憶體 1024 位元組，小端序。
module singlecycle (
  input  wire clk,
  input  wire rst,      // 同步高位有效重置：PC 歸零、halted 清除
  output reg  halted
);
  // ---- 指令記憶體（唯讀，模擬時由 prog.hex 載入） ----
  reg [31:0] imem [0:255];
  // ---- 資料記憶體（位元組定址，小端序） ----
  reg [7:0] dmem [0:1023];

  // ---- PC ----
  reg [31:0] pc;

  // ---- 模擬載入：imem 由 prog.hex 載入，dmem/PC/halted 歸零 ----
  parameter HEX = "prog.hex";
  integer m;
  initial begin
    $readmemh(HEX, imem);
    pc = 32'd0;
    halted = 1'b0;
    for (m = 0; m < 1024; m = m + 1) dmem[m] = 8'd0;
  end

  // ---- 取指 ----
  wire [31:0] instr = imem[pc[9:2]];
  wire [6:0] opcode = instr[6:0];
  wire [4:0] rd  = instr[11:7];
  wire [2:0] funct3 = instr[14:12];
  wire [4:0] rs1 = instr[19:15];
  wire [4:0] rs2 = instr[24:20];

  // ---- 控制 ----
  wire reg_write, alu_src_b, alu_a_pc, alu_a_zero;
  wire mem_read, mem_write, mem_to_reg;
  wire branch, jump, is_jalr, wb_pc4, is_ecall;
  wire [3:0] alu_op;
  control ctrl (
    .opcode(opcode), .funct3(funct3), .funct7b5(instr[30]),
    .reg_write(reg_write), .alu_src_b(alu_src_b), .alu_a_pc(alu_a_pc),
    .alu_a_zero(alu_a_zero), .mem_read(mem_read), .mem_write(mem_write),
    .mem_to_reg(mem_to_reg), .branch(branch), .jump(jump), .is_jalr(is_jalr),
    .wb_pc4(wb_pc4), .is_ecall(is_ecall), .alu_op(alu_op)
  );

  // ---- 暫存器檔 ----
  wire [31:0] rs1_data, rs2_data;
  wire [31:0] wb_data;
  regfile rf (
    .clk(clk), .we(reg_write & ~halted),
    .ra1(rs1), .ra2(rs2), .wa(rd), .wd(wb_data),
    .rd1(rs1_data), .rd2(rs2_data)
  );

  // ---- 立即數 ----
  wire [31:0] imm;
  immgen ig (.instr(instr), .imm(imm));

  // ---- ALU ----
  wire [31:0] alu_a = alu_a_pc ? pc : (alu_a_zero ? 32'd0 : rs1_data);
  wire [31:0] alu_b = alu_src_b ? imm : rs2_data;
  wire [31:0] alu_y;
  alu alu0 (.a(alu_a), .b(alu_b), .op(alu_op), .y(alu_y));

  // ---- 分支條件判定 ----
  reg branch_taken;
  always @(*) begin
    case (funct3)
      3'b000:  branch_taken = (rs1_data == rs2_data);                 // BEQ
      3'b001:  branch_taken = (rs1_data != rs2_data);                 // BNE
      3'b100:  branch_taken = ($signed(rs1_data) < $signed(rs2_data)); // BLT
      3'b101:  branch_taken = ($signed(rs1_data) >= $signed(rs2_data)); // BGE
      3'b110:  branch_taken = (rs1_data < rs2_data);                  // BLTU
      3'b111:  branch_taken = (rs1_data >= rs2_data);                 // BGEU
      default: branch_taken = 1'b0;
    endcase
  end

  // ---- 資料記憶體讀（組合讀出，小端序組字） ----
  wire [31:0] mem_addr = alu_y;
  wire [31:0] mem_word = {dmem[mem_addr+3], dmem[mem_addr+2],
                          dmem[mem_addr+1], dmem[mem_addr]};
  reg [31:0] load_data;
  always @(*) begin
    case (funct3)
      3'b000: load_data = {{24{mem_word[7]}}, mem_word[7:0]};   // LB
      3'b001: load_data = {{16{mem_word[15]}}, mem_word[15:0]}; // LH
      3'b010: load_data = mem_word;                             // LW
      3'b100: load_data = {24'd0, mem_word[7:0]};               // LBU
      3'b101: load_data = {16'd0, mem_word[15:0]};              // LHU
      default: load_data = mem_word;
    endcase
  end

  // ---- 寫回選擇 ----
  wire [31:0] pc_plus4 = pc + 32'd4;
  assign wb_data = wb_pc4 ? pc_plus4 : (mem_to_reg ? load_data : alu_y);

  // ---- 下一 PC ----
  wire [31:0] jalr_target = (rs1_data + imm) & 32'hFFFFFFFE;
  wire [31:0] pc_next = jump ? (is_jalr ? jalr_target : pc + imm)
                             : ((branch & branch_taken) ? pc + imm : pc_plus4);

  // ---- 時序：PC、資料記憶體寫、halted ----
  integer k;
  always @(posedge clk) begin
    if (rst) begin
      pc <= 32'd0;
      halted <= 1'b0;
    end else if (!halted) begin
      // Store：SB / SH / SW（位元組致能）
      if (mem_write) begin
        case (funct3[1:0])
          2'b00: dmem[mem_addr] <= rs2_data[7:0]; // SB
          2'b01: begin // SH
            dmem[mem_addr]   <= rs2_data[7:0];
            dmem[mem_addr+1] <= rs2_data[15:8];
          end
          default: begin // SW（funct3 = 010）
            dmem[mem_addr]   <= rs2_data[7:0];
            dmem[mem_addr+1] <= rs2_data[15:8];
            dmem[mem_addr+2] <= rs2_data[23:16];
            dmem[mem_addr+3] <= rs2_data[31:24];
          end
        endcase
      end
      if (is_ecall) halted <= 1'b1;
      pc <= pc_next;
    end
  end
endmodule
