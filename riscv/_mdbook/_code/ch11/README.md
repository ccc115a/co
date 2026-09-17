# ch11：特權模式、CSR 與 PMP（對應書中 11.1–11.5）

## 對應章節

- 11.1 機器模式（M-Mode）：`mstatus`、MPP/MPIE、`mret`。
- 11.2 監督者模式（S-Mode）：`sstatus`、`stvec/sepc/scause`、`SUM`。
- 11.3 使用者模式（U-Mode）：唯讀計數器 `cycle/time`、`ecall`。
- 11.4 CSR 存取機制：`csrrw/csrrs/csrrc`、`csr[11:10]` 讀寫屬性、`csr[9:8]` 權限。
- 11.5 PMP：`pmpcfg/pmpaddr`、TOR 匹配、L 鎖定位。

## 檔案說明

| 檔案 | 說明 |
|---|---|
| `csr_demo.s` | `csrrw/csrrs/csrrc` 讀寫 `mstatus/sstatus` 示範（含 `csrs/csrc/csrci` 偽指令）。 |
| `pmp_config.s` | `pmpcfg0/pmpaddr` 設定 TOR 區域示範（韌體區＋UART 區）。 |
| `csr_policy.py` | CSR 政策解碼器：依位址位元判讀 RO/RW 與權限等級，測 8 個 CSR。 |
| `Makefile` | 組譯兩個 `.s` 檔並執行 `csr_policy.py`。 |

## 執行指令

```sh
cd ch11
make asm    # 以 -march=rv64gc 組譯兩個 .s（含語法檢查）
make test   # 執行 python3 csr_policy.py，預期印出 PASS
make        # 兩者都做
make clean  # 清除 .o
```
