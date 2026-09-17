# ch14：開機、SBI 與 Device Tree（對應書中 14.1–14.3）

## 對應章節

- 14.1 開機流程：ROM→SBI→Bootloader→Kernel、`mepc/a0/a1` 交棒、HSM 多核。
- 14.2 SBI 與 OpenSBI：`a7=EID/a6=FID` 約定、legacy `console_putchar/set_timer`、HSM/IPI。
- 14.3 U-Boot 與 Device Tree：DTS→DTB→FDT、`compatible` 配對、`chosen/memory/serial/cpus`。

## 檔案說明

| 檔案 | 說明 |
|---|---|
| `sbi_hello/start.s` | `_start` 進入點：設棧、呼叫 `sbi_main`、印完 `wfi` 休眠。 |
| `sbi_hello/sbi_puts.c` | 經 SBI legacy `console_putchar`（EID=0x01）印字串，無 libc（`-nostdlib`）。 |
| `sbi_hello/boot.ld` | 連結腳本：載入位址 `0x80200000`（QEMU virt＋OpenSBI 預設 `next_addr`）。 |
| `virt.dts` | 最小 Device Tree 片段：`memory/uart/cpus/chosen`，附註解。 |
| `Makefile` | 編出 ELF、提供 `make qemu`（QEMU virt 跑 Hello）與 `make dtb`（`dtc` 驗證）。 |

## 執行指令

```sh
cd ch14
make          # 以 riscv64-unknown-elf-gcc -nostdlib 編出 sbi_hello/hello.elf
make qemu     # qemu-system-riscv64 -machine virt 跑出 Hello（guest 印完 wfi 休眠，5 秒後自動砍掉屬正常；不用 GNU timeout，macOS 通用）
make dtb      # dtc 編譯 virt.dts（若無 dtc 則略過）
make clean    # 清除 elf 與 dtb
```
