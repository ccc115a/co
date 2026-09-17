// immgen.v — 立即數產生器：依 opcode 拼出符號擴展後的 32 位立即數
module immgen (
  input  wire [31:0] instr,
  output reg  [31:0] imm
);
  wire [6:0] op = instr[6:0];

  always @(*) begin
    case (op)
      // I-type：Load / OP-IMM / JALR / FENCE / SYSTEM
      7'b0000011, 7'b0010011, 7'b1100111, 7'b0001111, 7'b1110011:
        imm = {{20{instr[31]}}, instr[31:20]};
      // S-type：Store
      7'b0100011:
        imm = {{20{instr[31]}}, instr[31:25], instr[11:7]};
      // B-type：Branch（最低位恆零）
      7'b1100011:
        imm = {{19{instr[31]}}, instr[31], instr[7], instr[30:25], instr[11:8], 1'b0};
      // U-type：LUI / AUIPC
      7'b0110111, 7'b0010111:
        imm = {instr[31:12], 12'd0};
      // J-type：JAL（最低位恆零）
      7'b1101111:
        imm = {{11{instr[31]}}, instr[31], instr[19:12], instr[20], instr[30:21], 1'b0};
      default:
        imm = 32'd0;
    endcase
  end
endmodule
