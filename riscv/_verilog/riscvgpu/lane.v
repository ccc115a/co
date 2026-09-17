// lane.v — riscvgpu 純量通道：單週期 RV32I ＋ custom-0 擴充
// custom-0（opcode 0001011）：funct3=000 TID（rd=通道號）、001 NTID（rd=通道數）、
//   010 BARRIER（停住 PC，直到頂層 barrier_release 生效）。
// 指令由頂層共享 IMEM 依 pc 餵入；資料存取走頂層共享 DMEM（mem_* 埠）。
// ECALL 使本通道 halted 鎖定；x0 恆零。
module lane #(
  parameter LANE_ID   = 0,
  parameter NUM_LANES = 4
)(
  input  wire        clk,
  input  wire        rst,
  input  wire [31:0] instr,            // 共享 IMEM 取出的指令
  input  wire [31:0] mem_rdata,        // 頂層組好的 32 位讀出字
  input  wire        barrier_release,  // 頂層：全部未停通道皆到 barrier
  output reg  [31:0] pc,
  output reg         halted,
  output wire [31:0] mem_addr,
  output wire [31:0] mem_wdata,
  output wire        mem_we,
  output wire [2:0]  mem_funct3,
  output wire        is_barrier,       // 目前指令是 BARRIER 且等待中
  output wire [31:0] dbg_a0            // a0 除錯輸出
);
  initial begin
    pc = 32'd0;
    halted = 1'b0;
  end

  wire [6:0] opcode = instr[6:0];
  wire [4:0] rd  = instr[11:7];
  wire [2:0] funct3 = instr[14:12];
  wire [4:0] rs1 = instr[19:15];
  wire [4:0] rs2 = instr[24:20];

  // ---- custom-0 解碼（不經 control.v，直接在此處理） ----
  wire is_custom = (opcode == 7'b0001011);
  wire is_tid    = is_custom & (funct3 == 3'b000);
  wire is_ntid   = is_custom & (funct3 == 3'b001);
  wire is_bar    = is_custom & (funct3 == 3'b010);
  assign is_barrier = is_bar & ~halted;

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
  wire reg_we = (reg_write | is_tid | is_ntid) & ~halted;
  regfile rf (
    .clk(clk), .we(reg_we),
    .ra1(rs1), .ra2(rs2), .wa(rd), .wd(wb_data),
    .rd1(rs1_data), .rd2(rs2_data)
  );
  assign dbg_a0 = rf.regs[10];

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
      3'b000:  branch_taken = (rs1_data == rs2_data);
      3'b001:  branch_taken = (rs1_data != rs2_data);
      3'b100:  branch_taken = ($signed(rs1_data) < $signed(rs2_data));
      3'b101:  branch_taken = ($signed(rs1_data) >= $signed(rs2_data));
      3'b110:  branch_taken = (rs1_data < rs2_data);
      3'b111:  branch_taken = (rs1_data >= rs2_data);
      default: branch_taken = 1'b0;
    endcase
  end

  // ---- 載入資料符號擴展（讀出字由頂層提供） ----
  reg [31:0] load_data;
  always @(*) begin
    case (funct3)
      3'b000: load_data = {{24{mem_rdata[7]}}, mem_rdata[7:0]};
      3'b001: load_data = {{16{mem_rdata[15]}}, mem_rdata[15:0]};
      3'b010: load_data = mem_rdata;
      3'b100: load_data = {24'd0, mem_rdata[7:0]};
      3'b101: load_data = {16'd0, mem_rdata[15:0]};
      default: load_data = mem_rdata;
    endcase
  end

  // ---- 寫回選擇（含 TID/NTID） ----
  wire [31:0] pc_plus4 = pc + 32'd4;
  assign wb_data = is_tid ? LANE_ID : (is_ntid ? NUM_LANES :
                   (wb_pc4 ? pc_plus4 : (mem_to_reg ? load_data : alu_y)));

  // ---- 記憶體埠 ----
  assign mem_addr   = alu_y;
  assign mem_wdata  = rs2_data;
  assign mem_we     = mem_write & ~halted;
  assign mem_funct3 = funct3;

  // ---- 下一 PC（含 barrier 等待） ----
  wire [31:0] jalr_target = (rs1_data + imm) & 32'hFFFFFFFE;
  wire [31:0] pc_next = jump ? (is_jalr ? jalr_target : pc + imm)
                             : ((branch & branch_taken) ? pc + imm : pc_plus4);
  wire pc_hold = halted | (is_barrier & ~barrier_release);

  // ---- 時序 ----
  always @(posedge clk) begin
    if (rst) begin
      pc <= 32'd0;
      halted <= 1'b0;
    end else if (!pc_hold) begin
      if (is_ecall) halted <= 1'b1;
      pc <= pc_next;
    end
  end
endmodule
