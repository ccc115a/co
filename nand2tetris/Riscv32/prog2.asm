# prog2.asm — RV32S 迴圈測資：sum(1..10)=55
#
# 覆蓋後跳條件分支（blt 迴圈、含 1 拍前遞鏈與最後落空）、HALT。
# 期望（halt 後）：x1=55, x2=11, x4=99；無記憶體寫入。

        addi x1, x0, 0        # 0  sum=0
        addi x2, x0, 1        # 1  i=1
        addi x3, x0, 11       # 2  limit=11
loop:   add  x1, x1, x2       # 3  sum+=i
        addi x2, x2, 1        # 4  i++
        blt  x2, x3, loop     # 5  i<11 → loop（-2）
        addi x4, x0, 99       # 6  最後 i=11 落空走到這
        halt                  # 7