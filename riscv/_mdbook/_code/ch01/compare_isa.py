#!/usr/bin/env python3
# x86 / ARM / RISC-V 授權與程式碼密度對照（對應 1.1-1.4）
# 執行：python3 compare_isa.py

TABLE = [
    # (ISA, 授權模式, 指令長度, 典型密度註記)
    ("x86-64", "專有封閉", "變長 1-15 B", "變長編碼，密度高但解碼複雜"),
    ("AArch64", "授權收費", "定長 4 B", "定長易解碼，密度中等"),
    ("RV64GC", "開放免費", "變長 2/4 B (C 擴充)", "RVC 壓縮，嵌入式密度佳"),
]

EXPECTED = {"x86-64": "專有封閉", "AArch64": "授權收費", "RV64GC": "開放免費"}


def main():
    # 自我檢查：表列授權模式必須符合預期
    assert len(TABLE) == 3, "需列出三種 ISA"
    for isa, lic, _, _ in TABLE:
        assert EXPECTED[isa] == lic, f"{isa} 授權註記錯誤"
    risv = [r for r in TABLE if r[0] == "RV64GC"][0]
    assert "開放" in risv[1], "RISC-V 必須標示開放"
    assert "2/4" in risv[2], "RV64GC 須註明 2/4 位元組變長"

    print(f"{'ISA':<8} {'授權':<8} {'指令長度':<22} {'密度註記'}")
    print("-" * 64)
    for isa, lic, length, note in TABLE:
        print(f"{isa:<8} {lic:<8} {length:<22} {note}")
    print("SELF-CHECK PASS")


if __name__ == "__main__":
    main()
