// UART transmitter, 8N1. CLKS_PER_BIT = clock / baud (12 MHz / 115200 = 104).
module uart_tx #(parameter CLKS_PER_BIT = 104) (
  input clk, input start, input [7:0] data, output tx, output busy);
  reg [9:0]  shreg = 10'h3FF;
  reg [3:0]  nbits = 0;
  reg [15:0] cnt   = 0;
  assign busy = (nbits != 0);
  assign tx   = busy ? shreg[0] : 1'b1;
  always @(posedge clk) begin
    if (!busy) begin
      if (start) begin shreg <= {1'b1, data, 1'b0}; nbits <= 10; cnt <= 0; end   // stop, data, start
    end else if (cnt == CLKS_PER_BIT - 1) begin
      cnt <= 0; shreg <= {1'b1, shreg[9:1]}; nbits <= nbits - 1;
    end else cnt <= cnt + 1;
  end
endmodule

// Sends "Hi!\n" over and over, about every 20 ms.
module top(input clk, output tx);
  reg [17:0] gap = 0;
  reg [1:0]  idx = 0;
  reg        start = 0;
  wire       busy;
  reg  [7:0] data;
  always @* case (idx) 0: data = "H"; 1: data = "i"; 2: data = "!"; default: data = "\n"; endcase
  uart_tx u(.clk(clk), .start(start), .data(data), .tx(tx), .busy(busy));
  always @(posedge clk) begin
    start <= 0;
    if (start) idx <= idx + 1;
    else if (!busy) begin
      gap <= gap + 1;
      if (&gap) start <= 1;
    end
  end
endmodule
