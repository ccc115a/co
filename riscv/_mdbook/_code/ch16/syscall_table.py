#!/usr/bin/env python3
# syscall_table.py — xv6-riscv 系統呼叫號→名稱對照自查（對應 16.4）
# 用法：python3 syscall_table.py（assert 筆數與代表號正確）
"""輔助模型：號碼為事實對照（fork=1…close=21），非抄襲原始碼。"""

SYSCALLS = {  # xv6-riscv syscall 號→名稱
    1: "fork", 2: "exit", 3: "wait", 4: "pipe", 5: "read",
    6: "kill", 7: "exec", 8: "fstat", 9: "chdir", 10: "dup",
    11: "getpid", 12: "sbrk", 13: "sleep", 14: "uptime", 15: "open",
    16: "write", 17: "mknod", 18: "unlink", 19: "link", 20: "mkdir",
    21: "close",
}


def main():
    assert len(SYSCALLS) == 21, f"expect 21 syscalls, got {len(SYSCALLS)}"
    assert set(SYSCALLS) == set(range(1, 22)), "numbers must be 1..21"
    for nr, name in [(1, "fork"), (7, "exec"), (15, "open"),
                     (16, "write"), (21, "close")]:  # 代表號抽查
        assert SYSCALLS[nr] == name, f"syscall {nr} should be {name}"
    for nr in sorted(SYSCALLS):
        print(f"{nr:3d}  {SYSCALLS[nr]}")
    print("PASS: 21 syscalls, fork/exec/open/write/close ok")


if __name__ == "__main__":
    main()
