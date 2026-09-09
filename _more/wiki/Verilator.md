# Verilator

Verilator 是一個高效能的開源 SystemVerilog 模擬器和硬體驗證工具。與傳統的事件驅動模擬器不同，Verilator 將 SystemVerilog 程式碼編譯為高效的 C++ 執行檔，實現了數量級的效能提升。這種編譯式模擬方法使 Verilator 特別適合驗證大型複雜系統，如 CPU 核心、GPU 和加速器。Verilator 由 Wilson Snyder 開發，現在是 Eclipse 基金會的專案，是開源硬體驗證領域最重要的工具之一。

## 特色

### 高效能模擬

```
┌─────────────────────────────────────────────────────────────────┐
│                      Verilator 特色                            │
├─────────────────────────────────────────────────────────────────┤
│                                                              │
│  編譯式模擬：                                                 │
│  • 將 Verilog/SystemVerilog 編譯為 C++                       │
│  • 執行速度比傳統模擬器快 10-100 倍                            │
│  • 適合大型設計驗證                                            │
│  • 支援系統級模擬                                              │
│                                                              │
│  完整支援：                                                   │
│  • SystemVerilog 標準                                         │
│  •  Assertions (SVA)                                          │
│  •  覆盖率                                                     │
│  •  多執行緒                                                   │
│                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## 安裝

### 從原始碼安裝

```bash
# 安裝依賴
sudo apt-get install cmake make g++ python3

# 取得原始碼
git clone https://github.com/verilator/verilator.git
cd verilator

# 編譯安裝
git checkout stable
cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=ON
cmake --build build -j$(nproc)
sudo cmake --install build
```

### 使用預編譯套件

```bash
# Ubuntu
sudo apt-get install verilator

# Conda
conda install -c conda-forge verilator
```

## 基本使用

### 編譯流程

```bash
# 1. 將 Verilog 編譯為 C++
verilator --cc --exe -o sim_main tb_top.v top.v

# 2. 編譯產生的 C++ 為執行檔
make -C obj_dir -f Vtop.mk

# 3. 執行
./obj_dir/Vtop
```

### 常用選項

```bash
# 基本選項
verilator --help | head -50

# 輸出類型
--cc              # C++ 輸出 (預設)
--sc              # SystemC 輸出
--lint            # 只做語法檢查
--美化            # 美化輸出

# 最佳化
-O3               # 最高最佳化
--unroll-combine  # 合併迴圈
--no-deadlock-cleanup # 禁用死鎖清理

# 調試
-g                # 產生除錯資訊
--trace           # 產生波形
--trace-structs  # 包含結構

# 警告
-Wall             # 啟用所有警告
-Wno-fatal        # 將錯誤視為警告
```

## 範例

### 簡單設計

```verilog
// top.v
module top (
    input  wire       clk,
    input  wire       rst_n,
    input  wire [7:0] a,
    input  wire [7:0] b,
    output reg  [7:0] y
);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            y <= 8'd0;
        else
            y <= a + b;
    end

endmodule
```

```verilog
// tb_top.v
`timescale 1ns/1ps
module tb_top;

    reg clk = 0;
    reg rst_n = 0;
    reg [7:0] a, b;
    wire [7:0] y;

    // 時脈產生
    always #5 clk = ~clk;

    // DUT
    top dut (.clk(clk), .rst_n(rst_n), .a(a), .b(b), .y(y));

    // 測試
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0);
        
        #10 rst_n = 1;
        
        a = 10; b = 20; #20;
        a = 50; b = 30; #20;
        a = 255; b = 1; #20;
        
        $display("測試完成");
        $finish;
    end

endmodule
```

```bash
# 編譯執行
verilator --cc --trace tb_top.v top.v
make -C obj_dir
./obj_dir/Vtb_top
```

## SystemVerilog 支援

### 類別

```systemverilog
class Packet;
    rand bit [7:0] addr;
    rand bit [31:0] data;
    
    constraint c_addr {
        addr inside {[8'h00:8'hFF]};
    }
    
    function void print();
        $display("Addr: %h, Data: %h", addr, data);
    endfunction
endclass

// 使用
initial begin
    Packet p = new();
    p.randomize();
    p.print();
end
```

### 介面

```systemverilog
interface apb_if (input bit clk, rst_n);
    logic [31:0] paddr;
    logic        psel;
    logic        penable;
    logic        pwrite;
    logic [31:0] pwdata;
    logic [31:0] prdata;
    logic        pready;
    
    modport master (
        output paddr, psel, penable, pwrite, pwdata,
        input  prdata, pready
    );
    
    modport slave (
        input  paddr, psel, penable, pwrite, pwdata,
        output prdata, pready
    );
endinterface
```

### 斷言

```systemverilog
// 立即斷言
always @(*) begin
    assert (a + b >= 0) else $error("Overflow");
end

// 覆蓋屬性
property req_ack;
    @(posedge clk) disable iff (!rst_n)
    req |-> ##1 ack;
endproperty

assert property(req_ack) else $error("Protocol violation");

// 覆蓋點
cover property (req_ack);
```

## 與 C++ 整合

### 直接呼叫

```cpp
// main.cpp
#include "Vtop.h"
#include "verilated.h"
#include <iostream>

int main(int argc, char** argv) {
    Verilated::commandArgs(argc, argv);
    
    Vtop* dut = new Vtop;
    
    // 初始化
    dut->clk = 0;
    dut->rst_n = 0;
    dut->a = 0;
    dut->b = 0;
    
    // 執行多個時脈週期
    for (int i = 0; i < 100; i++) {
        dut->clk = !dut->clk;
        dut->eval();
        
        if (i == 10) dut->rst_n = 1;
        
        if (dut->y != 0)
            std::cout << "Cycle " << i << ": y = " << dut->y << std::endl;
    }
    
    delete dut;
    return 0;
}
```

### 從 Python 控制

```python
# 透過 ffi 呼叫
import ctypes

# 載入編譯後的 shared library
lib = ctypes.CDLL("./obj_dir/Vtop.so")

# 設定/取得訊號
# (需要更多包裝)
```

## 驗證功能

### 覆蓋率

```bash
# 產生覆蓋率報告
verilator --cc --coverage tb_top.v top.v
./obj_dir/Vtb_top
verilator --annotate --annotate-min 10 obj_dir/
```

```systemverilog
// 覆蓋點
covergroup cg @(posedge clk);
    option.per_instance = 1;
    
    cp_data: coverpoint data {
        bins zero = {0};
        bins low = {[1:10]};
        bins high = {[11:20]};
        bins max = {[21:255]};
    }
    
    cp_op: coverpoint op;
    
    cross cp_data, cp_op;
endgroup
```

### 效能分析

```bash
# Profiling
verilator --profile tb_top.v -o profile

# 執行後
# 產生 profile 資訊
# 分析熱點
```

## 多執行緒支援

### Verilator MT

```bash
# 啟用多執行緒模擬
verilator --cc --threads 4 tb_top.v top.v

# 執行緒池
# 將設計劃分為多個區域
# 平行執行
```

### Split 區塊

```verilog
// /*verilator split*/ 指示詞
always @(posedge clk) begin
    // 區塊 1
    /*verilator split 1*/
    reg1 <= a + b;
end

always @(posedge clk) begin
    // 區塊 2
    /*verilator split 2*/
    reg2 <= c * d;
end
```

## 實際應用

### CPU 驗證

```bash
# RISC-V 核心驗證
verilator --cc --trace -f flags.riscv \
    -o sim rv_core.v
```

### 加速器驗證

```bash
# 神經網路加速器
verilator --threads 8 \
    --sc --trace-nc \
    tb_npu.v npu.v
```

## 與其他工具比較

| 特性 | Verilator | Icarus Verilog | ModelSim | VCS |
|------|-----------|----------------|----------|-----|
| 速度 | 最快 | 慢 | 中等 | 快 |
| 授權 | 開源 | 開源 | 商業 | 商業 |
| C++ 整合 | 是 | 否 | 否 | 是 |
| SystemVerilog | 完整 | 部分 | 完整 | 完整 |
| 波形 | VCD/FST | VCD | VCD/FSDB | VCD/FSDB |

## 常見用法

### Makefile

```makefile
VERILATOR = verilator
VERILATOR_FLAGS = --cc --trace --trace-structs -Wall

top: tb_top.v top.v
	$(VERILATOR) $(VERILATOR_FLAGS) -o sim tb_top.v top.v
	make -C obj_dir

run: top
	./obj_dir/Vtb_top

clean:
	rm -rf obj_dir sim

.PHONY: run clean
```

### CI 整合

```yaml
# .github/workflows/test.yml
name: Verilator Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Verilator
        run: sudo apt-get install verilator
      - name: Build
        run: make
      - name: Run
        run: make run
```

## 相關概念

- [Verilog](Verilog.md) - Verilog 語言
- [HDL](HDL.md) - 硬體描述語言
- [EDA](EDA.md) - 電子設計自動化
- [IcarusVerilog](IcarusVerilog.md) - 開源模擬器
- [SystemVerilog](SystemVerilog.md) - SystemVerilog 語言