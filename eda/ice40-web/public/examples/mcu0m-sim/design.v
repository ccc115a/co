// MCU0m: 16-bit accumulator CPU from the MCU0m article. Behavioural, simulation only (not synthesizable as written).
// Program: mcu0m.hex (sum 1..10). Registers A, PC, IR, SW appear in the waveform under main.cpux.
`define N    SW[15] // negative flag
`define Z    SW[14] // zero flag
`define OP   IR[15:12]
`define C    IR[11:0]
`define M    {m[`C], m[`C+1]}
module cpu(input clock);
  parameter [3:0] LD=4'h0,ADD=4'h1,JMP=4'h2,ST=4'h3,CMP=4'h4,JEQ=4'h5;
  reg signed [15:0] A;
  reg [15:0] IR;
  reg [15:0] SW;
  reg [15:0] PC;
  reg [15:0] pc0;
  reg [7:0]  m [0:32];
  integer i;
  initial begin
    PC = 0; SW = 0;
    $readmemh("mcu0m.hex", m);
    for (i=0; i < 32; i=i+2) $display("%8x: %8x", i, {m[i], m[i+1]});
  end
  always @(posedge clock) begin
    IR = {m[PC], m[PC+1]};
    pc0= PC;
    PC = PC+2;
    case (`OP)
      LD: A = `M;
      ST: `M = A;
      CMP: begin `N=(A < `M); `Z=(A==`M); end
      ADD: A = A + `M;
      JMP: PC = `C;
      JEQ: if (`Z) PC=`C;
    endcase
    $display("%4dns PC=%x IR=%x, SW=%x, A=%d", $stime, pc0, IR, SW, A);
  end
endmodule
