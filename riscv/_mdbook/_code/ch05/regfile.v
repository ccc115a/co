// regfile.v：32x32 暫存器檔（對應 5.1 資料路徑之 ID 級）
// x0 恆為零：讀出為零、寫入丟棄；同週期寫後讀直接旁路
`timescale 1ns/1ps
module regfile (
  input  wire        clk,
  input  wire        rst_n,     // 低位有效重置
  input  wire [4:0]  ra1,       // 讀位址 1
  input  wire [4:0]  ra2,       // 讀位址 2
  input  wire [4:0]  wa,        // 寫位址
  input  wire [31:0] wd,        // 寫資料
  input  wire        we,        // 寫致能
  output wire [31:0] rd1,       // 讀資料 1
  output wire [31:0] rd2        // 讀資料 2
);
  reg [31:0] rf [0:31];  // 32 個通用暫存器
  integer k;

  // 同步寫入：x0 不可寫
  always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      for (k = 0; k < 32; k = k + 1) rf[k] <= 32'd0;
    end else if (we && (wa != 5'd0)) begin
      rf[wa] <= wd;
    end
  end

  // 非同步讀出：x0 恆零；同位址同週期寫入則旁路新值
  assign rd1 = (ra1 == 5'd0) ? 32'd0 :
               ((we && (wa == ra1)) ? wd : rf[ra1]);
  assign rd2 = (ra2 == 5'd0) ? 32'd0 :
               ((we && (wa == ra2)) ? wd : rf[ra2]);
endmodule
