// pagetable.c — Sv39 三層頁表軟體模型（對應 13.1–13.2）
// 編譯執行：gcc -Wall -Wextra -o pagetable pagetable.c && ./pagetable
// 說明：以假實體頁號模擬實體記憶體，實作 map（4K＋2M 巨頁）/ walk / unmap。

#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// PTE 旗標（同 13.1）
#define PTE_V (1UL << 0)
#define PTE_R (1UL << 1)
#define PTE_W (1UL << 2)
#define PTE_X (1UL << 3)
#define PTE_U (1UL << 4)
#define PTE_A (1UL << 6)
#define PTE_D (1UL << 7)

#define NPT 512          // 每表 512 項
#define MAXPAGES 64      // 模擬實體頁上限

// 假實體頁池：ppn -> 主機指標
static uint64_t page_ppn[MAXPAGES];
static void *page_ptr[MAXPAGES];
static int npages = 0;

// 配一頁 4K 表，回傳主機指標並登記假 PPN
static uint64_t *alloc_table(uint64_t *ppn_out) {
    void *p = NULL;
    if (posix_memalign(&p, 4096, 4096) != 0 || npages >= MAXPAGES) {
        fprintf(stderr, "alloc 失敗\n");
        exit(1);
    }
    memset(p, 0, 4096);
    uint64_t ppn = 0x80000UL + (uint64_t)npages; // 假 PPN： root 在 0x80000000 附近
    page_ppn[npages] = ppn;
    page_ptr[npages] = p;
    npages++;
    *ppn_out = ppn;
    return (uint64_t *)p;
}

// 假 PPN 查主機指標
static uint64_t *ppn_to_ptr(uint64_t ppn) {
    for (int i = 0; i < npages; i++)
        if (page_ppn[i] == ppn)
            return (uint64_t *)page_ptr[i];
    return NULL;
}

#define PX(level, va) (((va) >> (12 + 9 * (level))) & 0x1FFUL)
#define PA2PTE(pa) ((((uint64_t)(pa)) >> 12) << 10)
#define PTE2PA(pte) (((pte) >> 10) << 12)

// map：level=0 表 4K，level=1 表 2M 巨頁；pa 須對齊
static int map(uint64_t *root, uint64_t va, uint64_t pa, uint64_t flags, int level) {
    assert(level == 0 || level == 1);
    if (level == 0)
        assert((pa & 0xFFFUL) == 0);
    else
        assert((pa & 0x1FFFFFUL) == 0); // 2M 對齊
    for (int l = 2; l > level; l--) {
        uint64_t *pte = &root[PX(l, va)];
        if (!(*pte & PTE_V)) { // 缺表就配一張
            uint64_t ppn;
            alloc_table(&ppn);
            *pte = (ppn << 10) | PTE_V;
        }
        uint64_t *next = ppn_to_ptr((*pte >> 10) & 0xFFFFFFFFFFFULL);
        assert(next != NULL);
        root = next;
    }
    uint64_t *leaf = &root[PX(level, va)];
    assert(!(*leaf & PTE_V)); // 不覆蓋既有映射（教學簡化）
    *leaf = PA2PTE(pa) | flags | PTE_V | PTE_A | PTE_D;
    return 0;
}

// walk：軟體 page walk，成功回 0 並吐 PA，失敗回 -1
static int walk(uint64_t *root, uint64_t va, uint64_t *pa_out) {
    for (int l = 2; l >= 0; l--) {
        uint64_t pte = root[PX(l, va)];
        if (!(pte & PTE_V))
            return -1;                        // 無效
        if ((pte & PTE_R) == 0 && (pte & PTE_W))
            return -1;                        // 保留組合 R=0,W=1
        if ((pte & (PTE_R | PTE_X))) {        // 葉子（含巨頁短路）
            uint64_t base = PTE2PA(pte);
            if (l == 2)
                *pa_out = (base & ~0x3FFFFFFFUL) | (va & 0x3FFFFFFFUL); // 1G（本模型僅辨識）
            else if (l == 1)
                *pa_out = (base & ~0x1FFFFFUL) | (va & 0x1FFFFFUL);     // 2M
            else
                *pa_out = base | (va & 0xFFFUL);                        // 4K
            return 0;
        }
        if (l == 0)
            return -1; // 分支走到末層仍非葉
        root = ppn_to_ptr((pte >> 10) & 0xFFFFFFFFFFFULL);
        if (!root)
            return -1;
    }
    return -1;
}

// unmap：清除某層葉子有效位
static int unmap(uint64_t *root, uint64_t va, int level) {
    for (int l = 2; l > level; l--) {
        uint64_t pte = root[PX(l, va)];
        if (!(pte & PTE_V))
            return -1;
        if (pte & (PTE_R | PTE_X))
            return -1; // 中途遇葉：層級不合
        root = ppn_to_ptr((pte >> 10) & 0xFFFFFFFFFFFULL);
        if (!root)
            return -1;
    }
    uint64_t *leaf = &root[PX(level, va)];
    if (!(*leaf & PTE_V))
        return -1;
    *leaf = 0;
    return 0;
}

int main(void) {
    uint64_t root_ppn;
    uint64_t *root = alloc_table(&root_ppn);
    uint64_t pa;

    // 4K 頁：VA 0x40001000 -> PA 0x80001000（含頁內偏移測試）
    map(root, 0x40001000UL, 0x80001000UL, PTE_R | PTE_W | PTE_U, 0);
    assert(walk(root, 0x40001000UL, &pa) == 0 && pa == 0x80001000UL);
    assert(walk(root, 0x400014ABUL, &pa) == 0 && pa == 0x800014ABUL);
    printf("OK 4K 頁翻譯正確\n");

    // 2M 巨頁：VA 0x50000000 -> PA 0x90000000（21 位元對齊）
    map(root, 0x50000000UL, 0x90000000UL, PTE_R | PTE_W | PTE_X, 1);
    assert(walk(root, 0x50000000UL, &pa) == 0 && pa == 0x90000000UL);
    assert(walk(root, 0x50123456UL, &pa) == 0 && pa == 0x90123456UL);
    printf("OK 2M 巨頁翻譯正確\n");

    // 未映射 VA 須失敗
    assert(walk(root, 0x60000000UL, &pa) != 0);
    printf("OK 未映射回報 fault\n");

    // unmap 後舊翻譯失效，巨頁不受影響
    assert(unmap(root, 0x40001000UL, 0) == 0);
    assert(walk(root, 0x40001000UL, &pa) != 0);
    assert(walk(root, 0x50000000UL, &pa) == 0 && pa == 0x90000000UL);
    printf("OK unmap 生效\n");

    printf("PASS: Sv39 map/walk/unmap 全過\n");
    return 0;
}
