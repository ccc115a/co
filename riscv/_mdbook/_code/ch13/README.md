# ch13：分頁與位址轉換（對應書中 13.1–13.3）

## 對應章節

- 13.1 Sv39/Sv48 頁表結構：VPN 切分、PTE 格式、`V/R/W/X/U/A/D`、4K/2M/1G 頁。
- 13.2 VA→PA 演算法：page walk、葉／分支分流、保留組合、缺頁碼 12/13/15。
- 13.3 `satp` 與 TLB 刷新：`MODE/ASID/PPN`、`sfence.vma` 三種形式、TLB shootdown。

## 檔案說明

| 檔案 | 說明 |
|---|---|
| `pagetable.c` | Sv39 三層頁表軟體模型：`map`（4K 與 2M 巨頁）、`walk` 翻譯、`unmap`，`assert` 自檢。host `gcc` 可編譯執行。 |
| `satp_demo.s` | `satp` 組成（`MODE<<60 \| PPN`）與 `sfence.vma`（全沖／按 VA／按 VA+ASID）及 Bare 關分頁示範。 |
| `Makefile` | 編譯執行 `pagetable`（印出 PASS）並組譯 `satp_demo.s`。 |

## 執行指令

```sh
cd ch13
make          # 編譯 pagetable＋組譯 satp_demo.s＋執行測試
make test     # 僅執行 ./pagetable，預期尾行 PASS
make clean    # 清除 pagetable 與 .o
```
