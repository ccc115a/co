# Icarus Verilog

Icarus Verilog 是一個開源的 Verilog 模擬器，支援 IEEE-2005 標準的大部分功能。由 Stephen Williams 開發維護，是最受歡迎的開源 Verilog 工具之一。Icarus Verilog 可以編譯 Verilog 程式碼為 VVP 執行檔進行模擬，適合教學、專案開發和快速原型驗證。它經常與 GTKWave 波行檢視器搭配使用，是開源 HDL 開發工作流程的核心工具。

## 安裝

### 在 Linux 上安裝

```bash
# Ubuntu/Debian
sudo apt-get install iverilog

# Fedora
sudo dnf install iverilog

# Arch Linux
sudo pacman -S iverilog

# 從原始碼編譯
git clone https://github.com/steveicarus/iverilog.git
cd iverilog
sh bootstrap
./configure
make
sudo make install
```

### 在 macOS 上安裝

```bash
# 使用 Homebrew
brew install icarus-verilog

# 使用 MacPorts
sudo port install iverilog
```

## 基本使用

### 編譯和模擬流程

```bash
# 1. 編譯 Verilog 到 VVP
iverilog -o test.vvp test.v

# 2. 執行模擬
vvp test.vvp

# 3. 查看波形
gtkwave test.vcd &
```

### 常用選項

```bash
# 輸出選項
iverilog -o output.vvp input.v

# 指定目標標準
-verilog2k    # Verilog-2005
-verilog-2005  # 顯式指定

# 模擬層級
-g2005         # 預設

# 警告控制
-Wall          # 啟用所有警告
-Wno-timescale # 隱藏時間尺度警告

# 包含路徑
-I./include    # 加入 include 目錄

# 定義巨集
-DSIMULATION    # 定義 SIMULATION

# 除錯資訊
-g             # 產生除錯資訊
```

## 程式碼範例

### 簡單測試

```verilog
// alu.v
module alu (
    input  wire [7:0] a, b,
    input  wire [2:0] op,
    output reg  [7:0] result,
    output wire       zero
);

    always @(*) begin
        case (op)
            3'd0: result = a + b;
            3'd1: result = a - b;
            3'd2: result = a & b;
            3'd3: result = a | b;
            3'd4: result = a ^ b;
            default: result = 8'd0;
        endcase
    end

    assign zero = (result == 8'd0);

endmodule
```

```verilog
// tb_alu.v
module tb;

    reg [7:0] a, b;
    reg [2:0] op;
    wire [7:0] result;
    wire zero;

    alu dut (.a(a), .b(b), .op(op), .result(result), .zero(zero));

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb);
        
        // 測試加法
        a = 8'd10; b = 8'd20; op = 3'd0; #10;
        $display("a+b=%d result=%d zero=%b", a+b, result, zero);
        
        // 測試減法
        a = 8'd30; b = 8'd10; op = 3'd1; #10;
        
        // 測試 AND
        a = 8'hAA; b = 8'h55; op = 3'd2; #10;
        
        // 測試零
        a = 8'd0; b = 8'd0; op = 3'd0; #10;
        
        $display("測試完成");
        $finish;
    end

endmodule
```

```bash
# 編譯和執行
iverilog -o tb_alu.vvp tb_alu.v alu.v
vvp tb_alu.vvp
```

## 支援的功能

### 標準相容性

```
Icarus Verilog 支援：
• Verilog-1995
• Verilog-2001
• Verilog-2005 (大部分)
• SystemVerilog (部分)
• 可合成子集
```

### 支援的結構

```verilog
// 支援的語法
module ... endmodule
function ... endfunction
task ... endtask
always, initial
assign, force
case, if-else, for, while, repeat
// 參數、define、include
```

### 不支援的功能

```
限制：
• 完整的 SystemVerilog
• 時序驅動模擬
• 特定的商業擴展
• 某些先進的驗證特性
```

## 進階使用

### 多模組編譯

```bash
# 方式 1: 所有檔案一起編譯
iverilog -o top.vvp top.v module1.v module2.v

# 方式 2: 使用 library
iverilog -o top.vvp -L./lib top.v

# 方式 3: 預先編譯模組
iverilog -o module1.vvp module1.v
iverilog -o top.vvp -y module1.vvp top.v
```

### 條件編譯

```verilog
`ifdef SIMULATION
    initial $display("Simulation mode");
`endif

`define WIDTH 8
`define ADD(a,b) ((a)+(b))

// 使用
wire [7:0] result = `ADD(a, b);
```

### 波形產生

```verilog
// 指定要追蹤的信號
initial begin
    $dumpfile("wave.vcd");
    $dumpvars();           // 所有層級
    $dumpvars(0, top.dut); // 特定模組
    $dumpvars(0, tb.a, tb.b, tb.y); // 特定訊號
end

// 部分訊號
initial begin
    $dumpvars(1, tb);  // 層級 1
end
```

## 與 GTKWave 整合

### 使用流程

```bash
# 1. 產生 VCD 檔案
iverilog -o sim.vvp tb.v
vvp sim.vvp

# 2. 開啟波形檢視器
gtkwave wave.vcd &
```

### GTKWave 功能

```python
# GTKWave 功能：
# • 檢視訊號波形
# • 放大/縮小
# • 測量時序
# • 匯出資料
# • 搜尋值變化
# • 儲存工作區
```

## 與其他工具比較

| 特性 | Icarus Verilog | Verilator | ModelSim | VCS |
|------|----------------|-----------|----------|-----|
| 授權 | 開源 | 開源 | 商業 | 商業 |
| 速度 | 慢 | 快 | 中等 | 快 |
| 支援 | 基本 | 完整 | 完整 | 完整 |
| SystemVerilog | 部分 | 完整 | 完整 | 完整 |

## 常見問題

### 除錯技巧

```verilog
// 顯示訊息
$display("Value at time %t: %d", $time, data);
$write(".");
$strobe("Final value: %d", data);

// 中止模擬
$finish;
$stop;

// 監視
$monitor("a=%d b=%d", a, b);
```

### 效能優化

```bash
# 選項說明
-O          # 最佳化
-O2         # 更高最佳化

# 減少模擬時間
-UNSIGNED   # 視為無號數
-noinline   # 禁用內聯
```

## 腳本範例

### Makefile

```makefile
# Makefile for Verilog project

VERILOG = iverilog
VVP = vvp
WAVE = gtkwave

SRC = alu.v
TB = tb_alu.v
OUTPUT = tb_alu.vvp
WAVEFILE = wave.vcd

.PHONY: all run clean wave

all: $(OUTPUT)

$(OUTPUT): $(TB) $(SRC)
	$(VERILOG) -o $@ $(TB) $(SRC)

run: $(OUTPUT)
	$(VVP) $(OUTPUT)

clean:
	rm -f $(OUTPUT) $(WAVEFILE)

wave: run
	$(WAVE) $(WAVEFILE) &
```

### 自動化測試

```bash
#!/bin/bash
# run_tests.sh

for test in test_*.v; do
    echo "Testing $test..."
    name=$(basename $test .v)
    iverilog -o ${name}.vvp $test ../rtl/*.v
    if vvp ${name}.vvp | grep -q "FAILED"; then
        echo "FAILED: $test"
        exit 1
    else
        echo "PASSED: $test"
    fi
done
echo "All tests passed!"
```

## 相關概念

- [Verilog](Verilog.md) - Verilog 語言
- [HDL](HDL.md) - 硬體描述語言
- [EDA](EDA.md) - 電子設計自動化
- [Verilator](Verilator.md) - 高效能模擬器
- [GTKWave](GTKWave.md) - 波形檢視器