#!/usr/bin/env python3
"""tomasulo.py：Tomasulo 保留站模擬（對應 6.2 亂序執行與暫存器更名）

5 條指令含 RAW（真相依）與 WAR/WAW（假相依）：長延遲 DIV 卡住後續，
無關 ADD 應超車先完成；寫 R1 的指令不受 WAR/WAW 阻擋（更名消除假相依）。
印出每週期發射/執行/寫回/提交表，並以 assert 驗證亂序真的發生。
"""
from collections import namedtuple

LAT = {"ADD": 2, "SUB": 2, "MUL": 4, "DIV": 8}  # 功能單元延遲（週期）
PROG = [  # (op, rd, rs1, rs2)
    ("DIV", "R1", "R2", "R3"),    # 0：長延遲，R1 久候
    ("MUL", "R4", "R1", "R5"),    # 1：RAW 等 R1
    ("ADD", "R6", "R7", "R8"),    # 2：無關，應超車
    ("SUB", "R9", "R6", "R10"),   # 3：RAW 等 R6
    ("ADD", "R1", "R11", "R12"),  # 4：對 R1 的 WAR（相對 1）/ WAW（相對 0）
]
INIT = {"R2": 20, "R3": 4, "R5": 3, "R7": 1, "R8": 2,
        "R10": 1, "R11": 100, "R12": 23}


def alu(op, a, b):
    return {"ADD": a + b, "SUB": a - b, "MUL": a * b, "DIV": a // b}[op]


def main():
    Entry = namedtuple("Entry", "idx op dst")
    reg = dict(INIT)          # 架構暫存器值（只在提交時更新）
    rat = {}                  # 更名表：暫存器 -> 未就緒指令 tag（無即就緒）
    rs = []                   # 保留站條目：dict(tag, entry, qj, qk, vj, vk, state, remain, val)
    bytag = {}                # tag -> 保留站條目（提交時取值）
    rob = []                  # ROB：依發射順序的 tag 佇列
    done = {}                 # tag -> 完成旗標（等提交）
    fu_busy = {op: False for op in LAT}  # 每種功能單元一台
    issue_at, exec_at, wb_at, commit_at = {}, {}, {}, {}
    nxt, cycle = 0, 0
    print("cyc | issue | exec | wb | commit")

    while len(commit_at) < len(PROG):
        cycle += 1
        ev_issue, ev_exec, ev_wb, ev_commit = "-", [], "-", []
        # 1. 執行推進：已發射的算完一拍（CDB 落選者停在 0 等下一拍）
        for e in rs:
            if e["state"] == "exec" and e["remain"] > 0:
                e["remain"] -= 1
        # 2. CDB 寫回：每拍一條（選最早發射的就緒者）
        ready = [e for e in rs if e["state"] == "exec" and e["remain"] == 0]
        if ready:
            e = min(ready, key=lambda x: x["tag"])
            e["state"] = "done"
            val = alu(e["entry"].op, e["vj"], e["vk"])
            e["val"] = val  # 結果暫存，架構暫存器等提交才更新（WAW 由保序提交解決）
            fu_busy[e["entry"].op] = False
            for w in rs:  # 廣播喚醒等待者
                if w["qj"] == e["tag"]:
                    w["vj"], w["qj"] = val, None
                if w["qk"] == e["tag"]:
                    w["vk"], w["qk"] = val, None
            if rat.get(e["entry"].dst) == e["tag"]:
                rat[e["entry"].dst] = None
            done[e["tag"]] = True
            wb_at[e["entry"].idx] = cycle
            ev_wb = f"{e['entry'].idx}"
        # 3. 保留站發射執行：操作數到齊且功能單元空閒
        for e in rs:
            if e["state"] == "wait" and e["qj"] is None and e["qk"] is None \
                    and not fu_busy[e["entry"].op]:
                e["state"] = "exec"
                e["remain"] = LAT[e["entry"].op]
                fu_busy[e["entry"].op] = True
                exec_at[e["entry"].idx] = cycle
                ev_exec.append(str(e["entry"].idx))
        # 4. 順序發射一條：取值或取 tag（更名在此斷開 WAR/WAW）
        if nxt < len(PROG):
            op, rd, s1, s2 = PROG[nxt]
            vj, qj = (reg.get(s1, 0), None) if rat.get(s1) is None \
                else (0, rat[s1])
            vk, qk = (reg.get(s2, 0), None) if rat.get(s2) is None \
                else (0, rat[s2])
            rs.append({"tag": nxt, "entry": Entry(nxt, op, rd),
                       "qj": qj, "qk": qk, "vj": vj, "vk": vk,
                       "state": "wait", "remain": 0, "val": None})
            bytag[nxt] = rs[-1]
            rat[rd] = nxt
            rob.append(nxt)
            issue_at[nxt] = cycle
            ev_issue = f"{nxt}"
            nxt += 1
        # 5. ROB 順序提交：寫架構暫存器
        while rob and done.get(rob[0]):
            t = rob.pop(0)
            reg[bytag[t]["entry"].dst] = bytag[t]["val"]
            commit_at[t] = cycle
            ev_commit.append(str(t))
        print(f"{cycle:3d} | {ev_issue:>5} | {','.join(ev_exec) or '-':>4} "
              f"| {ev_wb:>2} | {','.join(ev_commit) or '-'}")

    print(f"issue 順序：{sorted(issue_at, key=issue_at.get)}")
    print(f"完成順序：{sorted(wb_at, key=wb_at.get)}")
    print(f"提交順序：{sorted(commit_at, key=commit_at.get)}")
    # 驗證：2 號 ADD 超車 1 號 MUL（亂序執行）；4 號不受 WAR 阻擋先完成；
    # 提交維持程式順序；WAW 由順序提交保證 R1 最終為 4 號結果
    assert wb_at[2] < wb_at[1], "ADD(2) 應比 MUL(1) 早完成（亂序超車）"
    assert wb_at[4] < wb_at[1], "ADD(4) 應不受 WAR 阻擋、比 MUL(1) 早完成"
    assert sorted(commit_at, key=commit_at.get) == [0, 1, 2, 3, 4], "提交須保序"
    assert reg["R1"] == 123 and reg["R4"] == 15 and reg["R6"] == 3 \
        and reg["R9"] == 2, f"暫存器結果錯誤：{reg}"
    print("PASS：亂序發射/更名/順序提交皆驗證通過")


if __name__ == "__main__":
    main()
