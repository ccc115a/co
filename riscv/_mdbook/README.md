# 《從零開始的 RISC-V：從指令集架構到晶片設計與軟體生態》

本書面向計算機結構學習者、硬體工程師與軟體開發者，從指令集架構（ISA）出發，經微結構與晶片設計、GPU 與 CUDA 平行計算、特權架構與系統程式、嵌入式與作業系統，一直到編譯工具鏈與自訂擴充，完整覆蓋 RISC-V 軟硬體生態系。

> 寫作語言為繁體中文，術語採中英對照，程式範例以 RISC-V 組合語言、C、Verilog/SystemVerilog 為主，輔以 Mermaid 圖表說明資料路徑與系統流程。

## 範例程式碼

動手做範例放在 [`_code/`](_code/README.md)，按章分目錄（`ch01`–`ch20` 對應第 1–20 章），每個子目錄都有 README 與可執行的驗證（`make` / `python3` / QEMU 真機）。
快速試跑：`make -C _code/ch03`（指令解碼）、`make -C _code/ch05`（單週期 CPU 模擬）、`make -C _code/ch15 check`（QEMU 跑出 Hello RISC-V）。

## 第一篇：基礎與架構篇 (Fundamentals & ISA)

- 一、RISC-V 的崛起與革命
   - [1.1 傳統 ISA 的痛點與專利限制（x86 vs. ARM）](1.1.md)
   - [1.2 RISC-V 的誕生背景與 Berkeley 的願景](1.2.md)
   - [1.3 開源硬體模式與 RISC-V 基金會的運作機制](1.3.md)
   - [1.4 為什麼選擇 RISC-V？簡潔、模組化與可擴展性](1.4.md)

- 二、RISC-V 指令集設計哲學與模組化架構
   - [2.1 Base + Extensions 的模組化思維](2.1.md)
   - [2.2 暫存器架構：通用暫存器 (x0-x31) 與特殊暫存器 (PC)](2.2.md)
   - [2.3 ABI 命名規範與暫存器使用慣例](2.3.md)
   - [2.4 記憶體定址與 Endianness](2.4.md)

- 三、基礎整數指令集 (RV32I / RV64I)
   - [3.1 6 大指令格式解析 (R/I/S/B/U/J-type)](3.1.md)
   - [3.2 算術與邏輯指令 (ALU operations)](3.2.md)
   - [3.3 記憶體存取指令 (Load/Store)](3.3.md)
   - [3.4 分支與跳躍指令 (Control Transfer)](3.4.md)
   - [3.5 環境呼叫與系統指令 (ECALL, EBREAK, FENCE)](3.5.md)

- 四、標準擴充模組 (Standard Extensions)
   - [4.1 M 擴充：乘法與除法架構](4.1.md)
   - [4.2 A 擴充：原子指令與多核心同步 (Atomic & LR/SC)](4.2.md)
   - [4.3 F/D 擴充：單/雙精度浮點數與 f 暫存器](4.3.md)
   - [4.4 C 擴充：16-bit 壓縮指令與程式碼密度優化](4.4.md)
   - [4.5 B 擴充：位元操作 (Bit Manipulation)](4.5.md)
   - [4.6 V 擴充：向量處理器架構與 AI 算力加速](4.6.md)

## 第二篇：微結構與晶片設計篇 (Microarchitecture & Hardware Design)

- 五、RISC-V 處理器核心實作 (Verilog/SystemVerilog/Chisel)
   - [5.1 單週期 (Single-Cycle) 處理器設計與資料路徑](5.1.md)
   - [5.2 經典五階管線 (5-Stage Pipeline) 架構](5.2.md)
   - [5.3 管線冒險 (Hazards) 與解決方案：Forwarding 與分支預測](5.3.md)

- 六、高效能與先進處理器設計
   - [6.1 超純量 (Superscalar) 與多發射 (Multi-issue) 架構](6.1.md)
   - [6.2 亂序執行 (Out-of-Order Execution, OoO) 與保留站](6.2.md)
   - [6.3 記憶體管理單元 (MMU) 與 TLB 設計](6.3.md)
   - [6.4 快取記憶體 (Cache) 架構與快取一致性 (Cache Coherence)](6.4.md)

- 七、開源 RISC-V 核心實例剖析
   - [7.1 Ibex / PicoRV32：嵌入式微控制器核心](7.1.md)
   - [7.2 Rocket Chip：Chisel 產生的可組態核心 generator](7.2.md)
   - [7.3 BOOM (Berkeley Out-of-Order Machine)：高效能 OoO 核心](7.3.md)

## 第三篇：GPU、平行計算與 CUDA 生態篇 (RISC-V GPU & CUDA Ecosystem)

- 八、RISC-V GPU 擴充架構與專屬指令集
   - [8.1 Vector (V) vs. GPU (SIMT)：向量與繪圖處理器的本質差異](8.1.md)
   - [8.2 RV64X / Vortex 擴充規範：GPGPU 自訂指令與暫存器擴充](8.2.md)
   - [8.3 SIMT 執行模型：Thread/Warp/Block、排程器與分歧處理](8.3.md)
   - [8.4 GPU 記憶體階層與特殊存取指令：Shared Memory 與 Coalescing](8.4.md)

- 九、CUDA on RISC-V 軟體堆疊與架構實踐
   - [9.1 CUDA on RISC-V 雙重維度：Host-side vs. Target-side](9.1.md)
   - [9.2 RISC-V 作為 CUDA Host (CPU + NVIDIA GPU)](9.2.md)
   - [9.3 CUDA Kernel 轉譯至 RISC-V Device (GPGPU Execution)](9.3.md)

- 十、開源 RISC-V GPU 實作與圖形 API 驅動生態
   - [10.1 Vortex GPGPU 專案剖析：全開源 GPGPU 軟硬體棧](10.1.md)
   - [10.2 MIAOW 與 OpenCL 工具鏈：kernel 編譯為 GPU 指令](10.2.md)
   - [10.3 Vulkan / OpenGL 著色器編譯：SPIR-V 到自訂 ISA](10.3.md)

## 第四篇：特權架構與系統程式篇 (Privileged Architecture & System Programming)

- 十一、特權模式與安全機制
   - [11.1 機器模式 (Machine Mode, M-Mode)](11.1.md)
   - [11.2 監督者模式 (Supervisor Mode, S-Mode)](11.2.md)
   - [11.3 使用者模式 (User Mode, U-Mode)](11.3.md)
   - [11.4 控制與狀態暫存器 (CSRs) 與存取機制](11.4.md)
   - [11.5 實體記憶體保護 (PMP, Physical Memory Protection)](11.5.md)

- 十二、異常與中斷處理機制
   - [12.1 同步異常 (Exceptions) vs. 非同步中斷 (Interrupts)](12.1.md)
   - [12.2 核心中斷控制器 (CLINT / CLIC)](12.2.md)
   - [12.3 平台級中斷控制器 (PLIC / APLIC)](12.3.md)
   - [12.4 中斷向量表與 Trap 處理流程](12.4.md)

- 十三、記憶體管理與虛擬記憶體 (MMU & Paging)
   - [13.1 Sv39 與 Sv48 三層/四層頁表結構](13.1.md)
   - [13.2 虛擬位址到實體位址轉換 (VA to PA) 演算法](13.2.md)
   - [13.3 `satp` 暫存器配置與 TLB 刷新 (`sfence.vma`)](13.3.md)

- 十四、系統啟動與 Bootloader
   - [14.1 RISC-V 晶片開機流程 (ROM → SBI → Bootloader → Kernel)](14.1.md)
   - [14.2 RISC-V SBI 規格與 OpenSBI 實作](14.2.md)
   - [14.3 U-Boot 與 Device Tree (DTS/DTB) 移植與解析](14.3.md)

## 第五篇：嵌入式系統與作業系統實作篇 (Embedded Systems & Operating Systems)

- 十五、嵌入式 RISC-V 系統程式設計 (Bare-Metal & RTOS)
   - [15.1 Bare-Metal 開發：crt0.s、Linker Script 與 C 執行環境](15.1.md)
   - [15.2 外設驅動開發：UART、SPI、I2C 與 MMIO](15.2.md)
   - [15.3 FreeRTOS 移植：RISC-V 上下文切換 (Context Switch) 實作](15.3.md)
   - [15.4 RT-Thread / ThreadX：多任務排程與中斷回應優化](15.4.md)

- 十六、經典教學作業系統實戰：xv6-riscv 剖析
   - [16.1 xv6-riscv 架構概覽：從 x86 到 RISC-V 的轉變](16.1.md)
   - [16.2 引導與初始化：`entry.S`、`main.c` 與 S-Mode 進入流程](16.2.md)
   - [16.3 進程管理與上下文切換：`struct proc`、`swtch.S` 與排程器](16.3.md)
   - [16.4 系統呼叫 (Syscall)：`ecall` 觸發、Trap 與參數傳遞](16.4.md)
   - [16.5 虛擬記憶體與分頁：`kvminit()`、`uvminit()` 與頁表隔離](16.5.md)
   - [16.6 鎖與多核心同步：Spinlock 與 Sleeplock](16.6.md)
   - [16.7 檔案系統與驅動程式：VirtIO、Log 機制與 INode](16.7.md)

- 十七、通用作業系統移植：Linux Kernel on RISC-V
   - [17.1 Linux Kernel RISC-V 架構程式碼結構 (`arch/riscv`)](17.1.md)
   - [17.2 虛擬記憶體佈局與 Early Page Table 初始化](17.2.md)
   - [17.3 系統呼叫表 (Syscall Table) 與 ABI 規範](17.3.md)
   - [17.4 QEMU 模擬器環境搭建與 Linux 內核 GDB 除錯實戰](17.4.md)

## 第六篇：軟體開發工具鏈篇 (Software Ecosystem & Toolchains)

- 十八、RISC-V 工具鏈與編譯器
   - [18.1 GCC 與 LLVM/Clang 支援與交叉編譯 (Cross-Compilation)](18.1.md)
   - [18.2 `-march` 與 `-mabi` 參數組合實戰 (`rv64gc` / `lp64d`)](18.2.md)
   - [18.3 RISC-V 組合語言程式設計與 Inline Assembly](18.3.md)
   - [18.4 連結腳本 (Linker Script) 撰寫與記憶體段配置](18.4.md)

## 第七篇：未來展望與自訂擴充實戰 (Custom Extensions & Future)

- 十九、自訂指令集與特定領域架構 (DSA)
   - [19.1 透過 RISC-V 定製擴充指令 (Custom Instructions)](19.1.md)
   - [19.2 結合 AI/ML 加速器的自訂指令集設計實戰](19.2.md)
   - [19.3 結合 Spike / QEMU 擴充自訂模擬器指令](19.3.md)

- 二十、RISC-V 生態系的未來與挑戰
   - [20.1 RISC-V 向量擴充與 HPC / 車用晶片趨勢](20.1.md)
   - [20.2 開源 EDA 工具鏈與 OpenPDK 的結合](20.2.md)
   - [20.3 結語：開源硬體時代的工程師定位與機會](20.3.md)

## 附錄：可執行的處理器範例 (Appendices)

- 附錄 A：第五章的完整 Verilog 實作（原始碼在 `_verilog/`，皆以 Icarus Verilog 驗證通過）
   - [A.1 單週期處理器完整實作（`single_cycle` 範例）](A.1.md)
   - [A.2 五階段管線處理器完整實作（`5stage` 範例）](A.2.md)
