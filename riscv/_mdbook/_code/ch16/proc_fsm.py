#!/usr/bin/env python3
# proc_fsm.py — xv6 proc 六狀態機轉移模擬（對應 16.3，不抄 xv6 原始碼）
# 用法：python3 proc_fsm.py（合法走一輪＋非法轉移斷言）
"""狀態：UNUSED→USED→RUNNABLE→RUNNING→SLEEPING→ZOMBIE→UNUSED"""

LEGAL = {  # state -> {可轉移目標}
    "UNUSED": {"USED"},                              # allocproc 配給
    "USED": {"RUNNABLE"},                            # 初始化完可排程
    "RUNNABLE": {"RUNNING"},                         # 排程器選中
    "RUNNING": {"RUNNABLE", "SLEEPING", "ZOMBIE"},   # yield/sleep/exit
    "SLEEPING": {"RUNNABLE"},                        # wakeup 喚醒
    "ZOMBIE": {"UNUSED"},                            # wait 回收
}


class Proc:
    def __init__(self):  # 新 proc 從 UNUSED 開始
        self.state = "UNUSED"


def transition(p, dst):  # 合法則轉移，非法丟 AssertionError
    assert dst in LEGAL[p.state], f"illegal: {p.state} -> {dst}"
    p.state = dst


def main():
    p = Proc()
    for dst in ["USED", "RUNNABLE", "RUNNING", "SLEEPING",
                "RUNNABLE", "RUNNING", "RUNNABLE", "RUNNING",
                "ZOMBIE", "UNUSED"]:  # 合法走一輪（含 sleep/wakeup、yield、exit/wait）
        transition(p, dst)
    assert p.state == "UNUSED"
    print("legal walk: UNUSED..ZOMBIE..UNUSED ok")

    for src, bad in [("UNUSED", "RUNNING"), ("RUNNING", "UNUSED"),
                     ("ZOMBIE", "RUNNING"), ("SLEEPING", "ZOMBIE")]:
        q = Proc()
        q.state = src
        try:
            transition(q, bad)
        except AssertionError:
            print(f"illegal rejected: {src} -> {bad} ok")
        else:
            raise SystemExit(f"FAIL: {src} -> {bad} should be illegal")
    print("PASS: proc fsm")


if __name__ == "__main__":
    main()
