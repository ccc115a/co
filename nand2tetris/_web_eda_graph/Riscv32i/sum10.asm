# sum10.asm — rv32i 記憶體示範：sum = 1+...+10 = 55，存入 mem[16] 再讀回
#
# 期望值（halt 後探測）：
#   x1=55  x2=11  x3=10  x4=11  x5=55  x0=0
#   mem[16]=55

        addi x1, x0, 0            # 0  sum=0
        addi x2, x0, 1            # 1  i=1
        addi x3, x0, 10           # 2  n=10
        addi x4, x0, 11           # 3  limit=n+1
loop:   add  x1, x1, x2           # 4  sum+=i
        addi x2, x2, 1            # 5  i++
        blt  x2, x4, loop         # 6  i<11 跳回（位移 -2）
        sw   x1, 16(x0)           # 7  mem[16]=55
        lw   x5, 16(x0)           # 8  x5=55（讀回驗證）
        halt                      # 9  凍結
