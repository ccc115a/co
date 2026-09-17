#!/usr/bin/env python3
"""cores_compare.py：開源 RISC-V 核心參數對照（對應 7.1 PicoRV32/Ibex、7.2 Rocket、7.3 BOOM）

輸出管線級數、面積量級、是否亂序/是否 Chisel 對照表，並以 assert 檢查表完整性。
數值為教學量級（小核心精確、大核心取典型組態），選型看相對關係而非絕對數字。
"""
CORES = [
    {"name": "PicoRV32", "isa": "RV32I/E+M/C(可配)", "pipeline": "多週期狀態機（無管線）",
     "stages": 1, "area": "約 2–5 kGE（最小配置）", "ooo": False, "chisel": False,
     "use": "MCU／教學／形式化驗證入門"},
    {"name": "Ibex", "isa": "RV32IMC＋M/U 特權", "pipeline": "2 級（IF／ID+EX）",
     "stages": 2, "area": "約 20–30 kGE（含 M 擴充）", "ooo": False, "chisel": False,
     "use": "嵌入式產品原型（OpenTitan 背書）"},
    {"name": "Rocket", "isa": "RV64G＋M/S/U、Sv39", "pipeline": "5 級順序單發射",
     "stages": 5, "area": "約數百 kGE（含 L1）", "ooo": False, "chisel": True,
     "use": "Linux SoC 原型／教學全棧"},
    {"name": "BOOM", "isa": "RV64GC＋M/S/U、Sv39", "pipeline": "10+ 級亂序超純量",
     "stages": 10, "area": "約數 MGE（MediumBOOM 量級）", "ooo": True, "chisel": True,
     "use": "高效能研究／IPC 優化實驗台"},
]
KEYS = ["name", "isa", "pipeline", "stages", "area", "ooo", "chisel", "use"]


def main():
    hdr = ["核心", "ISA", "管線", "級數", "面積量級", "OoO", "Chisel", "適用場景"]
    rows = [[c["name"], c["isa"], c["pipeline"], str(c["stages"]), c["area"],
             "是" if c["ooo"] else "否", "是" if c["chisel"] else "否", c["use"]]
            for c in CORES]
    w = [max(len(r[i]) for r in [hdr] + rows) for i in range(len(hdr))]
    for r in [hdr] + rows:
        print("  ".join(v.ljust(w[i]) for i, v in enumerate(r)))
    # 完整性檢查：四核心齊全、欄位齊全、級數為正
    assert [c["name"] for c in CORES] == ["PicoRV32", "Ibex", "Rocket", "BOOM"]
    assert all(list(c) == KEYS and c["stages"] > 0 for c in CORES)
    # 架構關係檢查：只有 BOOM 亂序；Chisel 產生器只用於 Rocket/BOOM
    assert [c["name"] for c in CORES if c["ooo"]] == ["BOOM"]
    assert {c["name"] for c in CORES if c["chisel"]} == {"Rocket", "BOOM"}
    assert [c["stages"] for c in CORES] == sorted(c["stages"] for c in CORES), \
        "管線深度應由小到大排列"
    print("PASS：四核心八欄位齊全，OoO/Chisel 關係正確")


if __name__ == "__main__":
    main()
