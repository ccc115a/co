# rv32i_prog.asm — rv32i 單週期核心綜合測資（60 指令）
#
# 重點覆蓋（prog1 已測過的不重複驗細節，這裡主測）：
#   R 型移位 sll/srl/sra、I 型移位 slli/srli/srai、
#   slt/sltu/slti/sltiu（含正負/無號邊界）、六種分支全中＋落空各一、
#   後跳迴圈（負 B 位移）、JAL/JALR 往返（含 link 值）、x0 硬接 0、HALT 凍結。
# word 定址（同 RV32S）：分支/JAL 位移單位為 word。
#
# 期望值（halt 後探測）：
#   x1=5  x2=7  x3=12  x4=2  x5=5  x6=7  x7=2
#   x8=640  x9=-3  x10=134217727  x11=-1
#   x12=40  x13=268435455  x14=-1
#   x15=1  x16=0  x17=0  x18=1  x19=1  x20=1  x21=0
#   x22=305419896  x23=305419896  x24=4121  x25=12
#   x26=601  x27=100  x28=201  x29=301  x30=401  x31=501  x0=0
#   mem[4]=12  mem[8]=7  mem[12]=305419896
# 中途探測：jal link x30=35（t=35）、jalr link x29=39（t=39）。

        addi x1, x0, 5            # 0  x1=5
        addi x2, x0, 7            # 1  x2=7
        add  x3, x1, x2           # 2  x3=12
        sub  x4, x2, x1           # 3  x4=2
        and  x5, x1, x2           # 4  x5=5
        or   x6, x1, x2           # 5  x6=7
        xor  x7, x1, x2           # 6  x7=2
        sll  x8, x1, x2           # 7  x8=5<<7=640
        addi x9, x0, -3           # 8  x9=-3
        srl  x10, x9, x1          # 9  x10=0xFFFFFFFD>>5=134217727
        sra  x11, x9, x1          # 10 x11=-1
        slli x12, x1, 3           # 11 x12=40
        srli x13, x9, 4           # 12 x13=0x0FFFFFFF=268435455
        srai x14, x9, 4           # 13 x14=-1
        slt  x15, x1, x2          # 14 x15=1
        slt  x16, x2, x1          # 15 x16=0
        sltu x17, x9, x1          # 16 x17=0（無號大數不<5）
        sltu x18, x1, x9          # 17 x18=1（5<無號大數）
        slti x19, x9, 0           # 18 x19=1
        sltiu x20, x1, 7          # 19 x20=1
        sltiu x21, x9, 7          # 20 x21=0（無號大數不<7）
        lui  x22, 0x12345         # 21 x22=0x12345000
        addi x22, x22, 0x678      # 22 x22=0x12345678=305419896
        sw   x22, 12(x0)          # 23 mem[12]=305419896
        lw   x23, 12(x0)          # 24 x23=305419896
        auipc x24, 1              # 25 x24=25+4096=4121
        sw   x3, 4(x0)            # 26 mem[4]=12
        sw   x6, 8(x0)            # 27 mem[8]=7
        lw   x25, 4(x0)           # 28 x25=12
        beq  x1, x2, Bx           # 29 不中（5≠7），落空證明
        addi x27, x0, 100         # 30 x27=100
Bx:     bne  x1, x2, Bne_t        # 31 中 → 33
        addi x0, x0, 0            # 32 跳過
Bne_t:  addi x28, x0, 201         # 33 x28=201
        jal  x30, Jsub            # 34 x30=35，跳 56
        addi x0, x0, 0            # 35 著陸
        addi x0, x0, 0            # 36
        addi x29, x0, 58          # 37 Jsub2 絕對位址（程式長度固定，見下）
        jalr x29, x29, 0          # 38 x29=39，跳 58
Blt:    blt  x9, x1, Blt_t        # 39 中（-3<5）→ 41
        addi x0, x0, 0            # 40 跳過
Blt_t:  addi x29, x0, 301         # 41 x29=301（覆蓋 jalr link）
        bge  x2, x1, Bge_t        # 42 中（7≥5）→ 44
        addi x0, x0, 0            # 43 跳過
Bge_t:  addi x30, x0, 401         # 44 x30=401（覆蓋 jal link）
        addi x31, x0, 3           # 45 迴圈計數
Loop:   addi x31, x31, -1         # 46
        bne  x31, x0, Loop        # 47 後跳 ×3（負位移 -1），脫離 → 48
        bltu x1, x9, Bltu_t       # 48 中（5<0xFFFFFFFD）→ 50
        addi x0, x0, 0            # 49 跳過
Bltu_t: addi x31, x0, 501         # 50 x31=501（覆蓋計數）
        bgeu x9, x1, Bgeu_t       # 51 中（大數≥5）→ 53
        addi x0, x0, 0            # 52 跳過
Bgeu_t: addi x26, x0, 601         # 53 x26=601
        addi x0, x0, 99           # 54 x0 寫入忽略
        halt                      # 55 凍結
Jsub:   addi x0, x0, 0            # 56 jal 目標
        jalr x0, x30, 0           # 57 回 35（x30=35）
Jsub2:  addi x0, x0, 0            # 58 jalr 目標
        jalr x0, x29, 0           # 59 回 39（x29=39）
