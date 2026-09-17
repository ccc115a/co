#!/usr/bin/env python3
"""玩具級 PTX 子集→RISC-V SIMT 組語轉譯（對應 9.3）。

支援四條：ld / add / mul / st，其餘報錯。
用法：python3 ptx2riscv.py（內建自測，assert 比對通過）
"""
import re
import sys

# 暫存器映射：PTX %fN→fN（浮點），%rN→xN（整數/位址）
def _reg(tok):
    tok = tok.strip().rstrip(",;")
    m = re.fullmatch(r"%f(\d+)", tok)
    if m:
        return f"f{m.group(1)}"
    m = re.fullmatch(r"%r(\d+)", tok)
    if m:
        return f"x{m.group(1)}"
    raise ValueError(f"未知暫存器：{tok}")


def translate_line(line):
    # 去註解與空白
    line = line.split("//")[0].strip()
    if not line:
        return None
    m = re.fullmatch(r"ld\.global\.f32\s+(%f\d+)\s*,\s*\[(\%r\d+)\]\s*;", line)
    if m:
        return f"lw {_reg(m.group(1))}, 0({_reg(m.group(2))})  # ld.global.f32"
    m = re.fullmatch(r"st\.global\.f32\s*\[(\%r\d+)\]\s*,\s*(%f\d+)\s*;", line)
    if m:
        return f"sw {_reg(m.group(2))}, 0({_reg(m.group(1))})  # st.global.f32"
    m = re.fullmatch(r"add\.f32\s+(%f\d+)\s*,\s*(%f\d+)\s*,\s*(%f\d+)\s*;", line)
    if m:
        return f"fadd.s {_reg(m.group(1))}, {_reg(m.group(2))}, {_reg(m.group(3))}"
    m = re.fullmatch(r"mul\.f32\s+(%f\d+)\s*,\s*(%f\d+)\s*,\s*(%f\d+)\s*;", line)
    if m:
        return f"fmul.s {_reg(m.group(1))}, {_reg(m.group(2))}, {_reg(m.group(3))}"
    raise ValueError(f"不支援的 PTX：{line}")


def translate(src):
    out = []
    for ln in src.splitlines():
        r = translate_line(ln)
        if r is not None:
            out.append(r)
    return out


# 測試 PTX 輸入與期望輸出
TEST_PTX = """ld.global.f32 %f1, [%r1];
ld.global.f32 %f2, [%r2];
mul.f32 %f3, %f1, %f0;
add.f32 %f4, %f3, %f2;
st.global.f32 [%r3], %f4;
"""

EXPECTED = [
    "lw f1, 0(x1)  # ld.global.f32",
    "lw f2, 0(x2)  # ld.global.f32",
    "fmul.s f3, f1, f0",
    "fadd.s f4, f3, f2",
    "sw f4, 0(x3)  # st.global.f32",
]


def main():
    got = translate(TEST_PTX)
    for g, e in zip(got, EXPECTED):
        print(f"{g}")
        assert g == e, f"不符：{g} != {e}"
    assert len(got) == len(EXPECTED), "行數不符"
    print("assert 通過：PTX→RISC-V 轉譯正確")
    # 若帶檔名參數，加譯該檔
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            for ln in translate(f.read()):
                print(ln)


if __name__ == "__main__":
    main()
