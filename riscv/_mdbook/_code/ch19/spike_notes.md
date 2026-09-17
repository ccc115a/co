# Spike / QEMU 自訂指令擴充筆記（對應書 19.3）

> 順序鐵律：先過 Spike（求準），語義凍結後再進 QEMU（求快）。

## Spike（`riscv-isa-sim`）三步

1. 取源碼並建置：`git clone https://github.com/riscv-software-src/riscv-isa-sim.git`
   `../configure --prefix=$RISCV && make -j$(nproc) && make install`
2. 寫外掛（見 `spike_ext_skel.cc` 三個銜接點：語義函式、`get_instructions`、註冊），
   編成共享庫：`g++ -shared -fPIC -I<isa-sim> -o libcustom_add.so spike_ext_skel.cc`
3. 掛載測試（需 Proxy Kernel `pk` 跑 Bare-Metal ELF）：
   `spike --extension=custom_add pk custom_add.elf`；
   逐條追蹤：`spike -l --extension=custom_add pk custom_add.elf`。
   語義內用 `RS1`/`RS2`/`WRITE_RD`，非法拋 `trap_illegal_instruction`。

## QEMU（語義凍結後）四步

1. `target/riscv/insn32.decode` 登記編碼與助憶符，
   例：`custom_add  0000000 .......... 000 ..... 0001011`。
2. 在 `trans_custom.c.inc`（或 `trans_rvi.c.inc`）寫翻譯函式，
   把語義降成 TCG ops；需系統行為者標記例外邊界。
3. 重編：`./configure --target-list=riscv64-softmmu,riscv64-linux-user && make -j$(nproc)`。
4. 測試：`./build/qemu-riscv64 -cpu rv64,x-custom-add=true ./custom_add-linux`，
   除錯用 `-d in_asm,op` 追翻譯，系統模式接 GDB stub。

## 對拍

三方（Spike、QEMU、RTL）吃同一份黃金測資，雜湊一致才算過；
故意改錯 `funct7` 一位，應看到 `trap_illegal_instruction`，確認解碼邊界。
