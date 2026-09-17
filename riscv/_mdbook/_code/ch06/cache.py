#!/usr/bin/env python3
"""cache.py：直接映射＋N 路組相連快取模擬（對應 6.4）

跑 stride 存取 trace，印出各組態 hit/miss 率，並以 assert 驗證：
連續存取只有 compulsory miss；衝突 trace 下 2-way 勝過直接映射。
"""


class Cache:
    """LRU 組相連快取模型（ways=1 即直接映射）"""

    def __init__(self, size, ways, line):
        assert size % (ways * line) == 0
        self.sets = [[] for _ in range(size // (ways * line))]  # 每組：MRU 在前
        self.ways, self.line = ways, line
        self.hits = self.misses = 0

    def access(self, addr):
        blk, idx = addr // self.line, (addr // self.line) % len(self.sets)
        tag = blk // len(self.sets)
        s = self.sets[idx]
        if tag in s:  # 命中：搬到 MRU
            s.insert(0, s.pop(s.index(tag)))
            self.hits += 1
        else:  # 未命中：LRU 逐出後填入
            if len(s) == self.ways:
                s.pop()
            s.insert(0, tag)
            self.misses += 1

    def rate(self):
        tot = self.hits + self.misses
        return self.hits / tot if tot else 0.0


def run(cache, trace):
    for a in trace:
        cache.access(a)
    return cache


def main():
    # 實驗 1：連續掃 4KB（1024 字），行 64B → 每行 16 字，64 行全為 compulsory miss
    seq = [w * 4 for w in range(1024)]
    dm = run(Cache(size=4096, ways=1, line=64), seq)
    print(f"直接映射 4KB/64B行/連續：hit={dm.hits} miss={dm.misses} "
          f"命中率={dm.rate():.2%}")
    assert (dm.hits, dm.misses) == (960, 64), "連續存取應只有 64 次 compulsory miss"

    # 實驗 2：stride=64B（一字一行），每行都 miss → 命中率歸零，對照空間局部性
    stride = [w * 64 for w in range(64)]
    st = run(Cache(size=4096, ways=1, line=64), stride)
    print(f"直接映射 4KB/64B行/stride-64B：hit={st.hits} miss={st.misses} "
          f"命中率={st.rate():.2%}")
    assert (st.hits, st.misses) == (0, 64), "步進一行大小應全 miss"

    # 實驗 3：A/B 同組互搶（conflict miss），2-way 應勝出
    pingpong = [0x0000, 0x0080] * 10  # 同 index、不同 tag
    dm2 = run(Cache(size=128, ways=1, line=16), pingpong)
    tw = run(Cache(size=128, ways=2, line=16), pingpong)
    print(f"直接映射 128B/16B行/互搶：hit={dm2.hits} miss={dm2.misses} "
          f"命中率={dm2.rate():.2%}")
    print(f"2-way     128B/16B行/互搶：hit={tw.hits} miss={tw.misses} "
          f"命中率={tw.rate():.2%}")
    assert dm2.hits == 0, "直接映射互搶應全 miss"
    assert (tw.hits, tw.misses) == (18, 2), "2-way 熱機後應全命中"
    assert tw.rate() > dm2.rate(), "組相連應緩解衝突 miss"
    print("PASS：hit/miss 計數與組相連優勢皆驗證通過")


if __name__ == "__main__":
    main()
