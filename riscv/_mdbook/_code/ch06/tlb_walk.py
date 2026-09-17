#!/usr/bin/env python3
"""tlb_walk.py：Sv39 三層頁表遍歷模擬（對應 6.3 MMU 與 TLB）

給定 VA＋頁表內容算出 PA，assert 驗證 4KB 頁、2MB 巨頁、1GB 巨頁與缺頁陷入。
PTE 格式：bit0 V，bit1 R，bit3 X，bit10 起 44-bit PPN。
"""

V, R, X = 1 << 0, 1 << 1, 1 << 3


class PageFault(Exception):
    pass


def pte(ppn, flags):
    return (ppn << 10) | flags


def walk(va, root_ppn, mem):
    """回傳 (PA, 頁大小字串)；PTE 無效則丟 PageFault"""
    vpn = [(va >> 12) & 0x1FF, (va >> 21) & 0x1FF, (va >> 30) & 0x1FF]
    ppn = root_ppn
    for level in (2, 1, 0):
        e = mem.get(ppn * 4096 + vpn[level] * 8)
        if e is None or not (e & V):
            raise PageFault(f"VA {va:#x}：level{level} PTE 無效")
        p = (e >> 10) & 0xFFF_FFFF_FFFF
        if e & (R | X):  # 葉 PTE：巨頁保留低位 VPN 作偏移
            if level == 2:
                return ((p << 12) & ~0x3FFF_FFFF) | (va & 0x3FFF_FFFF), "1GB"
            if level == 1:
                return ((p << 12) & ~0x1F_FFFF) | (va & 0x1F_FFFF), "2MB"
            return (p << 12) | (va & 0xFFF), "4KB"
        ppn = p  # 非葉：往下一層
    raise PageFault(f"VA {va:#x}：走完三層未見葉 PTE")


def main():
    ROOT = 0x10000
    mem = {
        # 案例 A（4KB）：VA 0x08102000，vpn=(0,64,0x102)，三層鏈 0x1/0x2/0x3→葉 0x40000
        ROOT * 4096 + 0 * 8: pte(0x20000, V),
        0x20000 * 4096 + 64 * 8: pte(0x30000, V),
        0x30000 * 4096 + 0x102 * 8: pte(0x40000, V | R | X),
        # 案例 B（2MB 巨頁）：VA 0x4061A345，L1 索引 3 直掛葉 PTE
        ROOT * 4096 + 1 * 8: pte(0x50000, V),
        0x50000 * 4096 + 3 * 8: pte(0xABC00, V | R),
        # 案例 D（1GB 巨頁）：VA 0x141234567，L2 索引 5 直掛葉 PTE
        ROOT * 4096 + 5 * 8: pte(0x80000, V | X),
        # 案例 C（缺頁）：L2 索引 2 的 PTE 有效位為 0
        ROOT * 4096 + 2 * 8: pte(0x0, 0),
    }
    pa, size = walk(0x08102000, ROOT, mem)
    print(f"VA 0x08102000 -> PA {pa:#x}（{size}頁）")
    assert (pa, size) == (0x40000000, "4KB"), "4KB 遍歷結果錯誤"
    pa, size = walk(0x4061A345, ROOT, mem)
    print(f"VA 0x4061A345 -> PA {pa:#x}（{size}頁）")
    assert (pa, size) == (0xABC1A345, "2MB"), "2MB 巨頁偏移拼接錯誤"
    pa, size = walk(0x141234567, ROOT, mem)
    print(f"VA 0x141234567 -> PA {pa:#x}（{size}頁）")
    assert (pa, size) == (0x81234567, "1GB"), "1GB 巨頁偏移拼接錯誤"
    try:
        walk(0x80000000, ROOT, mem)
        raise AssertionError("缺頁應丟 PageFault 卻正常回傳")
    except PageFault as ex:
        print(f"VA 0x80000000 -> {ex}")
    print("PASS：4KB/2MB/1GB 轉譯與缺頁陷入皆驗證通過")


if __name__ == "__main__":
    main()
