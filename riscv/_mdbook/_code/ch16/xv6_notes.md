# xv6-riscv 上手筆記（對應 16.1–16.7，不抄原始碼）

上游：<https://github.com/mit-pdos/xv6-riscv>

## clone / 編譯 / 進 qemu 指令序列

```bash
git clone https://github.com/mit-pdos/xv6-riscv.git
cd xv6-riscv
make TOOLPREFIX=riscv64-unknown-elf-   # 編出 kernel/kernel 與 fs.img
make qemu                              # 進 qemu virt 跑 xv6 shell（Ctrl-a x 離開）
```

## 對照本目錄輔助模型

- `spinlock_host.c`：16.6 自旋鎖（amoswap 語義的主機模擬）。
- `proc_fsm.py`：16.3 六狀態進程模型。
- `syscall_table.py`：16.4 系統呼叫號對照。

## 閱讀順序建議

1. `kernel/entry.S`＋`main.c`（16.2：M-Mode→S-Mode 進入）。
2. `kernel/proc.c`＋`swtch.S`（16.3：排程與上下文切換）。
3. `kernel/syscall.c`＋`usertrap.c`（16.4：ecall 陷入）。
4. `kernel/vm.c`（16.5：Sv39 頁表）、`spinlock.c`（16.6）、`fs.c`＋`virtio_disk.c`（16.7）。
