// MCU0 on iCE40 block RAM. Same instruction set as the MCU0m article (LD ADD JMP ST CMP JEQ),
// but the 512-byte memory has a synchronous read port, so Yosys maps it onto one SB_RAM40_4K
// instead of hundreds of flip-flops and multiplexers. The price is a small state machine:
//   FETCH: read the instruction word   EXEC: decode, start the data read, jumps and stores finish here
//   WB:    data arrives, update A and the flags (LD, ADD, CMP only)
// Memory is word-addressed (256 x 16): byte address C selects word C[8:1], so keep code and data at even addresses.
// Program: mcu0.asm (assembled to mcu0.hex on every run). LEDs: a store to byte address 0x14 (the SUM variable) is copied to the LEDs.
module mcu0 (input clk, input ce, output reg [7:0] out = 0, output reg [15:0] PC = 0);
  localparam [3:0] LD = 0, ADD = 1, JMP = 2, ST = 3, CMP = 4, JEQ = 5;
  localparam [1:0] FETCH = 0, EXEC = 1, WB = 2;

  reg [15:0] mem [0:255];
  initial $readmemh("mcu0.hex", mem);
  reg [15:0] rdata;
  reg  [7:0] raddr, waddr;
  reg [15:0] wdata, A = 0;
  reg        we, N = 0, Z = 0;
  reg  [1:0] state = FETCH;
  reg  [3:0] op;
  wire [11:0] C = rdata[11:0];

  always @* begin
    raddr = (state == EXEC) ? rdata[8:1] : PC[8:1];   // EXEC: fetch the operand of the instruction in rdata
    waddr = rdata[8:1];
    wdata = A;
    we    = ce && state == EXEC && rdata[15:12] == ST;
  end

  // Memory port: a write, and a read that only happens on enabled steps so rdata holds still between them.
  always @(posedge clk) begin
    if (we) mem[waddr] <= wdata;
    if (ce) rdata <= mem[raddr];
  end

  always @(posedge clk) if (ce) begin
    case (state)
      FETCH: state <= EXEC;
      EXEC: begin
        PC <= PC + 16'd2; op <= rdata[15:12]; state <= FETCH;
        case (rdata[15:12])
          LD, ADD, CMP: state <= WB;
          JMP:          PC <= {4'b0, C};
          JEQ:          if (Z) PC <= {4'b0, C};
          default: ;                                   // ST is handled by the memory port
        endcase
      end
      WB: begin
        state <= FETCH;
        case (op)
          LD:  A <= rdata;
          ADD: A <= A + rdata;
          CMP: begin N <= $signed(A) < $signed(rdata); Z <= (A == rdata); end
          default: ;
        endcase
      end
      default: state <= FETCH;
    endcase
    if (we && waddr == 8'd10) out <= wdata[7:0];
  end

`ifdef FORMAL
  // Formal checks (enable "Formal" and press Run). Yosys unrolls the CPU for a bounded number of clock cycles
  // and a solver searches for any way to break these; a counterexample is shown as a waveform.
  always @* assume(ce);                          // the CPU takes a step on every clock
  always @* assert(PC[0] == 1'b0);               // instructions stay word aligned
  always @* assert(state != 2'd3);               // the state register never leaves FETCH / EXEC / WB
  always @* if (PC == 16'h12) assert(out == 8'd55);   // at the EXIT loop (byte 0x12) the LEDs show 1+2+...+10 = 55
  always @* cover(PC == 16'h12);                // ...and the EXIT loop can actually be reached
`endif
endmodule

module top(input clk, output [7:0] led);
  reg [19:0] div = 0;
  always @(posedge clk) div <= div + 1;
  wire ce = &div;                                      // one CPU step every 2^20 clocks (about 11 per second at 12 MHz)
  mcu0 cpu(.clk(clk), .ce(ce), .out(led), .PC());
endmodule
