// MCU0: same instruction set as the MCU0m article, rewritten to be synthesizable (registered, one instruction per enabled clock).
// The program is mcu0m.hex (edit that tab to change it). LEDs show the low byte of SUM: 1,3,6,10,15,21,28,36,45,55.
// Differences from the article: 32-byte memory (addresses wrap), CMP uses a signed compare. Pins are placeholders for UP5K/sg48.
module mcu0(input clk, input ce, output [7:0] out, output reg [15:0] PC = 0);
  localparam [3:0] LD=0, ADD=1, JMP=2, ST=3, CMP=4, JEQ=5;
  reg [7:0] m [0:31];
  reg [15:0] A = 0;
  reg N = 0, Z = 0;
  initial $readmemh("mcu0m.hex", m);
  wire [15:0] IR = {m[PC[4:0]], m[PC[4:0] + 5'd1]};
  wire [11:0] C  = IR[11:0];
  wire [15:0] M  = {m[C[4:0]], m[C[4:0] + 5'd1]};
  assign out = m[5'h15];
  always @(posedge clk) if (ce) begin
    PC <= PC + 16'd2;
    case (IR[15:12])
      LD:  A <= M;
      ADD: A <= A + M;
      JMP: PC <= {4'b0, C};
      ST:  begin m[C[4:0]] <= A[15:8]; m[C[4:0] + 5'd1] <= A[7:0]; end
      CMP: begin N <= $signed(A) < $signed(M); Z <= (A == M); end
      JEQ: if (Z) PC <= {4'b0, C};
    endcase
  end
endmodule
module top(input clk, output [7:0] led);
  reg [19:0] div = 0;
  always @(posedge clk) div <= div + 1;
  wire ce = &div;
  mcu0 cpu(.clk(clk), .ce(ce), .out(led), .PC());
endmodule
