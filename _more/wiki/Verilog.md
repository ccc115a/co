# Verilog

Verilog 是一種硬體描述語言（Hardware Description Language, HDL），廣泛用於數位電路的設計、模擬和驗證。由 Gateway Design Automation 公司於 1984 年開發，後來被 Cadence 收購並標準化為 IEEE 1364。Verilog 允許設計者以抽象層次描述硬體電路，從行為級描述到閘級網表都能表達。這種語言是現代數位系統設計和積體電路設計的基礎，幾乎所有晶片設計都使用 Verilog 或其近親 SystemVerilog。

## Verilog 基礎

### 模組結構

```verilog
// 模組定義
module module_name (
    input  wire [7:0] a,      // 8 位元輸入
    input  wire [7:0] b,      // 8 位元輸入
    input  wire       clk,    // 時脈輸入
    input  wire       rst_n,  // 低電位有效重設
    output reg  [7:0] y,     // 8 位元輸出（暫存器）
    output wire        flag  // 1 位元輸出
);

    // 內部訊號
    wire [7:0] temp;
    reg  [7:0] data;

    // 組合邏輯
    assign temp = a + b;

    // 時序邏輯
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            data <= 8'b0;
        else
            data <= temp;
    end

    // 輸出邏輯
    assign flag = (data > 8'd100);
    always @(*) y = data;

endmodule
```

## 資料類型

### 基本資料類型

```verilog
// Wire - 連續指派的訊號
wire [31:0] data_bus;
wire       single_bit;

// Reg - 程序區塊中的變數
reg [7:0] counter;
reg       flag;

// Integer - 整數
integer i;
integer count = 0;

// Parameter - 參數（常數）
parameter WIDTH = 8;
parameter ADDR_WIDTH = 16;

// 實參覆寫
#(.WIDTH(16)) mod (.a(a), .b(b), .y(y));
```

### 向量

```verilog
// 向量語法
wire [7:0] byte_data;     // 8 位元，位元 7 為最高位
wire [0:7] reversed;       // 反向索引

// 部分選擇
byte_data[7:4]  // 高四位
byte_data[3:0]  // 低四位

// 向量操作
wire [15:0] sum;
assign sum = a + b;
```

## 建模層次

### 閘級模型

```verilog
// 基本邏輯閘
and  and1 (out, a, b);    // AND
or   or1  (out, a, b);    // OR
not  not1 (out, a);       // NOT
nand nand1 (out, a, b);  // NAND
xor  xor1 (out, a, b);    // XOR

// 使用基本門建構電路
module and3 (a, b, c, y);
    input  wire a, b, c;
    output wire y;
    wire   ab;
    and    and1 (ab, a, b);
    and    and2 (y, ab, c);
endmodule
```

### 資料流模型（RTL）

```verilog
// 組合邏輯
assign y = a & b | c;

// 算術運算
assign sum = a + b;
assign diff = a - b;
assign product = a * b;
assign quotient = a / b;
assign mod_result = a % b;

// 比較運算
assign eq = (a == b);
assign ne = (a != b);
assign lt = (a < b);
assign le = (a <= b);
assign gt = (a > b);
assign ge = (a >= b);

// 移位運算
assign left = a << 2;     // 邏輯左移
assign right = a >> 2;   // 邏輯右移
assign arith = a >>> 2;  // 算術右移（符號擴展）
```

### 行為模型

```verilog
// 組合邏輯 always 區塊
always @(*) begin
    case (sel)
        2'b00:   y = a;
        2'b01:   y = b;
        2'b10:   y = c;
        default: y = 0;
    endcase
end

// 時序邏輯 always 區塊
always @(posedge clk) begin
    if (rst) begin
        counter <= 0;
    end else begin
        counter <= counter + 1;
    end
end

// 雙edge時序
always @(posedge clk or negedge rst_n) begin
    if (!rst_n)
        data <= 0;
    else
        data <= next_data;
end
```

## 常用語法

### 條件語句

```verilog
// if-else
if (enable) begin
    data <= input_data;
end else begin
    data <= 0;
end

// case
case (state)
    IDLE:    next = READY;
    READY:   next = RUN;
    RUN:     next = DONE;
    default: next = IDLE;
endcase
```

### 迴圈

```verilog
// for 迴圈（只能用在 initial 或 task 中）
integer i;
for (i = 0; i < 8; i = i + 1) begin
    result[i] = data[i] ^ key[i];
end

// while 迴圈
while (count < 10) begin
    sum = sum + count;
    count = count + 1;
end

// repeat 迴圈
repeat (5) begin
    data = data + 1;
end
```

### 函式與任務

```verilog
// 函式
function [7:0] find_parity;
    input [7:0] data;
    integer i;
    begin
        find_parity = 0;
        for (i = 0; i < 8; i = i + 1) begin
            find_parity = find_parity ^ data[i];
        end
    end
endfunction

// 使用
wire [7:0] parity = find_parity(input_data);

// 任務
task write_data;
    input [7:0] addr;
    input [7:0] data;
    begin
        addr_reg = addr;
        data_reg = data;
        write_enable = 1;
        #10;
        write_enable = 0;
    end
endtask
```

## 測試平台

### 測試平台範例

```verilog
`timescale 1ns/1ps

module tb_example;

    // 時脈產生
    reg clk = 0;
    always #5 clk = ~clk;

    // 訊號宣告
    reg  [7:0] a, b;
    reg        sel;
    wire [7:0] y;

    // DUT 例化
    mux dut (.a(a), .b(b), .sel(sel), .y(y));

    // 測試案例
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_example);
        
        // 初始化
        a = 0; b = 0; sel = 0;
        
        #10;
        
        // 測試 1
        a = 8'hAA; b = 8'h55; sel = 0;
        #10;
        
        // 測試 2
        sel = 1;
        #10;
        
        // 測試 3
        a = 8'hFF; b = 8'h01; sel = 0;
        #10;
        
        $display("測試完成");
        $finish;
    end

    // 監視
    initial begin
        $monitor("Time=%0t a=%h b=%h sel=%b y=%h", 
                 $time, a, b, sel, y);
    end

endmodule
```

### 常用系統任務

```verilog
// 顯示和訊息
$display("Value = %d", data);  // 換行
$write("Value = %d", data);   // 不換行
$strobe("Result = %d", res);  // 模擬結束時顯示

// 檔案操作
$fopen("output.txt");
$fwrite(fd, "Data: %d\n", data);
$fclose(fd);

// 時間控制
#10;              // 延遲 10 單位時間
@(posedge clk);   // 等待時脈上升沿
@(negedge clk);  // 等待時脈下降沿
wait(data_ready); // 等待條件
```

## 經典電路設計

### 有限狀態機

```verilog
// Moore 狀態機
module fsmMoore (
    input  wire clk,
    input  wire rst,
    input  wire in,
    output wire out
);

    localparam IDLE = 2'b00;
    localparam S1   = 2'b01;
    localparam S2   = 2'b10;

    reg [1:0] state, next;

    // 狀態暫存器
    always @(posedge clk or posedge rst) begin
        if (rst)
            state <= IDLE;
        else
            state <= next;
    end

    // 下一狀態邏輯
    always @(*) begin
        case (state)
            IDLE: next = in ? S1 : IDLE;
            S1:   next = in ? S2 : S1;
            S2:   next = IDLE;
            default: next = IDLE;
        endcase
    end

    // 輸出邏輯（Moore）
    assign out = (state == S2);

endmodule

// Mealy 狀態機
module fsmMealy (
    input  wire clk,
    input  wire rst,
    input  wire in,
    output wire out
);

    reg [1:0] state;

    always @(posedge clk or posedge rst) begin
        if (rst)
            state <= 0;
        else
            case (state)
                0: if (in) state <= 1;
                1: if (!in) state <= 0;
            endcase
    end

    // 輸出邏輯（Mealy）
    assign out = (state == 1) && in;

endmodule
```

### 同步記憶體

```verilog
// 同步 RAM
module ram_sync (
    input         clk,
    input  [4:0]  addr,
    input  [7:0] data_in,
    input         we,
    input         re,
    output [7:0] data_out
);

    reg [7:0] mem [0:31];

    // 寫入
    always @(posedge clk) begin
        if (we)
            mem[addr] <= data_in;
    end

    // 讀取
    reg [7:0] dout;
    always @(posedge clk) begin
        if (re)
            dout <= mem[addr];
    end
    assign data_out = dout;

endmodule
```

### 計數器

```verilog
// 可設定上下數計數器
module counter #(
    parameter WIDTH = 8
) (
    input  wire             clk,
    input  wire             rst,
    input  wire             up,       // 1=遞增, 0=遞減
    input  wire             load,
    input  wire [WIDTH-1:0] load_val,
    output reg  [WIDTH-1:0] count,
    output wire             overflow
);

    always @(posedge clk or posedge rst) begin
        if (rst)
            count <= 0;
        else if (load)
            count <= load_val;
        else if (up)
            count <= count + 1;
        else
            count <= count - 1;
    end

    assign overflow = up && (count == {WIDTH{1'b1}});

endmodule
```

## SystemVerilog 增強

```systemverilog
// 增強的資料類型
logic [7:0] data;      // 取代 wire/reg
bit       flag;        // 雙態
struct packed {
    logic [7:0] addr;
    logic       valid;
} packet;

// 介面
interface apb_if;
    logic [31:0] paddr;
    logic        psel;
    logic        penable;
    logic        pwrite;
    logic [31:0] pwdata;
    logic [31:0] prdata;
    logic        pready;
    
    modport master (output paddr, psel, penable, pwrite, pwdata, input prdata, pready);
    modport slave  (input  paddr, psel, penable, pwrite, pwdata, output prdata, pready);
endinterface

// 類別
class packet;
    rand bit [7:0] data;
    constraint c { data inside {[10:50]}; }
    
    function void display();
        $display("Data: %h", data);
    endfunction
endclass
```

## 相關概念

- [數位邏輯](數位邏輯.md) - 數位電路基礎
- [CPU架構](CPU架構.md) - CPU 設計
- [硬體設計](硬體設計.md) - 數位系統設計
- [Verilog 模擬](模擬.md) - 硬體模擬