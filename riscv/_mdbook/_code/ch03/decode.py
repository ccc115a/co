#!/usr/bin/env python3
# 32-bit 指令字解碼為 R/I/S/B/U/J 欄位（對應 3.1-3.5）
# 執行：python3 decode.py

def sext(v, bits):
    return v - (1 << bits) if v >> (bits - 1) else v  # 符號擴展


def decode(w):
    op = w & 0x7F  # opcode
    rd = (w >> 7) & 0x1F
    f3 = (w >> 12) & 0x7
    rs1 = (w >> 15) & 0x1F
    rs2 = (w >> 20) & 0x1F
    f7 = (w >> 25) & 0x7F
    if op == 0x33:  # R 型
        return {"fmt": "R", "rd": rd, "rs1": rs1, "rs2": rs2,
                "funct3": f3, "funct7": f7}
    if op in (0x13, 0x03, 0x67, 0x0F, 0x73):  # I 型
        return {"fmt": "I", "rd": rd, "rs1": rs1, "funct3": f3,
                "imm": sext(w >> 20, 12)}
    if op == 0x23:  # S 型
        imm = (((w >> 25) << 5) | ((w >> 7) & 0x1F))
        return {"fmt": "S", "rs1": rs1, "rs2": rs2, "funct3": f3,
                "imm": sext(imm, 12)}
    if op == 0x63:  # B 型
        imm = (((w >> 31) << 12) | (((w >> 7) & 1) << 11) |
               (((w >> 25) & 0x3F) << 5) | (((w >> 8) & 0xF) << 1))
        return {"fmt": "B", "rs1": rs1, "rs2": rs2, "funct3": f3,
                "imm": sext(imm, 13)}
    if op in (0x37, 0x17):  # U 型
        return {"fmt": "U", "rd": rd, "imm": w & 0xFFFFF000}
    if op == 0x6F:  # J 型
        imm = (((w >> 31) << 20) | (((w >> 12) & 0xFF) << 12) |
               (((w >> 20) & 1) << 11) | (((w >> 21) & 0x3FF) << 1))
        return {"fmt": "J", "rd": rd, "imm": sext(imm, 21)}
    raise ValueError(f"未知 opcode 0x{op:02x}")


# 六種格式各一例
TESTS = [
    # (指令字, 組語, 期望欄位子集)
    (0x00208133, "add x2,x1,x2", {"fmt": "R", "rd": 2, "rs1": 1, "rs2": 2,
                                  "funct3": 0, "funct7": 0}),
    (0x00510093, "addi x1,x2,5", {"fmt": "I", "rd": 1, "rs1": 2, "imm": 5}),
    (0x0020A023, "sw x2,0(x1)", {"fmt": "S", "rs1": 1, "rs2": 2, "imm": 0}),
    (0x00208063, "beq x1,x2,0", {"fmt": "B", "rs1": 1, "rs2": 2, "imm": 0}),
    (0x123450B7, "lui x1,0x12345", {"fmt": "U", "rd": 1, "imm": 0x12345000}),
    (0x000000EF, "jal x1,0", {"fmt": "J", "rd": 1, "imm": 0}),
]


def main():
    for w, asm, exp in TESTS:
        got = decode(w)
        for k, v in exp.items():
            assert got[k] == v, f"{asm}: {k} 得 {got[k]}，期望 {v}"
        print(f"0x{w:08x} {asm:<16} -> {got}")
    print("SELF-CHECK PASS (6/6)")


if __name__ == "__main__":
    main()
