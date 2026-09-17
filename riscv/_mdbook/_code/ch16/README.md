# ch16 範例：xv6 輔助模型

對應書中 16.1–16.7（xv6 輔助模型，不抄 xv6 原始碼）。

| 書節 | 標題 | 對應檔案 |
|------|------|----------|
| 16.1–16.2 | xv6-riscv 概覽、entry.S / main.c 與 S-Mode 進入 | `xv6_notes.md`（上手指令） |
| 16.3 | 進程管理與上下文切換 | `proc_fsm.py` |
| 16.4 | 系統呼叫：ecall 觸發、Trap 與參數傳遞 | `syscall_table.py` |
| 16.5 | 虛擬記憶體與分頁 | `xv6_notes.md`（閱讀順序） |
| 16.6 | 鎖與多核心同步 | `spinlock_host.c` |
| 16.7 | 檔案系統與驅動程式 | `xv6_notes.md`（閱讀順序） |

## 檔案說明

- `spinlock_host.c`：以 C11 atomic 模擬 amoswap 自旋鎖，多執行緒累加驗證互斥。
- `proc_fsm.py`：xv6 proc 六狀態機轉移模擬，斷言合法走一輪＋拒絕非法轉移。
- `syscall_table.py`：xv6-riscv 系統呼叫號→名稱對照表自查（21 筆）。
- `xv6_notes.md`：上游連結、clone/編譯/進 qemu 指令序列與閱讀順序。

## 執行指令

```bash
gcc -O2 -Wall -Wextra -pthread -o /tmp/spinlock_host spinlock_host.c && /tmp/spinlock_host
python3 proc_fsm.py
python3 syscall_table.py
```
