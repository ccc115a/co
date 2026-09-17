# ch19 自訂擴充範例（對應書 19.1–19.3）

第七篇前半「自訂擴充」實作：編碼、解碼表、模擬器擴充。

| 檔案 | 對應節 | 說明 |
|------|--------|------|
| `custom_add.s`、`Makefile` | 19.1 | `.insn r 0x0b,0,0,t0,t1,t2` 示範 custom-0，可組譯＋objdump 驗 opcode |
| `decode_custom.py` | 19.1–19.2 | custom opcode 空間表（custom-0~3、預留區），host 執行＋assert 自查 |
| `spike_ext_skel.cc` | 19.3 | Spike 擴充骨架，註解寫清三個銜接函式（不求編過） |
| `spike_notes.md` | 19.3 | Spike／QEMU 加自訂指令的步驟與指令 |

## 執行指令

```bash
make check        # 組譯＋objdump 驗 opcode＋跑解碼自查
make dump         # 只看反組譯與 opcode 核對
python3 decode_custom.py   # 只跑 opcode 空間自查
```
