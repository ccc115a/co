# 《GPU 與神經網路晶片：架構、硬體設計與 AI 算力加速》

---

## 第一篇：基礎篇 — AI 算力革命與平行計算範式

* **第 1 章：AI 算力時代的降臨**
   * [1.1 - 從摩爾定律失效到 Domain-Specific Architecture (DSA)](1.1.md)
   * [1.2 - 深度學習運算特徵：矩陣乘法（GEMM）與張量（Tensor）計算](1.2.md)
   * [1.3 - 馮紐曼瓶頸（Von Neumann Bottleneck）與記憶體牆（Memory Wall）](1.3.md)
   * [1.4 - 計算密度（FLOPs）、記憶體頻寬（BW）與算力利用率（MFU）](1.4.md)

* **第 2 章：計算架構演進：CPU、GPU、NPU 到 TPU**
   * [2.1 - 傳統 CPU 的限制：超純量、指令預測與大快取](2.1.md)
   * [2.2 - GPU 的崛起：SIMD/SIMT（單指令多執行緒）架構邏輯](2.2.md)
   * [2.3 - NPU 與 ASIC 的本質：Systolic Array（脈動陣列）與資料流架構](2.3.md)
   * [2.4 - 各類架構在 Latency（延遲）、Throughput（吞吐量）與 Efficiency（能效比）的取捨](2.4.md)

---

## 第二篇：GPU 硬體微架構與程式化模型

* **第 3 章：現代 GPU 微架構深度剖析**
   * [3.1 - Streaming Multiprocessor (SM) 核心組件：ALU、Tensor Core、L1 Cache/Shared Memory](3.1.md)
   * [3.2 - 執行緒調度與資源分配：Warp Scheduling 與 Occupancy 優化](3.2.md)
   * [3.3 - 記憶體階層（Memory Hierarchy）：Registers、Shared Memory、L2 Cache 到 HBM](3.3.md)
   * [3.4 - 案例分析：NVIDIA Hopper (H100/H200) 與 Blackwell 架構解析](3.4.md)

* **第 4 章：GPU 程式化模型與底層加速**
   * [4.1 - CUDA 核心概念：Grids, Blocks, Threads 與記憶體映射](4.1.md)
   * [4.2 - Tensor Core 底層指令與 WMMA / MMA API](4.2.md)
   * [4.3 - 記憶體存取優化：Coalescing（合併存取）與 Bank Conflict 消除](4.3.md)
   * [4.4 - CUDA Graph 與 Kernel Fusion（核心融合）技術](4.4.md)

---

## 第三篇：神經網路專用晶片（NPU/TPU）硬體設計

* **第 5 章：Systolic Array（脈動陣列）設計與實現**
   * [5.1 - 脈動陣列運作機制：Weight-Stationary vs. Output-Stationary vs. Input-Stationary](5.1.md)
   * [5.2 - Google TPU (v1~v6) 微架構演進](5.2.md)
   * [5.3 - 控制邏輯、PE（Processing Element）單元與資料對齊（Data Alignment）](5.3.md)

* **第 6 章：稀疏性、低精度與量化運算單元**
   * [6.1 - 數值格式演進：FP32、FP16、BF16、INT8、FP8 至 FP4](6.1.md)
   * [6.2 - 低精度矩陣乘法硬體設計（ALU 轉型與縮放因子管理）](6.2.md)
   * [6.3 - 稀疏性（Sparsity）加速：NVIDIA 2:4 稀疏架構與硬體解碼器](6.3.md)

* **第 7 章：SRAM 與片上快取（On-Chip Memory）設計**
   * [7.1 - Scratchpad Memory vs. Cache 系統](7.1.md)
   * [7.2 - Ping-Pong Buffer 與 Direct Memory Access (DMA) 控制器](7.2.md)
   * [7.3 - 資料重用（Data Reuse）策略與 Dataflow 架構優化](7.3.md)

---

## 第四篇：記憶體牆突破與先進封裝技術

* **第 8 章：高頻寬記憶體（HBM）與記憶體傳輸介面**
   * [8.1 - HBM2e / HBM3e / HBM4 技術規格與介面協定](8.1.md)
   * [8.2 - Interconnect（互連）技術：NVLink、PCIe Gen 5/6 與 CXL 協定](8.2.md)
   * [8.3 - Scale-Up 與 Scale-Out：晶片內與晶片間的高速通訊拓撲](8.3.md)

* **第 9 章：近存計算（PIM）與晶圓級整合**
   * [9.1 - Processing-In-Memory (PIM) 與 Compute-In-Memory (CIM)](9.1.md)
   * [9.2 - 2.5D/3D 先進封裝：CoWoS、InFO 與 TSV（矽穿孔）技術](9.2.md)
   * [9.3 - Chiplet（小晶片）架構與 UCIe 介面標準](9.3.md)
   * [9.4 - 晶圓級晶片（Wafer-Scale Engine）：Cerebras 架構剖析](9.4.md)

---

## 第五篇：軟硬體協同設計（Co-Design）與編譯器

* **第 10 章：AI 編譯器與硬體抽象層**
   * [10.1 - AI 編譯器架構：High-Level IR (Graph) 到 Low-Level IR (Operator)](10.1.md)
   * [10.2 - TVM、MLIR 與 OpenAI Triton 簡介](10.2.md)
   * [10.3 - 算子自動排程（Auto-Tuning）與記憶體配置優化](10.3.md)

* **第 11 章：大語言模型（LLM）算力優化實戰**
   * [11.1 - LLM 推理瓶頸：Prefill 階段（Compute-Bound）與 Decode 階段（Memory-Bound）](11.1.md)
   * [11.2 - FlashAttention 硬體感知的 Attention 計算演算法](11.2.md)
   * [11.3 - KV Cache 記憶體管理與 PagedAttention 技術](11.3.md)

---

## 第六篇：前沿趨勢與未來展望

* **第 12 章：下一代 AI 晶片技術**
   * [12.1 - 光學計算與光子 AI 晶片（Optical/Photonic Computing）](12.1.md)
   * [12.2 - 類腦計算（Neuromorphic Computing）與事件驅動架構](12.2.md)
   * [12.3 - AI 晶片的功耗、散熱挑戰與液冷（Liquid Cooling）技術](12.3.md)
   * [12.4 - 邊端 AI (Edge AI) 晶片的超低功耗設計](12.4.md)

---

