# 《從零開始的 RISC-V：從指令集架構到晶片設計與軟體生態》大綱

## 書籍定位

**RISC-V 系統化教科書**，面向計算機結構學習者、硬體工程師與軟體開發者。以「ISA → 微結構 → 平行計算 → 特權架構 → 作業系統 → 工具鏈 → 自訂擴充」為主線，軟硬兼顧、理論與實作並重。

## 目標讀者

資訊工程系學生（修過計算機結構或作業系統者尤佳）、嵌入式與晶片設計工程師、想進入 RISC-V 生態的軟體開發者。零基礎可讀，但假設具備基本 C 語言與數位邏輯能力。

## 核心理念

1. **簡潔即力量**——RISC-V 用不到 50 條核心指令完成其他 ISA 上百條指令的工作，簡潔帶來可驗證性與可擴展性。
2. **模組化即自由**——Base + Extensions 讓嵌入式 MCU 與超算核心共享同一 ISA 光譜。
3. **開源即生態**——開放 ISA + 開源核心 + 開源工具鏈，形成任何人都能參與的硬體創新飛輪。
4. **系統觀即全棧觀**——從電晶體時序到 CUDA 生態、從 `crt0.s` 到 Linux 內核，同一套 ISA 貫穿全棧。

## 結構規劃：七篇二十章

| 篇 | 章 | 標題 | 核心內容 |
|----|----|------|----------|
| 一、基礎與架構 | 1 | RISC-V 的崛起與革命 | x86/ARM 專利困境、Berkeley 起源、基金會運作 |
| 一 | 2 | 指令集設計哲學與模組化架構 | Base+Ext、暫存器檔、ABI、定址與 Endianness |
| 一 | 3 | 基礎整數指令集 (RV32I/RV64I) | 6 種格式、ALU、Load/Store、分支跳躍、ECALL/FENCE |
| 一 | 4 | 標準擴充模組 | M/A/F/D/C/B/V 擴充全覽 |
| 二、微結構與晶片設計 | 5 | 處理器核心實作 | 單週期、五階管線、Hazards 與轉發/分支預測 |
| 二 | 6 | 高效能與先進處理器設計 | 超純量、OoO、MMU/TLB、Cache 與一致性 |
| 二 | 7 | 開源核心實例剖析 | PicoRV32/Ibex、Rocket Chip、BOOM |
| 三、GPU 與 CUDA | 8 | GPU 擴充架構與專屬指令集 | Vector vs SIMT、RV64X/Vortex、Warp 排程、記憶體階層 |
| 三 | 9 | CUDA on RISC-V 軟體堆疊 | Host (CPU+NVIDIA GPU) vs Device (GPGPU 轉譯) 雙維度 |
| 三 | 10 | 開源 GPU 實作與圖形 API 生態 | Vortex、MIAOW+OpenCL、SPIR-V 著色器編譯 |
| 四、特權架構與系統程式 | 11 | 特權模式與安全機制 | M/S/U 模式、CSR、PMP |
| 四 | 12 | 異常與中斷處理 | Exception/Interrupt、CLINT/CLIC、PLIC/APLIC、Trap 流程 |
| 四 | 13 | 記憶體管理與虛擬記憶體 | Sv39/Sv48、VA→PA、`satp`、`sfence.vma` |
| 四 | 14 | 系統啟動與 Bootloader | ROM→SBI→U-Boot→Kernel、OpenSBI、Device Tree |
| 五、嵌入式與作業系統 | 15 | 嵌入式系統程式設計 | Bare-Metal、MMIO 驅動、FreeRTOS/RT-Thread 移植 |
| 五 | 16 | xv6-riscv 剖析 | 引導、進程、Syscall、分頁、鎖、檔案系統 |
| 五 | 17 | Linux on RISC-V | `arch/riscv`、Early Page Table、Syscall ABI、QEMU+GDB |
| 六、工具鏈 | 18 | 工具鏈與編譯器 | GCC/LLVM 交叉編譯、`-march/-mabi`、組語、Linker Script |
| 七、未來與擴充 | 19 | 自訂指令集與 DSA | Custom opcode、AI 加速器、Spike/QEMU 擴充 |
| 七 | 20 | 生態系的未來與挑戰 | HPC/車用、開源 EDA+OpenPDK、工程師定位 |

## 寫作風格

1. **每節一核心觀念**（如 `GPR 永遠 32 個、CSR 另外算`、`管線速度由最慢級決定`）。
2. **中英術語對照**，首次出現即定義（如監督者模式 Supervisor Mode, S-Mode）。
3. **程式與波形說話**：每節至少一個可動手做的範例（組語、Verilog、C 或 shell 指令）。
4. **表格與 Mermaid 圖**表達編碼格式、資料路徑與系統流程。
5. **每節結尾**：本節小結 + 想一想（2–3 題實作或思考題）。
6. **配套開源**：範例程式與模擬指令（Spike/QEMU/Verilator）可直接重現。

## 實驗分級

- ★ 入門：紙筆追蹤、單條指令編解碼、QEMU 跑 Hello World。
- ★★ 中等：Verilog 單元模組、FreeRTOS 移植、xv6 追蹤 syscall。
- ★★★ 挑戰：五階管線 forwarding、自訂指令 + Spike 擴充、Vortex 上跑 kernel。

## 節檔案對照表

共 79 節：1.1–1.4、2.1–2.4、3.1–3.5、4.1–4.6、5.1–5.3、6.1–6.4、7.1–7.3、8.1–8.4、9.1–9.3、10.1–10.3、11.1–11.5、12.1–12.4、13.1–13.3、14.1–14.3、15.1–15.4、16.1–16.7、17.1–17.4、18.1–18.4、19.1–19.3、20.1–20.3。
