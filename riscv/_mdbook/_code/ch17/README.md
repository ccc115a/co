# ch17 範例：Linux 與 GDB 除錯

對應書中 17.1–17.4。

| 書節 | 標題 | 對應檔案 |
|------|------|----------|
| 17.1 | Linux Kernel RISC-V 架構程式碼結構（arch/riscv） | `linux_notes.md`（一） |
| 17.2 | 虛擬記憶體佈局與 Early Page Table 初始化 | `linux_notes.md`（一、二） |
| 17.3 | 系統呼叫表（Syscall Table）與 ABI 規範 | `syscall_abi.py`、`linux_notes.md` |
| 17.4 | QEMU 模擬器環境搭建與 Linux 內核 GDB 除錯實戰 | `qemu_gdb.sh`、`gdb_cmds.txt`、`linux_notes.md`（三、四） |

## 檔案說明

- `qemu_gdb.sh`：一鍵啟動 `qemu-system-riscv64 -machine virt -s -S` 等 GDB。
- `gdb_cmds.txt`：給 riscv64 gdb 的 `target remote`／斷點／反組譯腳本。
- `syscall_abi.py`：Linux riscv64 syscall ABI 自查（a7＋a0–a5＋ecall）。
- `linux_notes.md`：arch/riscv 導覽、建 Image、QEMU 開機、GDB 除錯四段指令。

## 執行指令

```bash
make -C ../ch15                             # 先編出除錯用 kernel.elf
bash -n qemu_gdb.sh                        # 語法驗證
./qemu_gdb.sh ../ch15/kernel.elf           # 凍結等 GDB（另終端連 :1234）
python3 syscall_abi.py                     # ABI 自查
```
