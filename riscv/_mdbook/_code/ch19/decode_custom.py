#!/usr/bin/env python3
"""decode_custom.py：custom opcode 空間解析（對應書 19.1）

列出 custom-0~3 與預留區對照表，並以 assert 自查分類正確。
用法：python3 decode_custom.py
"""
# 7 位元 opcode 分類表（書 19.1 表格）
CUSTOM = {  # 自訂空間：新手由 custom-0 起步
    0x0B: "custom-0",  # 0001011：R-type 自訂，最常用
    0x2B: "custom-1",  # 0101011：R-type 自訂，與 custom-0 對稱
    0x5B: "custom-2",  # 1011011：R-type 自訂，常給加速器（RoCC）
    0x7B: "custom-3",  # 1111011：R-type 自訂，RV128 保留但暫可借用
}
RESERVED = {  # 預留區：勿碰
    0x0A: "reserved(N 擴充：使用者級中斷)",
}
STANDARD = {  # 常見標準 opcode（示意，非窮舉）
    0x33: "OP（R-type 整數）",
    0x13: "OP-IMM（I-type 整數）",
    0x03: "LOAD",
    0x23: "STORE",
    0x63: "BRANCH",
    0x6F: "JAL",
    0x0F: "MISC-MEM（fence）",
    0x73: "SYSTEM（CSR/ecall）",
}


def classify(op7: int) -> str:
    """7 位元 opcode -> 分類字串（custom-0~3 / reserved / standard / unknown）"""
    if op7 in CUSTOM:
        return CUSTOM[op7]
    if op7 in RESERVED:
        return RESERVED[op7]
    if op7 in STANDARD:
        return "standard:" + STANDARD[op7]
    return "unknown"


def main() -> None:
    print(f"{'opcode':>8}  分類")
    print("-" * 40)
    for op in sorted(set(CUSTOM) | set(RESERVED) | set(STANDARD)):
        print(f"0x{op:02x}     {classify(op)}")
    # 自查：四組 custom、預留、標準、未知各驗一例
    assert classify(0x0B) == "custom-0"
    assert classify(0x2B) == "custom-1"
    assert classify(0x5B) == "custom-2"
    assert classify(0x7B) == "custom-3"
    assert classify(0x0A).startswith("reserved")
    assert classify(0x33).startswith("standard")
    assert classify(0x00) == "unknown"
    print("-" * 40)
    print("PASS：0x0b/0x2b/0x5b/0x7b 分類正確，預留與標準區正確")


if __name__ == "__main__":
    main()
