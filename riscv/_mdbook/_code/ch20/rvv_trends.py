#!/usr/bin/env python3
"""rvv_trends.py：RVV／HPC／車用三條趨勢線（對應書 20.1）

印出里程碑表並自查（每年序、關鍵事件齊備）。
用法：python3 rvv_trends.py
"""
# 三條線：(年份, 事件)；年份取公開史實的粗粒度
TRENDS = {
    "RVV 向量擴充": [
        (2019, "RVV v0.7 草案釋出，工具鏈先行試作"),
        (2021, "RVV v1.0 批准凍結，長度無關編程定案"),
        (2022, "GCC/LLVM 主線支援 RVV 自動向量化"),
        (2024, "RVV 1.0 硬體與 QEMU/Spike 模擬普及"),
    ],
    "HPC 高效能": [
        (2018, "歐洲處理器計畫 EPI 納入 RISC-V 加速器"),
        (2022, "Esperanto 千核 RISC-V 晶片問世"),
        (2023, "Ventana 資料中心級 Veyron 推進 Chiplet"),
        (2024, "RVV＋矩陣擴充成為開源 HPC 標配議題"),
    ],
    "車用電子": [
        (2020, "SiFive 推出車用系列，訴求長供貨週期"),
        (2022, "Renesas 等大廠導入 RISC-V 車用 MCU"),
        (2023, "鎖步雙核＋ECC 成為 ASIL-D 標準配備議題"),
        (2024, "AUTOSAR＋認證編譯器生態逐步到位"),
    ],
}


def main() -> None:
    for line, ms in TRENDS.items():
        print(f"== {line} ==")
        for year, ev in ms:
            print(f"  {year}  {ev}")
    # 自查：三條線齊備、每年序遞增、關鍵年份存在
    assert set(TRENDS) == {"RVV 向量擴充", "HPC 高效能", "車用電子"}
    for ms in TRENDS.values():
        assert len(ms) >= 3
        assert all(b[0] > a[0] for a, b in zip(ms, ms[1:]))
    years = [y for ms in TRENDS.values() for y, _ in ms]
    assert 2021 in years  # RVV 1.0 批准年必須在表上
    print("-" * 40)
    print("PASS：三條線里程碑表完整，年序正確")


if __name__ == "__main__":
    main()
