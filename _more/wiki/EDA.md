# EDA (電子設計自動化)

電子設計自動化（Electronic Design Automation, EDA）是指使用電腦輔助設計工具來設計和分析電子系統的技術領域。EDA 工具涵蓋了從積體電路設計、pcb 佈局到系統驗證的完整流程。這些工具讓工程師能夠設計越來越複雜的晶片，從數十萬閘到數十億閘的大型積體電路。EDA 是現代半導體產業的基石，沒有 EDA 工具，就無法設計 современ超大規模積體電路。

## EDA 發展歷程

### 歷史演進

```
EDA 發展階段：
• 1960s: 早期自動化
  - 互動式圖形系統
  - 電晶體層級設計

• 1970s: 正式化設計
  - 語言基礎 (HDL)
  - 標準單元庫

• 1980s: 商業化爆發
  - 邏輯合成
  - 自動佈局

• 1990s: 深次微米
  - 時序驅動設計
  - 驗證工具

• 2000s-現在: 先進節點
  - 製程相關設計
  - 多重曝光
  - 系統級設計
```

## EDA 工作流程

### 完整設計流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      EDA 設計流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                              │
│  系統規格                                                     │
│       ↓                                                      │
│  架構設計 ─── 功能驗證                                         │
│       ↓                                                      │
│  RTL 設計 ─── 功能模擬                                         │
│       ↓                                                      │
│  邏輯合成 ─── 等效性檢查                                       │
│       ↓                                                      │
│  實體設計 ─── 形式驗證                                         │
│       ↓                                                      │
│  版圖驗證 ─── DRC/LVS                                          │
│       ↓                                                      │
│  GDSII ─── 晶片製造                                            │
│                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### 各階段工具

```python
# 1. 功能設計
# • 行為建模: MATLAB/Simulink, SystemC
# • 驗證: UVM, SystemVerilog

# 2. RTL 設計
# • 編輯器: Vim, Emacs, VS Code
# • 語法檢查: lint
# • 模擬: ModelSim, VCS, Incisive

# 3. 邏輯合成
# • 合成工具: Design Compiler, Genus
# • 形式驗證: Conformal, Formality

# 4. 實體設計
# • 自動放置: ICC, Innovus
# • 自動佈線: Route, IC Compiler
# • 時序分析: PrimeTime, Tempus

# 5. 版圖驗證
# • DRC: Calibre
# • LVS: Calibre, StarRC
# • 寄生提取: StarRC, QRC
```

## 主要 EDA 工具類別

### 模擬器

```verilog
// 模擬類型
// • 功能模擬: 驗證功能正確性
// • 時序模擬: 含時序延遲
// • 功率模擬: 估計功耗

// 主流模擬器：
// - ModelSim (Mentor)
// - VCS (Synopsys)
// - Incisive (Cadence)
// - Icarus Verilog (開源)
// - Verilator (開源，高效能)
```

### 邏輯合成

```bash
# 邏輯合成流程
# 1. 讀入 RTL 碼
read_verilog design.v

# 2. 定義目標庫
set_target_library stdcell.db

# 3. 設定約束
create_clock -period 10 [get_ports clk]
set_input_delay -clock clk 2 [all_inputs]
set_output_delay -clock clk 2 [all_outputs]

# 4. 執行合成
compile_ultra

# 5. 輸出
write -format verilog -hierarchy -output synthesized.v
```

### 形式驗證

```
形式驗證技術：
• 模型檢查 (Model Checking)
  - 有限狀態系統窮舉搜索
  - 適用於協定驗證

• 等效性檢查 (Equivalence Checking)
  - RTL vs Netlist
  - Netlist vs 版圖

• 定理證明 (Theorem Proving)
  - 數學證明
  - 適合複雜設計
```

### 時序分析

```python
# 時序分析類型
# • 靜態時序分析 (STA)
#   - 不需要模擬
#   - 檢查所有路徑
#   - 主流方法

# • 動態時序分析
#   - 需要模擬向量
#   - 覆蓋率高但耗時
```

### 功率分析

```python
# 功率分析
# • 動態功率
#   P_dynamic = C × V² × f
#   - 開關功率
#   - 短路功率

# • 靜態功率
#   P_static = I_leak × V
#   - 漏電流功耗

# 分析工具：
# - PowerArtist (Synopsys)
# - PowerPro (Cadence)
# - Voltus (Cadence)
```

## 先進設計技術

### 低功率設計

```verilog
// 功率優化技術
// • 時脈閘控 (Clock Gating)
// • 電源閘控 (Power Gating)
// • 多電壓域 (Multi-Voltage)
// • 動態電壓頻率調整 (DVFS)

// 時脈閘控範例
always @(*) begin
    if (enable)
        clk_en = clk;
    else
        clk_en = 1'b0;
end
```

### 時序收斂

```
時序收斂策略：
• 初期約束
  - 樂觀約束
  - 迭代收斂

• 收斂技術
  - 重新合成
  - 重新放置
  - 減少負載
  - 緩衝器插入
```

### 可製造性設計

```
DFM 技術：
• Design for Test (DFT)
• Design for Manufacturing (DFM)
• Design for Yield (DFY)

常見技術：
• 規則檢查
• 光學鄰近修正 (OPC)
• 二次曝光 (DP)
```

## 主要 EDA 廠商

### 商業工具

```
領導廠商：
• Synopsys
  - Design Compiler (合成)
  - PrimeTime (時序)
  - VCS (模擬)
  - IC Compiler (實體設計)

• Cadence
  - Genus (合成)
  - Tempus (時序)
  - Virtuoso (類比/自訂)
  - Innovus (實體設計)

• Mentor Graphics
  - ModelSim (模擬)
  - Calibre (驗證)
  - Tanner (類比)
```

### 開源工具

```python
# 開源 EDA 工具
# • 模擬
#   - Icarus Verilog
#   - Verilator
#   - OSS CAD Suite

# • 合成
#   - Yosys (開源合成)
#   - ABC (布林合成)

# • 實體設計
#   - OpenROAD
#   - Magic (layout)

# • 驗證
#   - GTKWave (波形)
#   - OpenSTA (時序)
```

## 驗證方法學

### 驗證金字塔

```
┌─────────────────────────────────────────────────────────────────┐
│                      驗證金字塔                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                              │
│       ╱╲                                                       │
│      ╱  ╲   系統驗證                                          │
│     ╱────╲                                                     │
│    ╱      ╲  整合驗證                                         │
│   ╱────────╲                                                   │
│  ╱          ╲ 元件驗證                                         │
│ ╱────────────╲                                                 │
│ ╱              ╲ 單元/區塊驗證                                  │
│ ─────────────────                                              │
│                                                              │
│  更多模擬向量 ← 覆蓋率                                          │
│  ↓                                                            │
│  更快模擬 ← 抽象層次                                            │
│                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### UVM 驗證

```systemverilog
// UVM 範例
class my_driver extends uvm_driver #(my_transaction);
    `uvm_component_utils(my_driver)
    
    virtual interface my_if vif;
    
    virtual function void build_phase(uvm_phase phase);
        super.build_phase(phase);
        if (!uvm_config_db#(virtual my_if)::get(this, "", "vif", vif))
            `uvm_fatal("NOVIF", "virtual interface not set")
    endfunction
    
    virtual task run_phase(uvm_phase phase);
        forever begin
            seq_item_port.get_next_item(req);
            drive_item(req);
            seq_item_port.item_done();
        end
    endtask
    
    virtual task drive_item(my_transaction item);
        vif.data <= item.data;
        vif.valid <= 1'b1;
        @(posedge vif.clk);
    endtask
endclass
```

## 相關概念

- [Verilog](Verilog.md) - 硬體描述語言
- [數位邏輯](數位邏輯.md) - 數位電路基礎
- [CPU架構](CPU架構.md) - CPU 設計
- [硬體驗證](硬體驗證.md) - 驗證方法
- [IcarusVerilog](IcarusVerilog.md) - 開源 Verilog 模擬器
- [Verilator](Verilator.md) - 高效能 Verilog 模擬器