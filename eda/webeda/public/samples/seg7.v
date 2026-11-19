// 七段顯示器掃描：計數器 + 解碼器（模擬時看 seg 的變化）
module seg7(
  input  wire clk,
  output reg  [3:0] count,
  output reg  [6:0] seg    // abcdefg
);
  always @(posedge clk) count <= count + 1'b1;
  always @(*) begin
    case (count)
      4'd0: seg = 7'b1111110;
      4'd1: seg = 7'b0110000;
      4'd2: seg = 7'b1101101;
      4'd3: seg = 7'b1111001;
      4'd4: seg = 7'b0110011;
      4'd5: seg = 7'b1011011;
      4'd6: seg = 7'b1011111;
      4'd7: seg = 7'b1110000;
      4'd8: seg = 7'b1111111;
      4'd9: seg = 7'b1111011;
      default: seg = 7'b0000000;
    endcase
  end
endmodule
