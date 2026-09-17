# ch09 範例：CUDA on RISC-V 雙維度

對應書中 9.1（Host-side vs Device-side）、9.2（RISC-V 當 CUDA Host）、
9.3（CUDA kernel 轉譯至 RISC-V Device）。

## 檔案說明

- `ptx2riscv.py`：玩具級 PTX 子集→RISC-V SIMT 組語轉譯，支援 ld/add/mul/st，內建測試 PTX 與期望輸出。
- `vecadd.cu`：CUDA SAXPY 範例，註解標出 host/device 分界（需 `nvcc` 與 N 卡才能真編譯執行）。
- `check_cuda_host.sh`：在 RISC-V 主機上檢查 PCIe / NVIDIA 驅動 / CUDA toolkit，無 N 卡時友善提示退出。
- `Makefile`：跑 `ptx2riscv.py` 測試。

## 執行指令

```bash
python3 ptx2riscv.py   # 或 make test
bash -n check_cuda_host.sh
bash check_cuda_host.sh  # 無 N 卡屬正常，腳本會提示
```
