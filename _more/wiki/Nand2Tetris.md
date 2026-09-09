# Nand2Tetris

Nand2Tetris（又稱 The Elements of Computing Systems）是一門透過從頭建構一台完整電腦來學習計算機科學的經典課程。由 Noam Nisan 和 Shimon Schocken 教授開發，這門課程從最基礎的 NAND 閘開始，逐步建構出，包含硬體平台、虛擬機器、編譯器和作業系統。這個專案式學習方法讓學習者能夠全面理解計算機系統的每個層次，是電腦科學教育的典範。

## 課程概述

### 設計理念

```
┌─────────────────────────────────────────────────────────────────┐
│                      Nand2Tetris 設計理念                      │
├─────────────────────────────────────────────────────────────────┤
│                                                              │
│  從硬體到軟體的完整堆疊：                                     │
│                                                              │
│  Level 1: 硬體                                                │
│  NAND → ALU → CPU → 完整電腦                                  │
│                                                              │
│  Level 2: 組譯                                                │
│  機器碼 → 組合語言                                            │
│                                                              │
│  Level 3: 虛擬機器                                            │
│  組合語言 → 虛擬機指令                                        │
│                                                              │
│  Level 4: 高階語言                                            │
│  虛擬機 → Jack 語言                                          │
│                                                              │
│  Level 5: 編譯器                                              │
│  Jack → 虛擬機                                                │
│                                                              │
│  Level 6: 作業系統                                           │
│  基本服務和標準庫                                              │
│                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## 專案結構

### 12個章節專案

```python
# 第一部分：硬體
# Chapter 1: 布林邏輯
# - 實作 NAND, AND, OR, NOT, XOR 等閘
# - 多位元匯流排
# - Mux, DMux

# Chapter 2: 布林運算
# - 加法器 (Half, Full, Add16)
# - 增量器 (Inc16)
# - 算術邏輯單元 (ALU)

# Chapter 3: 記憶體
# - DFF, Register
# - RAM8, RAM64, RAM512, RAM4K, RAM16K
# - 計數器 (PC)

# Chapter 4: 機器語言
# - Hack 指令集
# - 輸入/輸出處理
# - 顯示和鍵盤

# Chapter 5: 電腦架構
# - CPU
# - 記憶體
# - 完整電腦

# 第二部分：軟體
# Chapter 6: 虛擬機器 I
# - 算術指令
# - 記憶體存取

# Chapter 7: 虛擬機器 II
# - 流程控制
# - 函式呼叫

# Chapter 8: 高階語言
# - Jack 語言語法
# - 類別和物件

# Chapter 9: 標準庫
# - Math, String, Array
# - Output, Screen, Keyboard

# Chapter 10: 編譯器 I
# - 詞法分析
# - 語法分析

# Chapter 11: 編譯器 II
# - 程式碼生成

# Chapter 12: 作業系統
# - Memory, Math, String
# - Array, Output, Keyboard
```

## Hack 平台

### 硬體規格

```verilog
// Hack 硬體規格
// ALU:
// - 輸入: A, D, M (Memory)
// - 輸出: out
// - 控制: zx, nx, zy, ny, f, no
//
// 指令格式:
// - A-指令: @value (15位元)
// - C-指令: dest=comp;jump
//   - 111 a c1 c2 c3 c4 c5 c6 d1 d2 d3 j1 j2 j3

// 記憶體:
// - 資料記憶體: 16K RAM
// - 指令記憶體: 16K ROM
// - 顯示: 512x256 黑白
// - 鍵盤: 鍵盤矩陣
```

### 組合語言範例

```assembly
// 計算 1+2+3+...+100
// 存於 R0

   @i       // i = 1
   M=1
   @sum     // sum = 0
   M=0
(LOOP)
   @i
   D=M      // D = i
   @100
   D=D-A    // D = i - 100
   @END
   D;JGT    // if i > 100 goto END
   
   @sum
   D=M      // D = sum
   @i
   D=D+M    // D = sum + i
   @sum
   M=D      // sum = sum + i
   
   @i
   M=M+1    // i = i + 1
   
   @LOOP
   0;JMP    // goto LOOP
(END)
   @sum
   D=M
   @0
   M=D      // 結果存於 R0
   
(ENDLOOP)
   @ENDLOOP
   0;JMP
```

## 實作工具

### 硬體模擬器

```bash
# NandSim - 硬體描述語言模擬器
# GUI 介面顯示電路運作
# 支援時序圖追蹤
```

### 軟體工具

```python
# VM Emulator
# - 執行 .vm 檔案
# - 視覺化堆疊和記憶體

# CPU Emulator
# - 執行Hack機器碼
# - 單步執行和中斷點

# Jack Compiler
# - Jack 到 VM 翻譯
# - 語法檢查
```

## 學習價值

### 核心收獲

```
Nand2Tetris 學習價值：
• 硬體基礎：理解數位電路運作原理
• 電腦架構：了解 CPU、記憶體、I/O
• 程式語言理論：語法分析、編譯器
• 作業系統概念：記憶體管理、檔案系統
• 系統思考：層次化設計、抽象
• 專案實作：從零建構完整系統
```

### 適合對象

```
目標讀者：
• 電腦科學學生
• 軟體工程師想了解硬體
• 自學者想理解計算機運作
• 教育工作者設計課程
```

## 擴展資源

### 線上課程

```
相關資源：
• Coursera: Nand2Tetris 課程
• Nand2Tetris 官網 nand2tetris.org
• 書籍: "The Elements of Computing Systems"
```

## 相關概念

- [數位邏輯](數位邏輯.md) - 數位電路基礎
- [Verilog](Verilog.md) - 硬體描述語言
- [CPU架構](CPU架構.md) - CPU 設計
- [編譯器](編譯器.md) - 編譯器原理
- [組合語言](組合語言.md) - 低階程式設計