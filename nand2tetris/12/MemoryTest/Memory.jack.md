# MemoryTest/Memory.jack 程式說明

這是第 12 章 OS 的記憶體管理類別，採用「free list + best fit + 相鄰合併」。它是整個 Jack OS 的基石：陣列、字串、輸出緩衝全部向它要空間。

## 概述

- 管理範圍：RAM[2048] 到 RAM[16383]（共 14336 個字）的堆積（heap）。
- 管配置：`peek`、`poke`、`alloc`、`deAlloc`；內部工具 `best_fit`、`do_alloc`、`find_prev_free`。
- 資料結構是兩個 static 指標（`freeList` 與 `memory`）+ 兩個 static 常數（`NO_BLOCK`）＋三個偏移常數。

## 設計規格

用三個偏移量把「區塊頭」減到最省：

| 常數 | 值 | 意義 |
|------|----|------|
| `FL_LENGTH` | 0 | 自由塊的第 0 字：塊大小（含 2 字表頭） |
| `FL_NEXT` | 1 | 自由塊的第 1 字：下一個自由塊 |
| `ALLOC_SIZE` | −1 | 已配置塊表頭：大小（含 1 字表頭），位於區塊「前一格」 |

兩種塊的版面：

```
自由塊:  [0]=長度  [1]=next  [2..]=可分配
已配置塊: [-1]=大小  [0..size-2]=使用者資料（回傳位址 = 塊起始+1）
```

## 原理

- **alloc**：`best_fit(size)` 沿 free list 找「不小於 size、且是碎片最小」的自由塊，回傳它「前面那塊」（作為串接點）。找不到（`NO_BLOCK`）回傳 null；若得配在 free list 開頭，要把 `freeList` 自身換成 `do_alloc` 的結果。回傳 `found_block + 1`——跳過配置表頭，使用者拿到「乾淨空間」。
- **best_fit**：把 `best_size` 初始設為 16384（不可能更大），沿串列更新：`cur_size = cur_block[FL_LENGTH] − 1`（可用字數），當 `cur_size ≥ size 且 cur_size < best_size` 時記為「新的最好」。回傳的是「最好塊前一塊」，好讓呼叫者能改它的 `FL_NEXT`。
- **do_alloc**：若自由塊夠大（`FL_LENGTH > size+1+2`，還放得下一個自由塊表頭＋配置表頭），就從尾端切出快區：新自由塊 `next_block = found_block + size + 1`。否則整塊給出去，只填配置表頭。兩種情形都會在「使用區前一個字」寫 `ALLOC_SIZE = 實際塊大小+1`。
- **deAlloc**：`find_prev_free` 找到位址恰在自己前面的自由塊（free list 按位址排序），若前一塊緊接著自己（`prev+prev.len = object`），把它合併成長度相加；若沒前塊就讓 object 當新表頭。最後再試著與後塊合併。兩次的相鄰檢查讓 free list 永遠排序且無相鄰碎片。

## 實作細節

- `init`：`memory=0`（整顆 RAM）、`freeList=2048`、`NO_BLOCK=16384`；FL/ALLOC 常數使用三欄位。`freeList[0] = 16384−2048`＝14336，`freeList[1] = null`——初始只有一整塊自由記憶體。
- `peek/poke`：直接 `memory[address]`，等價於存取 RAM。
- `alloc` 分割/整塊給出的臨界值：`found_block[FL_LENGTH] > size+1+2`。「+1」是配置表頭、「+2」是新自由塊表頭。分割後新自由塊長度為 `舊長度 − (size+1)`（`next_block − found_block`＝size+1）。
- `find_prev_free`：若 `freeList > object`（object 在所有自由塊之前）回傳 null；否則沿 `block[FL_NEXT]` 走到「下一個自由塊 ≥ object」為止，回傳的就是前驅。

## 測試與驗證

`MemoryTest.tst` 透過 `Main.vm` 驗證 peek/poke 與 alloc/deAlloc（文章：`MemoryTest/Main.jack`）。Batch 期望：

| RAM | 8000 | 8001 | 8002 | 8003 | 8004 | 8005 |
|-----|------|------|------|------|------|------|
| 值 | 333 | 334 | 222 | 122 | 100 | 10 |

重點陷阱：若 `deAlloc` 沒有相鄰合併，重複配置 3 的陣列最後會碎片化；若 `alloc` 忘了回 +1，程式會誤用「管理區」當使用者資料，輸出全錯。

## 延伸討論

- **為什麼要 2 字表頭**：自由塊需要知道「自己多大」與「下一塊」；配置塊需要知道「自己多大」才能還回去。範例 OS 選擇把配置塊表頭藏在使用區前面（`ALLOC_SIZE = −1`）以省記憶體。
- 真實系統（malloc）常見 first-fit／buddy system、並把單一 bit 作「已分配」旗號；Nand2Tetris 的 Jack 因每個程式只有一個執行緒而省去 lock 的複雜度。
- 這份 `Memory.jack` 是全專案「學生要自己寫」的挑戰核心之一；把它想成「沒有底層 malloc、直接管理一段連續 RAM」的實作，就能理解為何每個欄位都如此講究。