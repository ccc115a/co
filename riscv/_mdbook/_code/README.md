# 範例程式碼總覽（`_code/`）

本目錄是《從零開始的 RISC-V》各章的動手做範例，按章分目錄（`ch01`–`ch20` 對應第 1–20 章）。
每個子目錄都有自己的 `README.md`（對應書中節次、檔案說明、執行指令）。

## 環境需求

| 工具 | 用途 | 章節 |
|------|------|------|
| `riscv64-unknown-elf-gcc` | 交叉組譯 / 連結 RISC-V 程式 | ch01–ch04、ch11–ch15、ch18–ch19 |
| `qemu-system-riscv64` | QEMU virt 真機執行 | ch14、ch15、ch17 |
| `spike` | ISA 模擬器（自訂指令對拍） | ch19 |
| `iverilog` + `vvp` | Verilog 模擬 | ch05、ch07 |
| `gcc`、`python3` | 主機端模型與自檢腳本 | 全書 |
| `dtc`（選用） | Device Tree 編譯 | ch14 |

## 章節對照表

| 目錄 | 對應章節 | 內容提要 | 驗證方式 |
|------|----------|----------|----------|
| [ch01](ch01/README.md) | Ch1 崛起與革命 | `compare_isa.py` 授權/密度對照、`hello.s` 裸機骨架 | `python3`＋交叉組譯 |
| [ch02](ch02/README.md) | Ch2 設計哲學 | ABI 傳參、leaf/nested 堆疊框、Endianness | `make` |
| [ch03](ch03/README.md) | Ch3 RV32I/RV64I | `decode.py` 六格式解碼、ALU/LoadStore/分支/`ecall` | `make` |
| [ch04](ch04/README.md) | Ch4 標準擴充 | M/A/F-D/C/B/V 組語＋pthread 自旋鎖主機模型 | `make` |
| [ch05](ch05/README.md) | Ch5 核心實作 | 單週期 Verilog＋轉發單元＋自檢 testbench | `make`（iverilog/vvp） |
| [ch06](ch06/README.md) | Ch6 高效能設計 | Tomasulo、Cache、Sv39 TLB 三個 Python 模擬器 | `make` |
| [ch07](ch07/README.md) | Ch7 開源核心剖析 | 四核心對照表＋三階迷你核心＋upstream 指引 | `make` |
| [ch08](ch08/README.md) | Ch8 GPU 擴充架構 | 向量/SIMT 效能模型、warp 排程、合併存取 | `python3` |
| [ch09](ch09/README.md) | Ch9 CUDA on RISC-V | 玩具 PTX→RISC-V 轉譯、`vecadd.cu`、主機檢查腳本 | `make test` |
| [ch10](ch10/README.md) | Ch10 開源 GPU 生態 | OpenCL kernel/host、SPIR-V 流程、Vortex 筆記 | `make test` |
| [ch11](ch11/README.md) | Ch11 特權模式 | CSR 操作、PMP 配置、CSR 政策檢查器 | `make` |
| [ch12](ch12/README.md) | Ch12 異常與中斷 | trap 入口、PLIC/CLINT 軟體模型 | `make` |
| [ch13](ch13/README.md) | Ch13 虛擬記憶體 | Sv39 頁表 C 模型（4K/2M/`unmap`）、`satp` 示範 | `make` |
| [ch14](ch14/README.md) | Ch14 啟動 | SBI Hello（QEMU 真跑）＋最小 DTS | `make`＋`make qemu` |
| [ch15](ch15/README.md) | Ch15 嵌入式 | UART Hello（QEMU 真跑）、FreeRTOS 上下文片段 | `make check` |
| [ch16](ch16/README.md) | Ch16 xv6-riscv | 自旋鎖互斥驗證、proc 狀態機、syscall 表 | 直接編譯/執行 |
| [ch17](ch17/README.md) | Ch17 Linux | QEMU+GDB 腳本、syscall ABI 自查、移植筆記 | `bash -n`＋`python3` |
| [ch18](ch18/README.md) | Ch18 工具鏈 | 交叉編譯、`-march/-mabi` 實測、inline asm、sections | `make check`＋腳本 |
| [ch19](ch19/README.md) | Ch19 自訂指令 | `.insn` custom-0、opcode 解碼、Spike 骨架 | `make check` |
| [ch20](ch20/README.md) | Ch20 未來展望 | 趨勢表、開源 EDA 檢查、90 天行動計畫 | `python3`＋`bash` |

## 快速開始

```bash
# 第 3 章：指令解碼自檢
make -C ch03

# 第 5 章：單週期 CPU 模擬（要先裝 iverilog）
make -C ch05

# 第 15 章：QEMU 跑出 Hello RISC-V
make -C ch15 check

# 第 18 章：交叉編譯＋ march/mabi 實測
make -C ch18 check && bash ch18/march_mabi.sh
```

> 註：`make qemu` 類目標使用 shell 背景執行＋`sleep`/`kill` 控制時間，macOS/Linux 通用（不依賴 GNU `timeout`）。
> 建構產物（`.o`、`.elf`、`.dtb`）一律用各目錄 `make clean` 清除，不進版控。
