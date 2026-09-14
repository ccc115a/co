# prog1.asm — RV32S 綜合測資（單週期 Rv32_1 與五級管線 Rv32_5 共用）
#
# 覆蓋：R 型（add/sub/and/or/xor）、I 型（addi/andi/ori/xori）、
# LW/SW（含 32 位元數值來回）、LUI+ADDI 組 32 位元常數、AUIPC、xori，
# 四種條件分支（前跳/後跳/必中/落空）、JAL 往返（link）、JALR 往返、
# x0 硬接 0、HALT 凍結。管線面：RAW 前遞（1/2/3 拍鏈）、
# load-use stall（lw 後立刻用）、分支/JAL/JALR flush。
#
# 期望值（halt 後探測）：
#   x1=5  x2=7  x3=12  x4=2  x5=4  x6=13  x7=9
#   x8=-3  x9=1405  x10=6  x11=15  x12=0x12345678  x13=0x12345687
#   x14=42  x15=3  x16=6  x17=8
#   x18=42  x19=6008  x20=2002  x21=53（link）x22=55  x23=55  x24=64  x25=50
#   x26=0xFFF00001  x27=0x12345678
#   mem[4]=12  mem[8]=15  mem[12]=0x12345678

        addi x1, x0, 5            # 0  x1=5
        addi x2, x0, 7            # 1  x2=7
        add  x3, x1, x2           # 2  x3=12      （前遞：x1,x2 差 2/3 拍）
        sub  x4, x2, x1           # 3  x4=2       （差 1 拍前遞）
        and  x5, x3, x1           # 4  x5=4  (12&5)
        or   x6, x3, x1           # 5  x6=13 (12|5)
        xor  x7, x3, x1           # 6  x7=9  (12^5)
        addi x8, x1, -8           # 7  x8=-3
        addi x9, x1, 1400         # 8  x9=1405
        sw   x3, 4(x0)            # 9  mem[4]=12
        lw   x10, 4(x0)           # 10 x10=12
        addi x10, x10, 3          # 11 x10=15     （load-use stall）
        sw   x10, 8(x0)           # 12 mem[8]=15
        lw   x11, 8(x0)           # 13 x11=15
        lui  x12, 0x12345         # 14 x12=0x12345000
        addi x12, x12, 0x678      # 15 x12=0x12345678
        xori x13, x12, 0xFF       # 16 x13=0x12345687
        sw   x12, 0(x3)           # 17 mem[12]=0x12345678  （32 位元寫回、x3=12）
        lw   x27, 0(x3)           # 18 x27=0x12345678     （32 位元讀回）
        beq  x0, x0, skip         # 19 必跳（+2）
        addi x14, x0, 99          # 20 不執行
skip:   addi x14, x0, 42          # 21 x14=42
        blt  x1, x2, lt_ge        # 22 5<7 跳（+2）
        addi x15, x0, 1           # 23 不執行
        addi x15, x0, 2           # 24 不執行
lt_ge:  addi x15, x0, 3           # 25 x15=3
        bge  x2, x1, ge_bne       # 26 7>=5 跳（+2）
        addi x16, x0, 4           # 27 不執行
        addi x16, x0, 5           # 28 不執行
ge_bne: addi x16, x0, 6           # 29 x16=6
        bne  x1, x2, bne_ok       # 30 5!=7 跳（+2，跨過 31）
        addi x17, x0, 7           # 31 不執行
        bne  x1, x1, never        # 32 落空（前跳，不跳）
bne_ok: addi x17, x0, 8           # 33 x17=8
never:  beq  x1, x2, also_never   # 34 落空（前跳，不跳）
        addi x18, x0, 0           # 35 x18=0
also_never:
        jal  x18, fn              # 36 link=37；跳 fn（+5）
        addi x10, x0, 1           # 37 不執行
        addi x10, x0, 2           # 38 不執行
        addi x10, x0, 3           # 39 不執行
        addi x10, x0, 4           # 40 不執行
fn:     add  x18, x18, x1         # 41 x18=37+5=42（link 前遞）
        jal  x0, done             # 42 跳 done（link=x0 丟棄，+2）
        addi x10, x0, 5           # 43 不執行
done:   addi x10, x0, 6           # 44 x10=6
        addi x19, x0, 1001        # 45 x19=1001
        addi x20, x0, 2002        # 46 x20=2002
        add  x19, x19, x20        # 47 x19=3003（1 拍前遞）
        addi x19, x19, 1          # 48 x19=3004（連續 RAW 鏈）
        add  x19, x19, x19        # 49 x19=6008
        auipc x25, 0              # 50 x25=50（AUIPC 取本指令位址）
        addi x22, x0, 55          # 51 x22=55（JALR 目標位址）
        jalr x21, x22, 0          # 52 link=53；跳位址 55（=x22）
        addi x23, x0, 77          # 53 不執行
        addi x23, x0, 78          # 54 不執行
        add  x23, x23, x22        # 55 x23=0+55=55
        addi x24, x0, 9           # 56 x24=9
        add  x24, x24, x22        # 57 x24=9+55=64
        lui  x26, 0xFFF00           # 58 x26=0xFFF00000
        xori x26, x26, 1          # 59 x26=0xFFF00001
        halt                      # 60