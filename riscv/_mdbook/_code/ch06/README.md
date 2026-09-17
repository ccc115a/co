# ch06 範例（對應書中 6.1 超純量與多發射、6.2 亂序執行與保留站、6.3 MMU 與 TLB、6.4 Cache 與一致性）

Host 純 Python 模擬，無外部依賴；6.1 相依分類體現在 `tomasulo.py` 的 RAW/WAR 指令序列設計。

## 檔案說明

- `tomasulo.py`：Tomasulo 保留站模擬，5 條含 RAW/WAR 相依指令，印每週期發射/執行/寫回/提交表，assert 亂序超車真的發生。
- `cache.py`：直接映射＋2-way 快取模擬，跑連續/步進/互搶 trace 印 hit/miss 率，assert 驗證。
- `tlb_walk.py`：Sv39 三層頁表遍歷，給定 VA＋頁表算 PA，assert 含 2MB/1GB 巨頁與缺頁陷入。
- `Makefile`：依序執行三支模擬。

## 執行指令

```sh
make                         # 跑三支模擬，全過即正確
python3 tomasulo.py          # 也可單支執行
python3 cache.py
python3 tlb_walk.py
```
