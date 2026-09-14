#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RvMini 迷你組譯器：把 Riscv5stage 的 .asm 轉成 .bin（每行一個 16 位元二進位指令）。

用法: python3 asm.py file.asm [file2.asm ...]
產出: file.bin（與 .asm 同名）。

RvMini ISA（16 位元指令）:
    LI   rd, imm9      op0  rd[11:9] imm9[8:0]（有號）
    AND  rd, rs1, rs2  op1  rd rs1 rs2 sel=01
    ADD  rd, rs1, rs2  op2  rd rs1 rs2 sel=10
    SUB  rd, rs1, rs2  op3  rd rs1 rs2 sel=11
    OR   rd, rs1, rs2  op4  rd rs1 rs2 sel=00
    LW   rd, rs1, off6 op5  rd[11:9] rs1[8:6] off6[5:0]
    SW   rs1, rs2, o6  op6  off6[11:6] rs1[5:3] rs2[2:0]
    BEQ  rs1, rs2, o6  op7  off6[11:6] rs1[5:3] rs2[2:0]
    JAL  rd, off9      op8  rd[11:9] off9[8:0]
    HALT               op9
    NOP                = LI x0,0（x0 永不寫入）
暫存器: x0..x7；off/imm 為有號十進位（單位 = word）。
"""
import re
import sys

OPS = {
    'LI':  0x0,
    'AND': 0x1,
    'ADD': 0x2,
    'SUB': 0x3,
    'OR':  0x4,
    'LW':  0x5,
    'SW':  0x6,
    'BEQ': 0x7,
    'JAL': 0x8,
    'HALT': 0x9,
}

# ALU 指令的低 3 位元：sel[1:0] 依 opcode 對應（見 Dec/Alu32）
ALU_OP_SEL = {'AND': 0b001, 'ADD': 0b010, 'SUB': 0b011, 'OR': 0b000}


def reg(tok):
    m = re.fullmatch(r'x([0-7])', tok)
    if not m:
        raise ValueError(f'暫存器格式錯誤: {tok!r}（應為 x0..x7）')
    return int(m.group(1))


def signed_bits(v, bits):
    v = int(v)
    if v < -(1 << (bits - 1)) or v > (1 << bits) - 1:
        raise ValueError(f'{v} 超出 {bits} 位元有號範圍')
    return v & ((1 << bits) - 1)


def assemble(src):
    words = []
    for ln, raw in enumerate(src.splitlines(), 1):
        line = re.sub(r'//.*', '', raw).strip()
        if not line:
            continue
        toks = [t for t in line.replace(',', ' ').split() if t != '']
        op = toks[0].upper()
        args = toks[1:]
        if op == 'HALT':
            words.append(0x9 << 12)
            continue
        if op == 'NOP':
            words.append(0x0)          # = LI x0,0；x0 永不寫入，等同 NOP
            continue
        if op not in OPS:
            raise ValueError(f'{ln} 行: 未知指令 {op}')
        opc = OPS[op]
        if op == 'LI':
            rd, v = reg(args[0]), signed_bits(args[1], 9)
            words.append((opc << 12) | (rd << 9) | v)
        elif op in ALU_OP_SEL:
            rd, r1, r2 = reg(args[0]), reg(args[1]), reg(args[2])
            sel = ALU_OP_SEL[op]
            words.append((opc << 12) | (rd << 9) | (r1 << 6) | (r2 << 3) | sel)
        elif op == 'LW':
            rd, r1, off = reg(args[0]), reg(args[1]), signed_bits(args[2], 6)
            words.append((opc << 12) | (rd << 9) | (r1 << 6) | off)
        elif op == 'SW':
            r1, r2, off = reg(args[0]), reg(args[1]), signed_bits(args[2], 6)
            words.append((opc << 12) | (off << 6) | (r1 << 3) | r2)
        elif op == 'BEQ':
            r1, r2, off = reg(args[0]), reg(args[1]), signed_bits(args[2], 6)
            words.append((opc << 12) | (off << 6) | (r1 << 3) | r2)
        elif op == 'JAL':
            rd, off = reg(args[0]), signed_bits(args[1], 9)
            words.append((opc << 12) | (rd << 9) | off)
        else:
            raise ValueError(f'{ln} 行: 無法處理 {op}')
    return words


def main():
    for path in sys.argv[1:]:
        with open(path, encoding='utf-8') as f:
            src = f.read()
        words = assemble(src)
        out = path.rsplit('.', 1)[0] + '.bin'
        with open(out, 'w', encoding='utf-8') as f:
            for w in words:
                f.write(f'{w:016b}\n')
        print(f'{path}: {len(words)} 指令 -> {out}', file=sys.stderr)


if __name__ == '__main__':
    main()