// regfile.v — 32x32 暫存器檔：非同步讀、同步寫，x0 恆零
// 管線版差異：同週期「WB 寫入 vs ID 讀出同一暫存器」時直接旁路 wd（寫優先），
// 讓相隔 3 條以上的 RAW 不用作 forwarding 也正確。
module regfile (
  input  wire        clk,
  input  wire        we,
  input  wire [4:0]  ra1,
  input  wire [4:0]  ra2,
  input  wire [4:0]  wa,
  input  wire [31:0] wd,
  output wire [31:0] rd1,
  output wire [31:0] rd2
);
  reg [31:0] regs [0:31];

  integer i;
  initial begin
    for (i = 0; i < 32; i = i + 1) regs[i] = 32'd0;
  end

  // 寫優先旁路：同週期寫入即讀到新值；x0 恆零
  assign rd1 = (ra1 == 5'd0) ? 32'd0 :
               ((we && wa == ra1) ? wd : regs[ra1]);
  assign rd2 = (ra2 == 5'd0) ? 32'd0 :
               ((we && wa == ra2) ? wd : regs[ra2]);

  always @(posedge clk) begin
    if (we && wa != 5'd0) regs[wa] <= wd;
  end
endmodule
