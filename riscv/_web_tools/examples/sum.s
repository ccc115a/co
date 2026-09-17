# sum.s — 計算 1+2+...+10 = 55，以十進位字元經 UART 印出，並以 exit code 55 結束。
# 預期 UART: 55
# 預期 exit: 55
# 只用 RV32I + 偽指令 li/mv/j；s0 = UART base，s1 = 計算結果(留作 exit code)。

        li      t0, 0           # t0 = sum
        li      t1, 1           # t1 = i
        li      t2, 11          # 上限(不含)
sum_loop:
        add     t0, t0, t1
        addi    t1, t1, 1
        blt     t1, t2, sum_loop

        mv      s1, t0          # s1 = 55（留作 exit code）
        lui     s0, 0x10000     # s0 = 0x10000000 (UART)

        # --- 以重複減法拆出百/十/個位 ---
        li      t3, 100
        li      t4, 0           # t4 = 百位數
sum_h100:
        blt     t0, t3, sum_h100_done
        sub     t0, t0, t3
        addi    t4, t4, 1
        j       sum_h100
sum_h100_done:
        li      t3, 10
        li      t5, 0           # t5 = 十位數
sum_h10:
        blt     t0, t3, sum_h10_done
        sub     t0, t0, t3
        addi    t5, t5, 1
        j       sum_h10
sum_h10_done:
        # 此時 t4=百位, t5=十位, t0=個位；前導零不印，至少印一位
        li      t6, 0
        beq     t4, t6, sum_no_hund
        addi    t4, t4, 48
        sb      t4, 0(s0)
        addi    t5, t5, 48
        sb      t5, 0(s0)
        j       sum_print_ones
sum_no_hund:
        beq     t5, t6, sum_print_ones
        addi    t5, t5, 48
        sb      t5, 0(s0)
sum_print_ones:
        addi    t0, t0, 48
        sb      t0, 0(s0)

        mv      a0, s1          # exit code = 55
        li      a7, 10
        ecall
