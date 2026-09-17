#!/usr/bin/env python3
"""plic_model.py — PLIC claim/complete 軟體模型（對應 12.3）
執行：python3 plic_model.py（assert 全過即 PASS）
模型：priority/enable/threshold 過濾，claim 取最高優先權（同級 ID 小者勝），
讀 claim 即屏蔽同源，須寫 complete 才可再 pending（否則只響一次）。
"""
import sys


class Plic:
    """最小 PLIC 模型（單 hart 上下文）。"""

    def __init__(self):
        self.prio = {}        # 源 ID -> 優先權（0 表永不觸發）
        self.enabled = set()  # 已訂閱源
        self.pending = set()  # 待決源
        self.claimed = set()  # 已認領未完成源
        self.threshold = 0

    def set_priority(self, src: int, p: int) -> None:
        """設優先權。"""
        self.prio[src] = p

    def enable(self, src: int) -> None:
        """訂閱中斷源。"""
        self.enabled.add(src)

    def trigger(self, src: int) -> None:
        """外設拉線（若已認領未完成則保持屏蔽，符合只響一次語意）。"""
        if src in self.claimed:
            return  # 未 complete 前不再 pending
        self.pending.add(src)

    def _candidates(self):
        """可呈報候選：pending＋已訂閱＋優先權＞門檻＋未認領。"""
        out = []
        for s in self.pending:
            if s in self.enabled and s not in self.claimed:
                if self.prio.get(s, 0) > self.threshold:
                    out.append(s)
        return out

    def claim(self) -> int:
        """認領最高優先權源（同級 ID 小勝），無待決回 0。"""
        cand = self._candidates()
        if not cand:
            return 0
        best = max(cand, key=lambda s: (self.prio[s], -s))
        self.pending.discard(best)
        self.claimed.add(best)
        return best

    def complete(self, src: int) -> None:
        """完成處理，重新開放同源。"""
        self.claimed.discard(src)


def main() -> None:
    p = Plic()
    UART, VIRTIO, GPIO = 10, 1, 7
    p.set_priority(UART, 1)
    p.set_priority(VIRTIO, 3)   # 最高
    p.set_priority(GPIO, 2)
    for s in (UART, VIRTIO, GPIO):
        p.enable(s)
    p.threshold = 0
    for s in (UART, VIRTIO, GPIO):
        p.trigger(s)
    assert p.claim() == VIRTIO, "最高優先權應先被 claim"
    assert p.claim() == GPIO, "次高優先權第二"
    # VIRTIO 未 complete 前再觸發不得再 pending（只響一次教訓）
    p.trigger(VIRTIO)
    assert p.claim() == UART, "未 complete 者須被屏蔽，輪到 UART"
    assert p.claim() == 0, "無待決時 claim 回 0"
    p.complete(VIRTIO)
    p.trigger(VIRTIO)
    assert p.claim() == VIRTIO, "complete 後同源可再 pending"
    p.complete(VIRTIO)
    p.complete(GPIO)
    p.complete(UART)
    # 門檻測試：優先權 1 者被擋
    p.threshold = 1
    p.trigger(UART)
    assert p.claim() == 0, "優先權<=門檻不得通過"
    print("PASS: PLIC 仲裁＋claim/complete 全過")


if __name__ == "__main__":
    sys.exit(main())
