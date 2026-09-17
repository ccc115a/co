#!/usr/bin/env python3
"""SAXPY 效能模型：向量機 vs SIMT（對應 8.1、8.3）。

模型：同樣算 y = a*x + y，比較無分歧 / 有分歧下的執行週期。
結論：無分歧兩者接近；有分歧 SIMT 因序列化變慢。
用法：python3 vector_vs_simt.py
"""
N = 1024          # 元素數
LANES = 32        # 向量 lane 數 / warp 大小（對齊比較）
STARTUP = 10      # 向量啟動開銷（管線填充）
SCHED = 12        # SIMT 排程開銷（warp 管理）


def vector_cycles(n=N, lanes=LANES):
    # 單一指令流：元素分批吃完 + 固定啟動成本
    return (n + lanes - 1) // lanes + STARTUP


def simt_cycles(n=N, lanes=LANES, div_frac=0.0):
    # 無分歧：與向量同吞吐，僅排程開銷略異
    base = (n + lanes - 1) // lanes + SCHED
    # 有分歧：分歧 warp 雙路徑序列化，成本 x2（見 8.3 節 split/join）
    return base * (1.0 + div_frac)


def main():
    v = vector_cycles()
    s_ok = simt_cycles(div_frac=0.0)
    s_div = simt_cycles(div_frac=0.5)  # 一半 warp 分歧
    print(f"向量週期      : {v}")
    print(f"SIMT 無分歧   : {s_ok}")
    print(f"SIMT 有分歧(50%): {s_div:.1f}")
    # 無分歧時兩者接近（差異 < 10%）
    assert abs(s_ok - v) / v < 0.10, "無分歧時兩者應接近"
    # 有分歧時 SIMT 明顯變慢（> 1.3 倍）
    assert s_div / v > 1.3, "有分歧時 SIMT 應變慢"
    print("assert 通過：無分歧接近、有分歧 SIMT 變慢")


if __name__ == "__main__":
    main()
