# HDL (硬體描述語言)

硬體描述語言（Hardware Description Language, HDL）是一種用於描述和模擬數位硬體的專業程式語言。與傳統軟體程式語言不同，HDL 描述的是硬體的並行結構和多時間域行為工程。兩種最常用的 HDL 是 Verilog 和 VHDL，它們允許工程師在較高抽象層次設計硬體，然後透過合成工具轉換為實際的閘級網表。HDL 是現代電子設計自動化的核心，從消費電子到超級電腦，所有數位硬體都離不開 HDL 的設計。

## HDL 概述

### 與軟體語言的差異

```
┌─────────────────────────────────────────────────────────────────┐
│                      HDL vs 軟體語言                            │
├─────────────────────────────────────────────────────────────────┤
│                                                              │
│  HDL 特性：                                                   │
│  • 並行執行：所有語句同時執行                                   │
│  • 硬體表示：描述連線和暫存器                                   │
│  • 時間模擬：包含時間延遲                                       │
│  • 結構化：支援階層設計                                         │
│  • 可合成：可轉換為實際硬體                                     │
│                                                              │
│  軟體語言特性：                                                 │
│  • 順序執行：語句逐步執行                                       │
│  • 資料操作：處理資料                                           │
│  • 控制流程：條件和迴圈                                         │
│  • 演算法導向：解決問題                                         │
│                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Verilog

### 基本語法

```verilog
// 模組定義
module module_name (
    input  wire       clk,        // 時脈輸入
    input  wire       rst_n,      // 低電位重設
    input  wire [7:0] data_in,   // 8 位元輸入
    output reg  [7:0] data_out   // 8 位元輸出
);

    // 內部訊號
    wire [7:0] result;
    reg  [7:0] buffer;

    // 組合邏輯
    assign result = data_in + 8'd1;

    // 時序邏輯
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            buffer <= 8'd0;
        else
            buffer <= result;
    end

    // 輸出
    always @(*)
        data_out = buffer;

endmodule
```

### 資料類型

```verilog
// 值集合
// 0: 邏輯 0
// 1: 邏輯 1
// x: 未知
// z: 高阻抗

// 資料類型
wire       single_bit;      // 連續指派
reg        stored_value;    // 程序區塊中使用
integer    counter;          // 整數
parameter  WIDTH = 8;        // 參數
real       pi = 3.14159;    // 浮點數

// 向量
wire [7:0]  byte_data;      // 8 位元匯流排
wire [0:7]  reversed;        // 反向索引
```

## VHDL

### 基本語法

```vhdl
-- VHDL 結構
library IEEE;
use IEEE.STD_LOGIC_1164.all;
use IEEE.NUMERIC_STD.all;

entity module_name is
    port (
        clk     : in  std_logic;
        rst_n   : in  std_logic;
        data_in : in  unsigned(7 downto 0);
        data_out: out unsigned(7 downto 0)
    );
end entity;

architecture behavioral of module_name is
    signal buffer : unsigned(7 downto 0);
begin
    -- 組合邏輯
    data_out <= buffer;
    
    -- 時序邏輯
    process(clk, rst_n) begin
        if rst_n = '0' then
            buffer <= (others => '0');
        elsif rising_edge(clk) then
            buffer <= data_in + 1;
        end if;
    end process;
end architecture;
```

### 資料類型

```vhdl
-- 標準邏輯
signal a : std_logic;        -- 1 位元
signal b : std_logic_vector(7 downto 0);  -- 8 位元

-- 有號/無號
signal s : signed(7 downto 0);
signal u : unsigned(7 downto 0);

-- 陣列
type ram_type is array (0 to 255) of std_logic_vector(7 downto 0);
signal memory : ram_type;
```

## SystemVerilog

### 增強特性

```systemverilog
// 介面
interface apb_interface;
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
class transaction;
    rand bit [7:0] data;
    rand bit [3:0] addr;
    
    constraint valid_data {
        data inside {[8'h20:8'hFF]};
    }
    
    function void print();
        $display("Addr: %h, Data: %h", addr, data);
    endfunction
endclass

// 斷言
property handshake;
    @(posedge clk) disable iff (!rst_n)
    req |-> ##1 ack;
endproperty
assert property(handshake) else $error("Handshake violation");
```

## UVM 驗證框架

### 驗證環境

```systemverilog
// UVM 元件範例
class my_agent extends uvm_agent;
    `uvm_component_utils(my_agent)
    
    my_driver    driver;
    my_sequencer sequencer;
    my_monitor   monitor;
    
    virtual function void build_phase(uvm_phase phase);
        super.build_phase(phase);
        
        monitor = my_monitor::type_id::create("monitor", this);
        
        if (is_active) begin
            driver = my_driver::type_id::create("driver", this);
            sequencer = my_sequencer::type_id::create("sequencer", this);
        end
    endfunction
    
    virtual function void connect_phase(uvm_phase phase);
        driver.seq_item_port.connect(sequencer.seq_item_export);
    endfunction
endclass
```

## 常見設計模式

### 狀態機

```verilog
// Moore 狀態機
module state_machine (
    input  wire clk,
    input  wire rst,
    input  wire input_val,
    output reg  output_val
);

    localparam [1:0] IDLE = 2'b00,
                     S1   = 2'b01,
                     S2   = 2'b10;

    reg [1:0] current_state, next_state;

    // 狀態暫存器
    always @(posedge clk or posedge rst) begin
        if (rst)
            current_state <= IDLE;
        else
            current_state <= next_state;
    end

    // 下一狀態邏輯
    always @(*) begin
        case (current_state)
            IDLE: next_state = input_val ? S1 : IDLE;
            S1:   next_state = input_val ? S2 : S1;
            S2:   next_state = IDLE;
            default: next_state = IDLE;
        endcase
    end

    // 輸出邏輯
    always @(*)
        output_val = (current_state == S2);

endmodule
```

### FIFO

```verilog
module fifo #(
    parameter DEPTH = 16,
    parameter WIDTH = 8
)(
    input  wire        clk,
    input  wire        rst,
    input  wire        wr_en,
    input  wire [WIDTH-1:0] wr_data,
    input  wire        rd_en,
    output reg  [WIDTH-1:0] rd_data,
    output wire        full,
    output wire        empty
);

    localparam ADDR_WIDTH = $clog2(DEPTH);

    reg [WIDTH-1:0] mem [0:DEPTH-1];
    reg [ADDR_WIDTH:0] wr_ptr;
    reg [ADDR_WIDTH:0] rd_ptr;

    wire [ADDR_WIDTH-1:0] wr_addr = wr_ptr[ADDR_WIDTH-1:0];
    wire [ADDR_WIDTH-1:0] rd_addr = rd_ptr[ADDR_WIDTH-1:0];

    assign full  = (wr_ptr[ADDR_WIDTH] != rd_ptr[ADDR_WIDTH]) &&
                   (wr_ptr[ADDR_WIDTH-1:0] == rd_ptr[ADDR_WIDTH-1:0]);
    assign empty = (wr_ptr == rd_ptr);

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            wr_ptr <= 0;
        end else if (wr_en && !full) begin
            mem[wr_addr] <= wr_data;
            wr_ptr <= wr_ptr + 1;
        end
    end

    always @(posedge clk or posedge rst) begin
        if (rst) begin
            rd_ptr <= 0;
            rd_data <= 0;
        end else if (rd_en && !empty) begin
            rd_data <= mem[rd_addr];
            rd_ptr <= rd_ptr + 1;
        end
    end

endmodule
```

## 合成語法

### 可合成結構

```verilog
// 可合成
always @(posedge clk) begin
    // 時序邏輯
end

always @(*) begin
    // 組合邏輯
end

assign x = y & z;  // 指派

// 不可合成
#10 a = b;         // 延遲
fork ... join       // 程序 Fork
initial begin       // 初始區塊
```

### 約束

```verilog
// 時序約束
create_clock -name sysclk -period 10.0 [get_ports clk]
set_input_delay  -clock sysclk 2.0 [all_inputs]
set_output_delay -clock sysclk 2.0 [all_outputs]

// 時序例外
set_false_path -from [get_clocks clk] -to [get_ports ready]
set_multicycle_path -setup 2 -from [get_pins reg*/C] -to [get_pins reg*/D]
```

## 模擬技巧

### 測試平台

```verilog
module tb_example;

    reg clk = 0;
    always #5 clk = ~clk;  // 10ns 時脈

    reg [7:0] a, b;
    reg       sel;
    wire [7:0] y;

    // DUT
    mux2 dut (.a(a), .b(b), .sel(sel), .y(y));

    // 測試案例
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars;
        
        a = 0; b = 0; sel = 0;
        #10;
        
        a = 8'hAA; b = 8'h55; sel = 0;
        #10;
        
        sel = 1;
        #10;
        
        $display("測試完成");
        $finish;
    end

    // 監視
    always @(posedge clk)
        $display("time=%0t sel=%b a=%h b=%h y=%h", $time, sel, a, b, y);

endmodule
```

## 相關概念

- [Verilog](Verilog.md) - Verilog 詳解
- [EDA](EDA.md) - 電子設計自動化
- [數位邏輯](數位邏輯.md) - 數位電路基礎
- [CPU架構](CPU架構.md) - CPU 設計
- [IcarusVerilog](IcarusVerilog.md) - 開源模擬器
- [Verilator](Verilator.md) - 高效能模擬器