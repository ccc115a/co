#!/usr/bin/env python3
"""記憶體合併存取：連續 vs 步進存取的 transaction 數（對應 8.4）。

模型：warp 32 threads，每筆 4B，硬體每 128B 一次交易。
連續存取應合併成最少交易數；步進存取拆成多次。
用法：python3 coalesce.py
"""
WARP = 32       # warp 大小
ELEM = 4        # 每執行緒位元組數
TXN = 128       # 每次交易位元組數


def txn_count(stride_elems):
    # 步進 stride（以元素計）：tid 存取 base + tid*stride*ELEM
    addrs = [tid * stride_elems * ELEM for tid in range(WARP)]
    segs = {a // TXN for a in addrs}  # 落在哪個 128B 段
    return len(segs)


def main():
    cont = txn_count(1)   # 連續存取
    stride8 = txn_count(8)  # 步進 8 個元素（每筆隔 32B）
    # 理論最少交易數 = 總位元組 / 128 上取整
    expect_min = (WARP * ELEM + TXN - 1) // TXN
    print(f"連續存取交易數：{cont}（理論最少 {expect_min}）")
    print(f"步進 x8 交易數：{stride8}")
    assert cont == expect_min == 1, "連續存取應合併成最少交易"
    assert stride8 > cont, "步進存取應拆成更多交易"
    print("assert 通過：連續存取合併成最少 transaction")


if __name__ == "__main__":
    main()
