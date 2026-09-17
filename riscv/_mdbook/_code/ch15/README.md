# ch15 範例：Bare-Metal 與 RTOS

對應書中 15.1–15.4（重點：QEMU virt 真機可跑）。

| 書節 | 標題 | 對應檔案 |
|------|------|----------|
| 15.1 | Bare-Metal 開發：crt0.s、Linker Script 與 C 執行環境 | `crt0.s`、`link.ld`、`main.c`、`Makefile` |
| 15.2 | 外設驅動開發：UART、SPI、I2C 與 MMIO | `uart.h`、`uart.c` |
| 15.3 | FreeRTOS 移植：RISC-V 上下文切換實作 | `freertos_ctx.s` |
| 15.4 | RT-Thread / ThreadX：多任務排程與中斷回應優化 | `rt_notes.md` |

## 檔案說明

- `crt0.s`：啟動檔，`_start` 設 sp、清 bss、跳 `main`。
- `uart.h`/`uart.c`：virt UART0（0x10000000）MMIO 輪詢輸出驅動。
- `main.c`：印 `Hello RISC-V`＋數字（十/十六進位），最後印 `DONE`。
- `link.ld`：連結腳本，基址 0x80000000，定義 `_start` 入口與 bss/堆疊符號。
- `Makefile`：以 `riscv64-unknown-elf-gcc -nostdlib` 編出 `kernel.elf`。
- `freertos_ctx.s`：FreeRTOS 風格 save/restore x1–x31 片段（可單獨組譯）。
- `rt_notes.md`：RT-Thread/ThreadX 移植與排程要點短筆記。

## 執行指令

```bash
make            # 編出 kernel.elf
make qemu       # QEMU virt 執行（timeout 3 秒）
make check      # 自動驗證：輸出含 Hello RISC-V 與 DONE
riscv64-unknown-elf-gcc -march=rv64imac -mabi=lp64 -c freertos_ctx.s -o /tmp/freertos_ctx.o  # 組譯驗證
```
