# fib.s — 迴圈求 fib(10) = 55（fib(0)=0, fib(1)=1），以十進位字元經 UART 印出，並以 exit code 55 結束。
# 預期 UART: 55
# 預期 exit: 55
# 只用 RV32I + 偽指令 li/mv/j；s0 = UART base，s1 = 計算結果(留作 exit code)。

        li      t0, 10          # t0 = n
        li      t1, 0           # t1 = a = fib(0)
        li      t2, 1           # t2 = b = fib(1)
        li      t3, 2           # t3 = i
fib_loop:
        blt     t0, t3, fib_done  # n < i → 完成
        add     t4, t1, t2      # t4 = a + b
        mv      t1, t2
        mv      t2, t4
        addi    t3, t3, 1
        j       fib_loop
fib_done:
        # t2 = fib(10) = 55
        mv      s1, t2          # 留作 exit code
        mv      t0, t2          # t0 = 待印數值
        lui     s0, 0x10000     # s0 = 0x10000000 (UART)

        # --- 以重複減法拆出百/十/個位 ---
        li      t3, 100
        li      t4, 0           # t4 = 百位數
fib_h100:
        blt     t0, t3, fib_h100_done
        sub     t0, t0, t3
        addi    t4, t4, 1
        j       fib_h100
fib_h100_done:
        li      t3, 10
        li      t5, 0           # t5 = 十位數
fib_h10:
        blt     t0, t3, fib_h10_done
        sub     t0, t0, t3
        addi    t5, t5, 1
        j       fib_h10
fib_h10_done:
        # 前導零不印，至少印一位
        li      t6, 0
        beq     t4, t6, fib_no_hund
        addi    t4, t4, 48
        sb      t4, 0(s0)
        addi    t5, t5, 48
        sb      t5, 0(s0)
        j       fib_print_ones
fib_no_hund:
        beq     t5, t6, fib_print_ones
        addi    t5, t5, 48
        sb      t5, 0(s0)
fib_print_ones:
        addi    t0, t0, 48
        sb      t0, 0(s0)

        mv      a0, s1          # exit code = 55
        li      a7, 10
        ecall
