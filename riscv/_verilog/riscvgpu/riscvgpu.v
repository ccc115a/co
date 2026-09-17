// riscvgpu.v — 4 通道 SPMD 共享記憶體 GPU 頂層
// 每通道是獨立 PC 的單週期 RV32I 純量核心（lane.v），共享指令記憶體與資料記憶體。
// 同週期多通道寫入同一位址時，編號大的通道勝出（模擬確定性語意，程式應避免）。
// BARRIER 語意：全部「未停」通道都執行到 BARRIER 才一起放行；已停通道視為到達。
// ECALL 使該通道 halted；全部通道 halted 即 done。
module riscvgpu #(
  parameter NUM_LANES = 4,
  parameter HEX = "prog.hex"
)(
  input  wire clk,
  input  wire rst,                       // 同步高位有效重置
  output wire done,                      // 全部通道 halted
  output wire [NUM_LANES-1:0] lanes_halted,
  output wire [31:0] dbg_a0              // lane0 的 a0（結束碼）
);
  // ---- 共享記憶體：指令 256 字，資料 4KB 小端序 ----
  reg [31:0] imem [0:255];
  reg [7:0]  dmem [0:4095];

  integer m;
  initial begin
    for (m = 0; m < 256; m = m + 1) imem[m] = 32'd0;
    $readmemh(HEX, imem);
    for (m = 0; m < 4096; m = m + 1) dmem[m] = 8'd0;
  end

  // ---- 跨通道匯流排 ----
  wire [31:0] pc_bus       [0:NUM_LANES-1];
  wire [31:0] instr_bus    [0:NUM_LANES-1];
  wire [31:0] mem_addr_bus [0:NUM_LANES-1];
  wire [31:0] mem_wdata_bus[0:NUM_LANES-1];
  wire [31:0] mem_rdata_bus[0:NUM_LANES-1];
  wire [2:0]  mem_funct3_bus[0:NUM_LANES-1];
  wire [NUM_LANES-1:0] mem_we_bus;
  wire [NUM_LANES-1:0] barrier_bus;
  wire [31:0] dbg_bus      [0:NUM_LANES-1];

  wire barrier_release;
  assign barrier_release = &(lanes_halted | barrier_bus);
  assign done = &lanes_halted;
  assign dbg_a0 = dbg_bus[0];

  genvar g;
  generate
    for (g = 0; g < NUM_LANES; g = g + 1) begin : gen_lane
      // 取指：共享 IMEM
      assign instr_bus[g] = imem[pc_bus[g][9:2]];
      // 載入：共享 DMEM 組字（小端序，位元組定址）
      assign mem_rdata_bus[g] = {dmem[mem_addr_bus[g]+3], dmem[mem_addr_bus[g]+2],
                                 dmem[mem_addr_bus[g]+1], dmem[mem_addr_bus[g]]};
      lane #(.LANE_ID(g), .NUM_LANES(NUM_LANES)) lane_inst (
        .clk(clk), .rst(rst),
        .instr(instr_bus[g]), .mem_rdata(mem_rdata_bus[g]),
        .barrier_release(barrier_release),
        .pc(pc_bus[g]), .halted(lanes_halted[g]),
        .mem_addr(mem_addr_bus[g]), .mem_wdata(mem_wdata_bus[g]),
        .mem_we(mem_we_bus[g]), .mem_funct3(mem_funct3_bus[g]),
        .is_barrier(barrier_bus[g]), .dbg_a0(dbg_bus[g])
      );
    end
  endgenerate

  // ---- 共享 DMEM 寫入：SB / SH / SW（多通道同拍時編號大者勝出） ----
  integer s;
  always @(posedge clk) begin
    if (!rst) begin
      for (s = 0; s < NUM_LANES; s = s + 1) begin
        if (mem_we_bus[s]) begin
          case (mem_funct3_bus[s][1:0])
            2'b00: dmem[mem_addr_bus[s]] <= mem_wdata_bus[s][7:0];
            2'b01: begin
              dmem[mem_addr_bus[s]]   <= mem_wdata_bus[s][7:0];
              dmem[mem_addr_bus[s]+1] <= mem_wdata_bus[s][15:8];
            end
            default: begin
              dmem[mem_addr_bus[s]]   <= mem_wdata_bus[s][7:0];
              dmem[mem_addr_bus[s]+1] <= mem_wdata_bus[s][15:8];
              dmem[mem_addr_bus[s]+2] <= mem_wdata_bus[s][23:16];
              dmem[mem_addr_bus[s]+3] <= mem_wdata_bus[s][31:24];
            end
          endcase
        end
      end
    end
  end
endmodule
