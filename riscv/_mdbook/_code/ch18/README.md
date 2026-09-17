# ch18 工具鏈範例（對應書 18.1–18.4）

第六篇「工具鏈」實作：交叉編譯、旗標配對、行內組語、連結腳本。

| 檔案 | 對應節 | 說明 |
|------|--------|------|
| `hello.c`、`Makefile` | 18.1 | Hello World 交叉編譯，`file`/`readelf` 驗證為 RISC-V |
| `march_mabi.sh` | 18.2 | 多組 `-march`/`-mabi` 實測，印成功／失敗對照表 |
| `inline_asm.c` | 18.3 | `csrr` 讀 cycle＋`auipc` 取 PC，交叉編譯 `-c` 通過 |
| `sections.ld`、`show_sections.sh` | 18.4 | 自訂 `.mysection`，以 `readelf -S`／`nm` 驗證 |

## 執行指令

```bash
make && make check          # 編出 rv32/rv64 ELF 並驗證
bash march_mabi.sh          # 旗標配對對照表（內含自查）
riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c inline_asm.c -o /tmp/inline.o
riscv64-unknown-elf-objdump -d /tmp/inline.o | grep -E 'rdcycle|auipc'  # csrr cycle 顯示為 rdcycle 別名
bash show_sections.sh       # 自訂節連結驗證
```
