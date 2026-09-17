#!/usr/bin/env python3
"""warp 排程器模擬：多 warp 輪轉掩蓋記憶體延遲（對應 8.3）。

場景：每 warp 執行「計算 x2 → 訪存 x1」循環，訪存延遲 MEM_LAT。
排程器每週期輪轉選一個就緒 warp 發射。
用法：python3 warp_sched.py
"""
NUM_WARPS = 4   # 常駐 warp 數
COMPUTE = 2     # 每次計算段指令數
MEM_LAT = 8     # 訪存延遲（週期）
STEPS = 24      # 模擬總髮射步數


def simulate(num_warps=NUM_WARPS):
    # 每 warp 下次就緒時刻；皆 0 起跳
    ready_at = [0] * num_warps
    t = 0
    lines = []
    for step in range(STEPS):
        # 輪轉找就緒 warp（t 時刻可發射者）
        pick = None
        for k in range(num_warps):
            w = (step + k) % num_warps  # 簡易輪轉起點
            if ready_at[w] <= t:
                pick = w
                break
        if pick is None:
            # 全停住：快轉到最早就緒時刻（管線氣泡）
            t = min(ready_at)
            for k in range(num_warps):
                if ready_at[k] <= t:
                    pick = k
                    break
            lines.append(f"t={t:3d} bubble（全 warp 等待記憶體）")
        # 發射一條：每 COMPUTE+1 步中有一次訪存
        is_mem = (step // 1) % (COMPUTE + 1) == COMPUTE
        op = "MEM " if is_mem else "ALU "
        lines.append(f"t={t:3d} 發射 W{pick} [{op}]")
        if is_mem:
            ready_at[pick] = t + 1 + MEM_LAT  # 該 warp 睡 MEM_LAT
        t += 1
    return t, lines


def main():
    t4, lines = simulate(NUM_WARPS)
    t1, _ = simulate(1)
    for ln in lines:
        print(ln)
    print(f"單 warp 總週期：{t1}，{NUM_WARPS} warp 總週期：{t4}")
    print(f"同樣 {STEPS} 次發射，多 warp 靠切換掩蓋延遲（無氣泡即成功）")
    assert t4 < t1, "多 warp 應靠延遲掩蓋更快完成同量發射"
    print("assert 通過：多 warp 掩蓋延遲有效")


if __name__ == "__main__":
    main()
