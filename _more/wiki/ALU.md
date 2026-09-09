# 算術邏輯單元 (ALU)

## 概述

算術邏輯單元 (Arithmetic Logic Unit, ALU) 是 CPU 的核心元件，負責執行所有算術運算和邏輯運算。

## 基本結構

```
        ┌───────────────────────┐
        │         ALU           │
        ├───────────────────────┤
   A ──→│                       │
        │   ┌───────────────┐ │
        │   │  算術電路       │ │
   B ──→│   ├───────────────┤ │
        │   │  邏輯電路       │ │──→ Result
        │   ├───────────────┤ │
  ALU ──→│   │  移位電路       │ │
  Op    │   └───────────────┘ │
        │                       │
        │   ┌───────────────┐ │
        └──→│    Flags       │ │
            │ Z(Zero)        │ │
            │ C(Carry)       │ │
            │ N(Negative)    │ │
            │ V(Overflow)    │ │
            └───────────────┘ │
            └───────────────────────┘
```

## 算術運算電路

### 半加器 (Half Adder)
```
     A ──┬──┐
          │  ├── AND ──→ Carry
     B ──┬──┤
          │  ├── XOR ──→ Sum
     A ──┬──┘
          │
     B ──┘
```

真值表：
| A | B | Sum | Carry |
|---|---|-----|-------|
| 0 | 0 | 0   | 0     |
| 0 | 1 | 1   | 0     |
| 1 | 0 | 1   | 0     |
| 1 | 1 | 0   | 1     |

### 全加器 (Full Adder)
```verilog
module full_adder (
    input a, b, cin,
    output sum, cout
);
    assign sum = a ^ b ^ cin;
    assign cout = (a & b) | (cin & (a ^ b));
endmodule
```

### N 位元加法器
```verilog
module adder_n #(
    parameter N = 32
) (
    input [N-1:0] a, b,
    input cin,
    output [N-1:0] sum,
    output cout
);
    wire [N:0] carry;
    assign carry[0] = cin;
    
    genvar i;
    generate
        for (i = 0; i < N; i = i + 1) begin : adder
            full_adder fa (
                .a(a[i]),
                .b(b[i]),
                .cin(carry[i]),
                .sum(sum[i]),
                .cout(carry[i+1])
            );
        end
    endgenerate
    
    assign cout = carry[N];
endmodule
```

### 漣波進位加法器 vs 進位前瞻
```
漣波進位 (Ripple Carry):
  [FA] → [FA] → [FA] → [FA]
   ↑      ↑      ↑      ↑
   └──────┴──────┴──────┘
   carry 依序傳播，延遲 O(N)

進位前瞻 (Carry Lookahead):
   ┌─────────┐
   │  CLA    │ → 快速產生所有進位
   │  Logic  │   延遲 O(log N)
   └─────────┘
```

## 邏輯運算電路

### 基本邏輯閘
| 運算 | 符號 | Verilog |
|------|------|---------|
| AND | & | `a & b` |
| OR | \| | `a \| b` |
| NOT | ~ | `~a` |
| XOR | ^ | `a ^ b` |
| NAND | | `~(a & b)` |

### 多工器 (Multiplexer)
```verilog
module mux2to1 (
    input [31:0] a, b,
    input sel,
    output [31:0] y
);
    assign y = sel ? b : a;
endmodule

module mux4to1 (
    input [31:0] a, b, c, d,
    input [1:0] sel,
    output [31:0] y
);
    assign y = sel[1] ? (sel[0] ? d : c) : (sel[0] ? b : a);
endmodule
```

## 移位器 (Shifter)

```verilog
module barrel_shifter (
    input [31:0] data_in,
    input [4:0] shamt,      // 移位量 (0-31)
    input [1:0] type,        // 0: 邏輯左, 1: 邏輯右, 2: 算術右
    output reg [31:0] data_out
);
    always @(*) begin
        case (type)
            2'b00: data_out = data_in << shamt;      // SLL
            2'b01: data_out = data_in >> shamt;      // SRL
            2'b10: data_out = $signed(data_in) >>> shamt;  // SRA
            default: data_out = data_in;
        endcase
    end
endmodule
```

## 比較器

```verilog
module comparator (
    input [31:0] a, b,
    output eq, ne, lt, le, gt, ge
);
    assign eq = (a == b);
    assign ne = (a != b);
    assign lt = ($signed(a) < $signed(b));
    assign le = ($signed(a) <= $signed(b));
    assign gt = ($signed(a) > $signed(b));
    assign ge = ($signed(a) >= $signed(b));
endmodule
```

## 進位旗標 (Carry Flag) 計算

### 無號數進位
```verilog
// 減法時：Borrow = NOT(Cout)
assign C = (a[31] & b[31]) | (b[31] & ~result[31]) | (~result[31] & a[31]);
```

### 帶號數溢位 (Overflow Flag)
```verilog
// 只有在兩個同號數相加結果為異號時才會溢位
assign V = (a[31] == b[31]) && (result[31] != a[31]);
```

## 完整 ALU 設計

```verilog
module alu (
    input [31:0] a, b,
    input [3:0] op,
    output [31:0] result,
    output zero, negative, carry, overflow
);
    reg [31:0] result;
    
    always @(*) begin
        case (op)
            4'b0000: result = a + b;           // ADD
            4'b0001: result = a - b;           // SUB
            4'b0010: result = a & b;           // AND
            4'b0011: result = a | b;           // OR
            4'b0100: result = a ^ b;           // XOR
            4'b0101: result = ~a;              // NOT
            4'b0110: result = a << b[4:0];     // SLL
            4'b0111: result = a >> b[4:0];     // SRL
            4'b1000: result = $signed(a) >>> b[4:0]; // SRA
            4'b1001: result = (a < b) ? 32'd1 : 32'd0; // SLT
            default: result = 32'd0;
        endcase
    end
    
    assign zero = (result == 32'd0);
    assign negative = result[31];
    assign carry = (op == 4'b0000) && (a[31] && b[31]);
    assign overflow = (op == 4'b0000) && 
        (a[31] == b[31]) && (result[31] != a[31]);
endmodule
```

## 效能考量

| 優化技術 | 說明 | 影響 |
|----------|------|------|
| 進位前瞻 | 減少進位傳播延遲 | O(N) → O(log N) |
| 管線化 | 分割組合邏輯 | 提升時脈頻率 |
| 進位儲存加法器 | 使用進位儲存而非進位傳遞 | 高速加法 |

## 相關資源

- 相關概念：[數位邏輯](數位邏輯.md)
- 相關概念：[CPU架構](CPU架構.md)

## Tags

#ALU #算術電路 #邏輯電路 #數位電路
