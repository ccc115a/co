// control.v — 主控制單元：opcode/funct3/funct7[5] → 資料路徑控制訊號
// alu_op 編碼沿用 alu.v：0=ADD 1=SUB 2=AND 3=OR 4=XOR 5=SLL 6=SRL 7=SRA 8=SLT 9=SLTU
module control (
  input  wire [6:0] opcode,
  input  wire [2:0] funct3,
  input  wire       funct7b5,   // instr[30]：區分 ADD/SUB、SRL/SRA
  output reg        reg_write,  // 寫回暫存器
  output reg        alu_src_b,  // ALU 輸入 B 選立即數（否則 rs2）
  output reg        alu_a_pc,   // ALU 輸入 A 選 PC（AUIPC；否則 rs1；LUI 靠 A=0）
  output reg        alu_a_zero, // ALU 輸入 A 接零（LUI）
  output reg        mem_read,
  output reg        mem_write,
  output reg        mem_to_reg, // 寫回資料選記憶體（否則 ALU）
  output reg        branch,
  output reg        jump,       // JAL / JALR
  output reg        is_jalr,
  output reg        wb_pc4,     // 寫回資料選 PC+4（JAL/JALR）
  output reg        is_ecall,   // ECALL/EBREAK（funct3==000）
  output reg  [3:0] alu_op
);
  always @(*) begin
    // 預設即 NOP
    reg_write  = 1'b0;
    alu_src_b  = 1'b0;
    alu_a_pc   = 1'b0;
    alu_a_zero = 1'b0;
    mem_read   = 1'b0;
    mem_write  = 1'b0;
    mem_to_reg = 1'b0;
    branch     = 1'b0;
    jump       = 1'b0;
    is_jalr    = 1'b0;
    wb_pc4     = 1'b0;
    is_ecall   = 1'b0;
    alu_op     = 4'd0;
    case (opcode)
      7'b0110111: begin // LUI：rd = imm（0 + imm）
        reg_write = 1'b1; alu_src_b = 1'b1; alu_a_zero = 1'b1;
      end
      7'b0010111: begin // AUIPC：rd = PC + imm
        reg_write = 1'b1; alu_src_b = 1'b1; alu_a_pc = 1'b1;
      end
      7'b1101111: begin // JAL：rd = PC+4，PC = PC+imm
        reg_write = 1'b1; jump = 1'b1; wb_pc4 = 1'b1;
      end
      7'b1100111: begin // JALR：rd = PC+4，PC = (rs1+imm)&~1
        reg_write = 1'b1; jump = 1'b1; is_jalr = 1'b1; wb_pc4 = 1'b1;
        alu_src_b = 1'b1;
      end
      7'b1100011: begin // Branch：PC = PC+imm（若條件成立）
        branch = 1'b1; alu_op = 4'd1; // SUB（供除錯觀察，條件另由 branch 單元判定）
      end
      7'b0000011: begin // Load：rd = MEM[rs1+imm]
        reg_write = 1'b1; alu_src_b = 1'b1; mem_read = 1'b1; mem_to_reg = 1'b1;
      end
      7'b0100011: begin // Store：MEM[rs1+imm] = rs2
        alu_src_b = 1'b1; mem_write = 1'b1;
      end
      7'b0010011: begin // OP-IMM
        reg_write = 1'b1; alu_src_b = 1'b1;
        case (funct3)
          3'b000: alu_op = 4'd0; // ADDI
          3'b010: alu_op = 4'd8; // SLTI
          3'b011: alu_op = 4'd9; // SLTIU
          3'b100: alu_op = 4'd4; // XORI
          3'b110: alu_op = 4'd3; // ORI
          3'b111: alu_op = 4'd2; // ANDI
          3'b001: alu_op = 4'd5; // SLLI
          3'b101: alu_op = funct7b5 ? 4'd7 : 4'd6; // SRAI / SRLI
          default: alu_op = 4'd0;
        endcase
      end
      7'b0110011: begin // OP（R-type）
        reg_write = 1'b1;
        case (funct3)
          3'b000: alu_op = funct7b5 ? 4'd1 : 4'd0; // SUB / ADD
          3'b001: alu_op = 4'd5; // SLL
          3'b010: alu_op = 4'd8; // SLT
          3'b011: alu_op = 4'd9; // SLTU
          3'b100: alu_op = 4'd4; // XOR
          3'b101: alu_op = funct7b5 ? 4'd7 : 4'd6; // SRA / SRL
          3'b110: alu_op = 4'd3; // OR
          3'b111: alu_op = 4'd2; // AND
          default: alu_op = 4'd0;
        endcase
      end
      7'b0001111: begin // FENCE：單週期無管線，視為 NOP
      end
      7'b1110011: begin // SYSTEM：ECALL / EBREAK → 停機（見頂層 halted）
        is_ecall = (funct3 == 3'b000);
      end
      default: begin // 未定義 opcode：保持 NOP（除錯時可另接非法指令 trap）
      end
    endcase
  end
endmodule
