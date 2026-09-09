# 開放原始碼 EDA 工具 (Open Source EDA)

## 概述

電子設計自動化（EDA）領域長期被商業軟體主導，但近年來開源工具快速發展，形成了完整的開源EDA生態系統。這些工具涵蓋從邏輯合成、模擬、驗證到實體設計的完整流程，讓研究者、學生和新創公司能夠以低成本接觸先進的晶片設計技術。

## 開源 EDA 生態系統

### 層次架構

```
┌─────────────────────────────────────────────────────────────────┐
│                     開源 EDA 工具生態                            │
├─────────────────────────────────────────────────────────────────┤
│  應用層     │  Verilator │  OSS CAD    │  OpenROAD            │
├─────────────────────────────────────────────────────────────────┤
│  驗證層     │  Icarus    │  GTKWave    │  UVM                 │
├─────────────────────────────────────────────────────────────────┤
│  模擬層     │  NgSpice   │  Xyce       │  Qucs                │
├─────────────────────────────────────────────────────────────────┤
│  综合層     │  Yosys     │  ABC        │  Design Compiler     │
├─────────────────────────────────────────────────────────────────┤
│  布局佈線  │  OpenROAD  │  Graywolf   │  qrouter             │
├─────────────────────────────────────────────────────────────────┤
│  工藝資料   │  OpenPDK   │  Sky130     │  GF180               │
└─────────────────────────────────────────────────────────────────┘
```

## 邏輯合成工具

### Yosys

Yosys 是最受歡迎的開源邏輯合成工具，支援 SystemVerilog 子集和 Verilog 2005。

```bash
# 安裝 Yosys
git clone https://github.com/YosysHQ/yosys.git
cd yosys
make -j$(nproc)
sudo make install

# 基本使用
yosys -p "read_verilog design.v; synth -top design; write_verilog synth.v"

# 完整合成流程
yosys -p "
    read_verilog mydesign.v
    hierarchy -top top_module
    proc
    opt
    fsm
    memory
    synth
    write_verilog synthesized.v
"

# 輸出各種格式
yosys -p "synth; write_blif output.blif"      # BLIF 格式
yosys -p "synth; write_edif output.edif"      # EDIF 格式
yosys -p "synth; write_smt2 output.smt2"      # SMT2 格式
```

```python
# Python 腳本控制 Yosys
import subprocess

def synthesize(input_file, output_file, top_module):
    cmd = [
        'yosys',
        '-p', f'read_verilog {input_file}; '
              f'hierarchy -top {top_module}; '
              f'proc; opt; fsm; memory; synth; '
              f'write_verilog {output_file}'
    ]
    subprocess.run(cmd, check=True)

# 使用 TCL 腳本
tcl_script = """
read_verilog design.v
hierarchy -check -top design
proc
opt
fsm
memory
synth
write_verilog synth.v
"""
with open('synth.tcl', 'w') as f:
    f.write(tcl_script)

os.system('yosys -s synth.tcl')
```

### ABC

ABC 是 Berkeley 的開源邏輯合成和技術映射工具，常用作 Yosys 的後端。

```bash
# 基本命令
abc -c "read design.blif; strash; dch -f; map; write designmapped.blif"

# 與 Yosys 整合
yosys -p "synth; abc"

# ABC 內部命令
abc:
  read      # 讀入網表
  strash    # 結構雜湊
  collapse  # 層次扁平化
  dch       # 延遲計數
  map       # 技術映射
  resyn2    # 優化重組
  balance   # 平衡
  rewrite   # 重寫規則
```

```c
// ABC API 使用範例
#include "abc.h"

void optimize_logic(abcsix_t *p) {
    // 讀入網表
    Abc_Obj_t *pNode = Abc_NtkRead(p, "input.blif");
    
    // 結構雜湊
    Abc_NtkStrash(pNode);
    
    // 優化
    Abc_CommandCompress(p, "");
    Abc_CommandBalance(p, "");
    Abc_CommandRewrite(p, "-f");
    
    // 寫出
    Abc_NtkWrite(pNode, "output.blif", 0);
}
```

## 模擬器

### Icarus Verilog

開源 Verilog 模擬器，支援 IEEE 1364-2005 標準。

```bash
# 安裝
git clone https://github.com/steveicarus/iverilog.git
cd iverilog
sh autoconf.sh
./configure
make -j$(nproc)
sudo make install

# 編譯與模擬
iverilog -o testbench.vvp testbench.v design.v
vvp testbench.vvp

# 調試模式
iverilog -g2012 -o debug.vvp design.v
vvp -vvp-dump-file=wave.vcd debug.vvp

# 查看波形
gtkwave wave.vcd
```

```verilog
// testbench範例
`timescale 1ns/1ps

module tb_counter;
    reg clk, rst, enable;
    wire [7:0] count;
    
    // 被測試模組
    counter uut (
        .clk(clk),
        .rst(rst),
        .enable(enable),
        .count(count)
    );
    
    // 時鐘產生
    initial begin
        clk = 0;
        forever #5 clk = ~clk;
    end
    
    // 測試向量
    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_counter);
        
        rst = 1;
        enable = 0;
        #20 rst = 0;
        #10 enable = 1;
        #500 $finish;
    end
    
    // 監視
    always @(posedge clk) begin
        if (count == 100) begin
            $display("Test passed at time %t", $time);
            $finish;
        end
    end
endmodule
```

### Verilator

高效能 Verilog 模擬器，將 Verilog 轉換為 C++ 代碼，支援 SystemVerilog。

```bash
# 安裝
git clone https://github.com/verilator/verilator.git
cd verilator
git submodule update --init --recursive
autoconf
./configure
make -j$(nproc)
sudo make install

# 編譯
verilator --cc --trace-fst design.sv
make -C obj_dir -j$(nproc)

# 執行
./obj_dir/Vtop

# 產生fst波形
verilator --cc --trace-fst --trace-structs design.sv
```

```cpp
// C++ 測試框架
#include "Vtop.h"
#include "verilated.h"
#include "verilated_fst.h"

int main(int argc, char **argv) {
    Verilated::commandArgs(argc, argv);
    
    VerilatedFst* tfp = new VerilatedFst;
    
    Vtop* top = new Vtop;
    top->trace(tfp, 99);
    tfp->open("wave.fst");
    
    top->clk = 0;
    
    for (int i = 0; i < 100; i++) {
        top->clk = !top->clk;
        top->eval();
        tfp->dump(i * 10);
    }
    
    tfp->close();
    delete top;
    
    return 0;
}
```

```python
# Python 綁定 (使用 pyverilator)
from pyverilator import PyVerilator

sim = PyVerilator.build('design.sv')

# 執行多個週期
for i in range(100):
    sim.clock = i % 2 == 0
    sim.eval()
    print(f"Output: {sim.output_port}")
```

## 波形檢視工具

### GTKWave

```bash
# 安裝
git clone https://github.com/gtkwave/gtkwave.git
cd gtkwave
./configure
make -j$(nproc)
sudo make install

# 使用
gtkwave wave.vcd &

# 支援格式
gtkwave design.vcd      # VCD 格式
gtkwave design.fst      # FST 格式 (Verilator)
gtkwave design.lxt      # LXT 格式
gtkwave designghw      # GHW 格式
```

### Verdi/Open Source Alternatives

```tcl
# Verdi 風格的 TCL 命令
# 用於商業工具

# 查找訊號
search -name "clk*"
search -inst "/top/cpu/*"

# 添加波形
add wave -radix hex /top/cpu/alu_result

# 設定時序
waveZoom full

# 導出
writeghw design.ghw
```

## 實體設計工具

### OpenROAD

開源晶片布局工具，支援從 RTL 到 GDSII 的完整流程。

```bash
# 安裝
git clone https://github.com/The-OpenROAD-Project/OpenROAD.git
cd OpenROAD
sudo ./scripts/etc/install.sh

# 執行完整流程
cd flow
make DESIGN=spm

# 單步執行
./build/openroad -no_splash
```

```tcl
# OpenROAD TCL 腳本
# 讀入設計
read_liberty sky130hd/sky130_fd_sc_hd.db
read_verilog design.v

# 設置設計
link_design top

#  floorplan
initialize_floorplan -util 0.3 -aspect_ratio 1.0
place_pins -random -grid 2

# 放置
global_placement
place_opt

#  CTS
clock_tree_synthesis

# 佈線
detailed_route

# 寫出 GDS
write_gds output.gds
```

### Graywolf

開源放置工具，常與 Yosys 搭配使用。

```bash
# 使用
yosys -p "synth; write_verilog synth.v"
graywolf synth.v top_module
yosys -p "read_verilog synth.v; synth; write_verilog placed.v"
```

## 寄生提取與時序分析

### STATABLE

寄生參數提取：

```bash
# 使用 Magic
magic -dnull input.def
```

### OpenSTA

開源靜態時序分析工具：

```bash
# 基本使用
opensta -no_splash
read_liberty typical.db
read_verilog design.v
link_design top
report_timing
```

```tcl
# OpenSTA 腳本
read_liberty -min min.lib
read_liberty -max max.db
read_verilog top.v
link_design top
create_clock -name clk -period 10 [get_ports clk]
set_clock_uncertainty 0.5 [get_clocks clk]
report_timing -max
report_constraints
```

## 工藝檔案

### OpenPDK

開放工藝設計套件：

```bash
# 安裝
git clone https://github.com/RTimothyEdwards/openpdks.git
cd openpdks
./configure --with-sky130=/path/to/sky130A
make install
```

### Sky130 工藝

```python
# 使用 Sky130 單元庫
from sky130 import *

# 配置合成
synth_config = {
    'top_module': 'design',
    'liberty': 'sky130_fd_sc_hd.db',
    'target_library': 'sky130_fd_sc_hd',
    'wire_load_model': 'sky130'
}

# 執行合成
yosys -p f"""
read_liberty -ignore_missing sky130_fd_sc_hd.db
read_verilog design.v
hierarchy -check -top design
synth -top design -flatten
write_verilog synth.v
"""
```

## 驗證框架

### UVM 開源實現

```systemverilog
// 簡化 UVM 環境
`include "uvm_macros.svh"

module testbench;
    import uvm_pkg::*;
    
    // 事務
    class transaction extends uvm_sequence_item;
        rand bit [7:0] data;
        rand bit [2:0] addr;
        
        `uvm_object_utils_begin(transaction)
        `uvm_field_int(data, UVM_ALL_ON)
        `uvm_field_int(addr, UVM_ALL_ON)
        `uvm_object_utils_end
    endclass
    
    // 序列
    class my_sequence extends uvm_sequence #(transaction);
        `uvm_object_utils(my_sequence)
        
        task body;
            repeat(10) begin
                `uvm_do(req)
                #10;
            end
        endtask
    endclass
    
    // Driver
    class my_driver extends uvm_driver #(transaction);
        `uvm_component_utils(my_driver)
        
        virtual interface dut_if vif;
        
        task run_phase(uvm_phase phase);
            forever begin
                seq_item_port.get_next_item(req);
                drive_item(req);
                seq_item_port.item_done();
            end
        endtask
        
        task drive_item(transaction item);
            vif.data <= item.data;
            vif.addr <= item.addr;
            @(posedge vif.clk);
        endtask
    endclass
    
    // Agent
    class my_agent extends uvm_agent;
        my_driver driver;
        uvm_sequencer #(transaction) sequencer;
        
        function void build_phase(uvm_phase phase);
            super.build_phase(phase);
            driver = my_driver::type_id::create("driver", this);
            sequencer = uvm_sequencer #(transaction)::type_id::create("sequencer", this);
        endfunction
        
        function void connect_phase(uvm_phase phase);
            driver.seq_item_port.connect(sequencer.seq_item_export);
        endfunction
    endclass
    
    // 環境
    class my_env extends uvm_env;
        my_agent agent;
        
        function void build_phase(uvm_phase phase);
            super.build_phase(phase);
            agent = my_agent::type_id::create("agent", this);
        endfunction
    endclass
    
    // 測試
    class my_test extends uvm_test;
        my_env env;
        
        function void build_phase(uvm_phase phase);
            super.build_phase(phase);
            env = my_env::type_id::create("env", this);
        endfunction
        
        task run_phase(uvm_phase phase);
            my_sequence seq;
            phase.raise_objection(this);
            seq = my_sequence::type_id::create("seq");
            seq.start(env.agent.sequencer);
            #100;
            phase.drop_objection(this);
        endtask
    endclass
endmodule
```

## 開源 PDK

### 主流開放工藝

| 名稱 | 代工廠 | 節點 | 特色 |
|------|--------|------|------|
| Sky130 | SkyWater | 130nm | 完全開源 |
| GF180 | GlobalFoundries | 180nm | 類比支援 |
| OpenCore | Various | 多種 | 標準元件庫 |

```bash
# 使用 Sky130 設計流程
# 1. 獲取 PDK
git clone https://github.com/google/skywater-pdk.git

# 2. 配置 OpenROAD
export PDK_ROOT=/path/to/pdk
export PDK=sky130hd

# 3. 設計
openroad -exit design.tcl
```

## 整合工具鏈

### OpenLane

整合的開源 EDA 流程：

```bash
# 安裝
git clone https://github.com/The-OpenROAD-Project/openlane.git
cd openlane
make

# 使用
make design DESIGN=spm

# 或互動模式
./flow.tcl -interactive
```

```tcl
# OpenLane 配置
set ::env(DESIGN_NAME) "top_module"
set ::env(VERILOG_FILES) "design.v"
set ::env(CLOCK_PORT) "clk"
set ::env(CLOCK_PERIOD) 10.0

# 運行
source ./scripts/openlane/default_flow.tcl
run_synthesis
run_floorplan
run_placement
run_cts
run_routing
run_magic
```

### Makerchip

線上開源 EDA 平台：

```bash
# 本地使用
git clone https://github.com/Tom-Mac/Sandpiper-SAAS.git
cd Sandpiper-SAAS
docker-compose up
```

## 工具比較

### 開源 vs 商業

| 功能 | 開源工具 | 商業工具 |
|------|---------|---------|
| 邏輯合成 | Yosys + ABC | Design Compiler |
| 模擬 | Icarus, Verilator | ModelSim, VCS |
| 形式驗證 | Nextpnr + ABC | Conformal |
| 布局佈線 | OpenROAD | ICC, Innovus |
| 時序分析 | OpenSTA | PrimeTime |
| 工藝檔案 | Sky130, GF180 | 原廠 proprietary |

## 學習資源

```bash
# 建議學習路徑
# 1. 基礎
git clone https://github.com/steveicarus/iverilog.git
git clone https://github.com/YosysHQ/yosys.git
git clone https://github.com/gtkwave/gtkwave.git

# 2. 實踐項目
# - 自己動手做 CPU
# - 用 OpenROAD 設計晶片
# - 參與開源項目貢獻

# 3. 深入
# - 學習 TCL/Python 腳本
# - 研究 ABC 算法
# - 參與 OpenROAD 開發
```

## 相關概念

- [EDA](EDA.md) - EDA 基礎
- [Verilog](Verilog.md) - 硬體描述語言
- [IcarusVerilog](IcarusVerilog.md) - 開源模擬器
- [Verilator](Verilator.md) - 高效能模擬器
- [硬體驗證](硬體驗證.md) - 驗證方法

## Tags

#開源EDA #Yosys #IcarusVerilog #Verilator #OpenROAD #Sky130