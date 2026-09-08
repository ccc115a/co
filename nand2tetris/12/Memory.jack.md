# Memory.jack 程式說明

## 概述

`Memory.jack` 實作了一個完整的動態記憶體配置器（heap allocator），是 Jack OS 的核心基礎模組。它管理一段連續的 RAM 空間（位址 2048 至 16383），提供 `alloc(size)` 與 `deAlloc(object)` 兩個基本操作，讓其他模組（包括 Array、String 以及使用者程式）能動態配置與釋放記憶體。此模組同時提供底層的 `peek`/`poke` 函式，用於直接讀寫任意記憶體位址。

## 架構總覽

### 記憶體空間佈局

| 區域 | 位址範圍 | 用途 |
|------|----------|------|
| Stack | 256–2047 | VM 執行堆疊 |
| Heap | 2048–16383 | 動態配置記憶體 |
| Screen | 16384–24575 | 螢幕記憶體映射（256×512 像素） |
| Keyboard | 24576 | 鍵盤狀態暫存器 |

可用記憶體共 16383 − 2048 + 1 = **14336 個 word**（每個 word 16 位元）。

### 資料結構：空閒區塊串列（Free List）

所有未使用的記憶體區塊組織成一個**鏈結串列**，每個空閒區塊（free block）的結構如下：

```
word 0: FL_LENGTH — 區塊總長度（含 header 的 2 個 word）
word 1: FL_NEXT   — 指向下一個空閒區塊的指標（null 表示串列末尾）
word 2..size-1:   — 可用空間
```

已配置區塊（alloc block）的結構如下：

```
word 0: ALLOC_SIZE — 區塊總長度（含 header 的 1 個 word）
word 1..size-1:    — 使用者可用空間
```

注意兩種 header 的差異：空閒區塊需要 2 個 word（大小 + 下一區塊指標），已配置區塊只需要 1 個 word（大小）。`alloc()` 回傳的指標指向已配置區塊的 `word 1`（即使用空間的起始位置），不包含 header。

### 靜態變數

| 變數 | 意義 |
|------|------|
| `memory` | 用作記憶體陣列的「基底指標」，值為 0，使 `memory[address]` 等同於直接存取 RAM 位址 `address` |
| `freeList` | 空閒區塊串列的頭指標，初始值為 2048（堆疊頂端） |
| `NO_BLOCK` | 哨兵值 16384，表示「找不到可用區塊」（剛好是堆積頂端 + 1） |
| `FL_LENGTH` | 空閒區塊 header 中「大小」欄位的偏移量 = 0 |
| `FL_NEXT` | 空閒區塊 header 中「下一個指標」欄位的偏移量 = 1 |
| `ALLOC_SIZE` | 已配置區塊 header 中「大小」欄位的偏移量 = −1（相對於使用空間起始位置） |

## 原理

### peek 與 poke

```jack
function int peek(int address) { return memory[address]; }
function void poke(int address, int value) { let memory[address] = value; }
```

`memory` 是一個值為 0 的 `Array`。在 Jack 中，`memory[address]` 實際上是 `Array` 的索引運算——`Array` 的索引從 `base`（即 0）開始加偏移，所以 `memory[address]` 直接對應 RAM 的位址 `address`。這是一種巧妙的「零成本抽象」，利用語言特性達到直接記憶體存取的效果。

### alloc(size) — 記憶體配置

配置流程分為三步：

**步驟一：搜尋最佳適配區塊（best fit）**

```
best_fit(size):
    best_block = NO_BLOCK
    best_size = 14336          // 最大可能大小
    prev_block = null
    cur_block = freeList

    while cur_block ≠ null:
        cur_size = cur_block[FL_LENGTH] − 1   // 可用 word 數（扣掉空閒 header）
        if cur_size ≥ size 且 cur_size < best_size:
            best_block = prev_block
            best_size = cur_size
        prev_block = cur_block
        cur_block = cur_block[FL_NEXT]

    return best_block          // 回傳最佳區塊「前面那一個」的指標
```

這裡使用 **best-fit**（最佳適配）策略而非 first-fit（首次適配）。Best-fit 會遍歷整個串列找到最小的能容納請求大小的區塊，減少記憶體碎片。`best_fit()` 回傳的是目標區塊的**前一個**區塊（`prev_block`），方便後續從串列中摘除目標區塊。

**步驟二：分割區塊（do_alloc）**

找到適合的區塊後，`do_alloc` 判斷該區塊是否大到可以分割成「已配置部分」和「剩餘空閒部分」：

```jack
if( found_block[FL_LENGTH] > (size+1+2) ) {
    // 區塊夠大，可以分割
    // 保留 size+1 給已配置區塊（含 1 個 word header）
    // 剩餘部分成為新的空閒區塊（含 2 個 word header）
    next_block = found_block + size + 1;
    next_block[FL_LENGTH] = found_block[FL_LENGTH] − (next_block − found_block);
    next_block[FL_NEXT] = found_block[FL_NEXT];
    found_block = found_block + 1;
    found_block[ALLOC_SIZE] = size + 1;
}
else {
    // 區塊不夠大，整個給出去
    found_block = found_block + 1;
    found_block[ALLOC_SIZE] = found_block[FL_LENGTH];
}
```

條件 `size+1+2` 的含義：`size` 是使用者要求的 word 數，`+1` 是已配置區塊的 header，`+2` 是剩餘空閒區塊的 header。只有區塊總長度嚴格大於這三者之和時，分割才有意義。

**步驟三：更新串列**

回傳 `found_block + 1` 作為使用者指標（跳過 header）。如果區塊被分割，新產生的空閒區塊會接替原區塊在串列中的位置。

### deAlloc(object) — 記憶體釋放

釋放流程需要把已配置區塊歸還到空閒串列中，並嘗試與相鄰的空閒區塊合併（coalescing），以減少碎片：

```jack
deAlloc(object):
    alloc_size = object[ALLOC_SIZE]      // 取得已配置區塊的大小
    object = object − 1                  // 回到 header 起始位置

    prev_block = find_prev_free(object)  // 在空閒串列中找到 object 前面的空閒區塊

    情況一：prev_block = null（object 在 freeList 之前）
        → object 成為新的 freeList 頭部

    情況二：prev_block + prev_block[FL_LENGTH] = object
        → 與前一個空閒區塊相鄰，合併（擴大 prev_block 的大小）

    情況三：不相鄰
        → 將 object 插入 prev_block 之後

    最後：檢查 prev_block 與其下一個空閒區塊是否相鄰
        若 (prev_block + prev_block[FL_LENGTH]) = prev_block[FL_NEXT]
        → 合併兩者
```

合併（coalescing）是記憶體配置器的關鍵最佳化。若不進行合併，頻繁的 alloc/deAlloc 會導致大量微小的空閒區塊散佈在堆積中，即使總空閒空間足夠也無法滿足大的配置請求（外部碎片問題）。

### find_prev_free(object)

```jack
function Array find_prev_free(Array object) {
    if( freeList > object ) return null;
    let block = freeList;
    while( block[FL_NEXT] ≠ null 且 block[FL_NEXT] < object ) {
        let block = block[FL_NEXT];
    }
    return block;
}
```

沿著空閒串列走訪，找到最後一個位址小於 `object` 的空閒區塊。因為空閒串列中的區塊按記憶體位址排列，所以這個搜尋是有效的。

## 實作細節

### 為何 `memory` 的值是 0

Jack 的 `Array` 型別在記憶體中是一個指標，指向配置的資料區塊。`memory` 被設定為 `0`，使得 `memory[i]` 實際上是從位址 0 開始的第 `i` 個 word，即 RAM 位址 `i` 本身。這是 Hack 平台上實現「直接記憶體映射存取」的慣用技巧。

### ALLOC_SIZE 的偏移量 −1

已配置區塊的 header 在使用空間的**前一個** word。所以相對於使用空間的起始位置（即 `alloc` 回傳的指標），header 的偏移量是 −1。`object[ALLOC_SIZE]` 即 `object[-1]`，恰好指向 header。

### 初始化時的整個堆積作為單一空閒區塊

```jack
let freeList[FL_LENGTH] = 16384 − 2048;   // = 14336
let freeList[FL_NEXT] = null;
```

初始化時，整個堆積（2048–16383）被組織成一個單一的空閒區塊，長度為 14336 個 word，`next` 指標為 `null`。

## 測試與驗證

Memory 模組的正確性通常透過 `MemoryTest` 等測試程式驗證，反覆呼叫 `alloc` 和 `deAlloc` 檢查記憶體內容不被破壞。在 VM Emulator 中載入對應的 `.tst` 檔案可觀察 free list 的變化。

## 延伸討論

此實作使用 **best-fit** 策略，相比 first-fit 有更好的空間利用率但搜尋成本較高（O(n) 需遍歷整個串列）。真實系統中常見的替代方案包括 **buddy system**（二元伙伴系統）和 **slab allocator**，前者減少碎片但浪費空間，後者針對固定大小物件優化。此版本不支援 `realloc`，也不進行記憶體壓縮（compaction）。在記憶體有限的 Hack 平台上（僅 14336 word），這些簡化是合理的。
