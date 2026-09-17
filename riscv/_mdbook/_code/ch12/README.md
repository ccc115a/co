# ch12：Trap 與中斷控制器（對應書中 12.1–12.4）

## 對應章節

- 12.1 同步異常 vs. 非同步中斷：`scause` 最高位元、中斷／異常碼表。
- 12.2 CLINT：`mtime/mtimecmp/msip`、MTIP→STIP 轉發、CLIC 搶佔。
- 12.3 PLIC：priority/enable/threshold、`claim/complete` 交接、APLIC 定位。
- 12.4 Trap 流程：`stvec` Direct/Vectored、`sepc/scause/stval` 快照、`sret` 返回。

## 檔案說明

| 檔案 | 說明 |
|---|---|
| `trapENTRY.s` | `stvec` 設定＋trap 入口骨架：`sscratch` 借暫存器、save/restore 示意、跳 `trap_dispatch`、`sret` 返回。 |
| `plic_model.py` | PLIC 軟體模型：多中斷源＋優先權仲裁、`claim/complete` 語意。 |
| `clint_model.py` | CLINT 軟體模型：`mtime/mtimecmp` tick、`MTIP` 置位與重設。 |
| `Makefile` | 組譯 `trapENTRY.s` 並執行兩個模型。 |

## 執行指令

```sh
cd ch12
make asm    # 以 -march=rv64gc 組譯 trapENTRY.s
make test   # 執行兩個 .py，預期各印出一行 PASS
make        # 兩者都做
make clean  # 清除 .o
```
