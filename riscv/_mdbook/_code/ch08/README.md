# ch08 範例：SIMT 執行與記憶體模型

對應書中 8.1（Vector vs SIMT）、8.2（RV64X / Vortex 擴充背景）、
8.3（Thread / Warp / Block 與分歧處理）、8.4（Shared Memory 與合併存取）。

## 檔案說明

- `vector_vs_simt.py`：SAXPY 效能模型，比較向量機 vs SIMT 在無分歧/有分歧下的執行週期。
- `warp_sched.py`：warp 排程器模擬，多 warp 輪轉掩蓋記憶體延遲，印出發射時間線。
- `coalesce.py`：記憶體合併存取，計算連續 vs 步進存取的 transaction 數。

## 執行指令

```bash
python3 vector_vs_simt.py
python3 warp_sched.py
python3 coalesce.py
```

三支皆為 host 純 Python，無外部依賴，assert 通過即正確。
