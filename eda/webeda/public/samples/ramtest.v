// 簡單 RAM 讀寫：寫入 0..7 後讀回（we=寫入、re=讀出）
module ramtest(
  input  wire clk,
  input  wire we,
  input  wire re,
  output reg  [7:0] dout
);
  reg [7:0] mem [0:7];
  reg [2:0] addr;
  reg       writing;

  always @(posedge clk) begin
    if (we) begin
      mem[addr] <= {5'b0, addr} + 8'd100;
      writing <= 1'b1;
      addr <= addr + 1'b1;
    end else if (re) begin
      dout <= mem[addr];
      addr <= addr + 1'b1;
      writing <= 1'b0;
    end
  end
endmodule
