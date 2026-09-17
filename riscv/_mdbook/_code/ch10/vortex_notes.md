# Vortex 上機步驟（對應 10.1）

> 只給步驟與指令，不複製 Vortex 程式碼。

上游：<https://github.com/vortexgpgpu/vortex>

## 1. 取碼與編譯

```bash
git clone https://github.com/vortexgpgpu/vortex.git
cd vortex
make -j"$(nproc)"
```

`simv` 為功能模擬器（先用它），RTL 模擬後續再碰。

## 2. 跑 hello 等級 kernel

```bash
# 編一個 OpenCL kernel 成 device ELF（以 vecadd 為例，檔名依 repo 內 tests 目錄為準）
riscv32-unknown-elf-gcc -march=rv32im -O3 tests/opencl/vecadd/vecadd_kernel.c -o vecadd.elf
./simv vecadd.elf --cores 4 --warps 8 --threads 32 --dump-perf
```

## 3. 跑一組 benchmark

```bash
cd tests
bash run_tests.sh --sim simv --bench vecadd,saxpy,transpose
```

## 4. 驗收

- `simv` 正常退出且印出 `PASSED`（或 perf 統計）即成功。
- 想調架構：改 `--cores / --warps` 重跑，對照 8.3 節延遲掩蓋。
- 細節以 Vortex 官方 README 為準，本檔不複製其源碼。
