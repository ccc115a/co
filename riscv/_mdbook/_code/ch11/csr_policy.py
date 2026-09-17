#!/usr/bin/env python3
"""csr_policy.py — CSR 位址解碼政策檢查（對應 11.4）
執行：python3 csr_policy.py（host 可執行，assert 全過即 PASS）
規則：csr[11:10]=11 表唯讀；csr[9:8]=00/01/11 表最低需求 U/S/M。
"""
import sys

PRIV = {0: "U", 1: "S", 2: "H", 3: "M"}

# 受測 CSR：名稱 -> 位址
CSRS = {
    "mstatus": 0x300,   # RW, M
    "sstatus": 0x100,   # RW, S
    "cycle":   0xC00,   # RO, U
    "time":    0xC01,   # RO, U
    "sie":     0x104,   # RW, S
    "satp":    0x180,   # RW, S
    "mhartid": 0xF14,   # RO, M
    "medeleg": 0x302,   # RW, M
}

# 預期（是否唯讀，最低權限編碼）
EXPECT = {
    "mstatus": (False, 3),
    "sstatus": (False, 1),
    "cycle":   (True, 0),
    "time":    (True, 0),
    "sie":     (False, 1),
    "satp":    (False, 1),
    "mhartid": (True, 3),
    "medeleg": (False, 3),
}


def is_readonly(addr: int) -> bool:
    """csr[11:10] == 0b11 即唯讀。"""
    return ((addr >> 10) & 0x3) == 0x3


def min_priv(addr: int) -> int:
    """csr[9:8] 即最低所需權限。"""
    return (addr >> 8) & 0x3


def can_access(addr: int, priv: int, want_write: bool) -> bool:
    """判斷某權限等級能否存取（寫唯讀 CSR 一律拒絕）。"""
    if priv < min_priv(addr):
        return False
    if want_write and is_readonly(addr):
        return False
    return True


def main() -> None:
    assert len(CSRS) == 8, "需恰好測試 8 個 CSR"
    for name, addr in CSRS.items():
        exp_ro, exp_priv = EXPECT[name]
        ro, mp = is_readonly(addr), min_priv(addr)
        assert ro == exp_ro, f"{name}: RO 判定錯誤"
        assert mp == exp_priv, f"{name}: 權限判定錯誤 ({mp} != {exp_priv})"
        print(f"OK {name:8s} 0x{addr:03x} RO={ro} priv={PRIV[mp]}")
    # 語意抽查
    assert not can_access(0x100, 0, False)  # U 讀 sstatus 拒絕
    assert can_access(0x100, 1, True)       # S 寫 sstatus 允許
    assert can_access(0xC00, 0, False)      # U 讀 cycle 允許
    assert not can_access(0xC00, 0, True)   # U 寫 cycle 拒絕
    assert not can_access(0xF14, 1, False)  # S 讀 mhartid 拒絕
    assert can_access(0x300, 3, True)       # M 寫 mstatus 允許
    print("PASS: 8 CSR 政策全過")


if __name__ == "__main__":
    sys.exit(main())
