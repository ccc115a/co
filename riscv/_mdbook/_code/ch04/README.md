# ch04 範例（對應書中 4.1–4.6：M 乘除、A 原子、F/D 浮點、C 壓縮、B 位元操作、V 向量）

## 檔案說明

- `mul_div.s`（rv64gc）：mul/mulh/mulhu/div/divu/rem/remu/mulw/divw，含除零保護。
- `atomic_spinlock.s`（rv64gc）：lr.w/sc.w 自旋取鎖＋fence，amoswap.w 放鎖。
- `float_demo.s`（rv64gc）：4 點 double 點積，fmadd.d 累加。
- `compressed_demo.s`（rv64gc）：全 C 指令倒數迴圈求 1..n 和。
- `bitmanip.s`（rv64gc_zbb）：andn/orn/xnor/clz/ctz/cpop/rori/rev8。
- `vector_add.s`（rv64gcv）：vsetvli＋vle/vadd/vse 迴圈，64-bit 元素。
- `spinlock_host.c`：host 以 pthread＋`__sync_lock_test_and_set` 模擬 amoswap 語意，驗證互斥。
- `Makefile`：各檔以對應 `-march` 組譯，host 編譯執行 `spinlock_host`；預設 target 跑完所有驗證。

## 執行指令

```sh
make   # 組譯 6 個 .s（含各自 -march）並跑 spinlock_host 自我檢查
```
