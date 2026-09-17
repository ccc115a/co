#!/usr/bin/env python3
"""clint_model.py — CLINT mtime/mtimecmp tick 模型（對應 12.2）
執行：python3 clint_model.py（assert 全過即 PASS）
模型：mtime 自由遞增；mtime >= mtimecmp 即置 MTIP；handler 重設 mtimecmp 得下一個 tick。
"""
import sys


class Clint:
    """單 hart CLINT 模型。"""

    def __init__(self):
        self.mtime = 0
        self.mtimecmp = 0

    @property
    def mtip(self) -> bool:
        """M 級計時器中斷待決。"""
        return self.mtime >= self.mtimecmp

    def tick(self, n: int = 1) -> None:
        """牆鐘前進 n 個 tick。"""
        self.mtime += n

    def set_next(self, delta: int) -> None:
        """handler 重設下一個鬧鐘（相對現在 delta）。"""
        self.mtimecmp = self.mtime + delta


def main() -> None:
    c = Clint()
    c.mtime = 0
    c.set_next(100000)          # 10ms @10MHz
    assert not c.mtip, "未到時不得置 MTIP"
    c.tick(99999)
    assert not c.mtip, "差一刻仍不觸發"
    c.tick(1)
    assert c.mtip, "到時須觸發 MTIP"
    c.set_next(100000)          # handler 重設
    assert not c.mtip, "重設後 MTIP 須清除"
    c.tick(100000)
    assert c.mtip, "下一個週期須再觸發"
    print(f"PASS: CLINT tick 全過 (mtime={c.mtime})")


if __name__ == "__main__":
    sys.exit(main())
