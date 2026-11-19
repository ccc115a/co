// Traffic-light controller: red 5 ticks, green 4, yellow 2. One tick = TICK clock cycles (1 s at 12 MHz).
module traffic #(parameter TICK = 12_000_000) (input clk, output red, output yellow, output green);
  localparam RED = 2'd0, GREEN = 2'd1, YELLOW = 2'd2;
  reg [1:0]  state = RED;
  reg [31:0] cnt = 0;
  reg [3:0]  sec = 0;
  wire tick = (cnt == TICK - 1);
  always @(posedge clk) begin
    cnt <= tick ? 32'd0 : cnt + 1;
    if (tick) begin
      sec <= sec + 1;
      case (state)
        RED:    if (sec == 4) begin state <= GREEN;  sec <= 0; end
        GREEN:  if (sec == 3) begin state <= YELLOW; sec <= 0; end
        YELLOW: if (sec == 1) begin state <= RED;    sec <= 0; end
        default: state <= RED;
      endcase
    end
  end
  assign red = (state == RED), green = (state == GREEN), yellow = (state == YELLOW);
endmodule

module top(input clk, output [2:0] led);
  traffic t(.clk(clk), .red(led[0]), .yellow(led[1]), .green(led[2]));
endmodule
