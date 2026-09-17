# mul.s — M 擴充 mul：6 * 7 = 42，以十進位字元經 UART 印出，並以 exit code 42 結束。
# 預期 UART: 42
# 預期 exit: 42
# 只用 RV32I + M(mul) + 偽指令 li/mv/j；s0 = UART base，s1 = 計算結果(留作 exit code)。

        li      t1, 6
        li      t2, 7
        mul     t0, t1, t2      # t0 = 42

        mv      s1, t0          # 留作 exit code
        lui     s0, 0x10000     # s0 = 0x10000000 (UART)

        # --- 以重複減法拆出百/十/個位 ---
        li      t3, 100
        li      t4, 0           # t4 = 百位數
mul_h100:
        blt     t0, t3, mul_h100_done
        sub     t0, t0, t3
        addi    t4, t4, 1
        j       mul_h100
mul_h100_done:
        li      t3, 10
        li      t5, 0           # t5 = 十位數
mul_h10:
        blt     t0, t3, mul_h10_done
        sub     t0, t0, t3
        addi    t5, t5, 1
        j       mul_h10
mul_h10_done:
        # 前導零不印，至少印一位
        li      t6, 0
        beq     t4, t6, mul_no_hund
        addi    t4, t4, 48
        sb      t4, 0(s0)
        addi    t5, t5, 48
        sb      t5, 0(s0)
        j       mul_print_ones
mul_no_hund:
        beq     t5, t6, mul_print_ones
        addi    t5, t5, 48
        sb      t5, 0(s0)
mul_print_ones:
        addi    t0, t0, 48
        sb      t0, 0(s0)

        mv      a0, s1          # exit code = 42
        li      a7, 10
        ecall
