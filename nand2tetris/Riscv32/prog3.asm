# prog3.asm — SImm / Se12 負數測資（單週期與管線共用）
#
# 覆蓋：I 型負立即數（addi -1）、S 型負位移（sw -77）、B 型負位移
# （bne 後跳 -2，SImm 符號擴展）、資料 32 位元來回。
#
# 期望值：x1=0 x3=6 x5=77 x6=77；mem[0]=77

        addi x1, x0, 3          # 0  count=3
        addi x3, x0, 0          # 1  sum=0
loop:
        add  x3, x3, x1         # 2  sum+=count
        addi x1, x1, -1         # 3  count--（I-型負立即數）
        bne  x1, x0, loop       # 4  後跳 -2（SImm B 型負位移）
        sw   x3, 0(x0)          # 5  mem[0]=6
        addi x5, x0, 77         # 6  data
        sw   x5, -77(x5)        # 7  mem[0]=77（SW 負位移，位址 x5-77）
        lw   x6, -77(x5)        # 8  x6=77（LW 負位移）
        halt                    # 9