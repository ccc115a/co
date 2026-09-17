// hazard.v — load-use 停頓：載入在 EX、下一條在 ID 讀同一暫存器時 stall 一拍
// stall 時頂層凍結 PC 與 IF/ID，並對 ID/EX 塞 bubble。
module hazard (
  input  wire       id_ex_mem_read, // EX 階段是 Load
  input  wire [4:0] id_ex_rd,       // Load 的目的暫存器
  input  wire [4:0] if_id_rs1,
  input  wire [4:0] if_id_rs2,
  input  wire       id_uses_rs1,    // ID 指令讀 rs1（LUI/AUIPC/JAL 不讀）
  input  wire       id_uses_rs2,    // ID 指令讀 rs2（R-type/Store/Branch）
  output wire       stall
);
  assign stall = id_ex_mem_read && (id_ex_rd != 5'd0) &&
    ((id_uses_rs1 && id_ex_rd == if_id_rs1) ||
     (id_uses_rs2 && id_ex_rd == if_id_rs2));
endmodule
