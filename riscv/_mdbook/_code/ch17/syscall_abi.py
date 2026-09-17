#!/usr/bin/env python3
# syscall_abi.py — Linux riscv64 syscall ABI 自查（對應 17.3）
# 用法：python3 syscall_abi.py（a7=號碼＋a0–a5=參數＋ecall，測 write/exit）
"""ABI：a7 放呼叫號，a0–a5 依序放最多 6 個參數，ecall 陷入，返回值回 a0。"""

NR = {  # Linux riscv64 常用號（asm-generic）
    "read": 63, "write": 64, "openat": 56, "close": 57,
    "mmap": 222, "brk": 214, "exit": 93, "getpid": 172,
}

REGS = ["a0", "a1", "a2", "a3", "a4", "a5"]


def ecall_regs(name, args):  # 回傳暫存器配置 dict：a7＋a0–a5
    assert name in NR, f"unknown syscall {name}"
    assert len(args) <= 6, "riscv64 syscall最多 6 個參數"
    regs = {"a7": NR[name]}
    for r, v in zip(REGS, args):
        regs[r] = v
    return regs


def main():
    w = ecall_regs("write", [1, "buf", 13])  # write(1, buf, 13)
    assert w == {"a7": 64, "a0": 1, "a1": "buf", "a2": 13}, w
    print(f"write: a7={w['a7']} a0={w['a0']} a1=buf a2={w['a2']} + ecall ok")

    e = ecall_regs("exit", [0])  # exit(0)
    assert e == {"a7": 93, "a0": 0}, e
    print(f"exit:  a7={e['a7']} a0={e['a0']} + ecall ok")

    print("PASS: riscv64 syscall ABI (a7 + a0-a5 + ecall)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
