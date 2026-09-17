# sort.s — 以氣泡排序將堆疊上的 5 個數 [5,3,4,1,2] 排成 [1,2,3,4,5]，
# 再把排序結果以字元經 UART 印出，並以 exit code 0 結束。
# 預期 UART: 12345
# 預期 exit: 0
# 只用 RV32I + 偽指令 li/j；s0 = UART base；數列放在 sp 指標的堆疊區。

        # sp 明確指向 RAM 高位（模擬器開機 sp=0，bare-metal 需自行初始化）
        lui     sp, 0x10          # sp = 0x10000（程式碼在其下方）
        addi    sp, sp, -32
        li      t0, 5
        sw      t0, 0(sp)
        li      t0, 3
        sw      t0, 4(sp)
        li      t0, 4
        sw      t0, 8(sp)
        li      t0, 1
        sw      t0, 12(sp)
        li      t0, 2
        sw      t0, 16(sp)

        li      t3, 5           # t3 = n
        li      s3, 4           # s3 = n - 1（外圈上限）
        li      t4, 0           # t4 = i（外圈）
sort_outer:
        sub     t5, t3, t4      # t5 = n - i
        addi    t5, t5, -1      # t5 = n-1-i（內圈比較次數，恆 >= 1）
        li      t6, 0           # t6 = j（內圈）
sort_inner:
        slli    s2, t6, 2       # s2 = j*4（位元組偏移）
        add     s2, s2, sp      # s2 = &a[j]
        lw      t1, 0(s2)       # t1 = a[j]
        lw      t2, 4(s2)       # t2 = a[j+1]
        blt     t2, t1, sort_swap  # a[j+1] < a[j] → 交換
        j       sort_noswap
sort_swap:
        sw      t2, 0(s2)
        sw      t1, 4(s2)
sort_noswap:
        addi    t6, t6, 1
        blt     t6, t5, sort_inner
        addi    t4, t4, 1
        blt     t4, s3, sort_outer

        # --- 印出排序結果（五數皆為個位數，直接加 '0'） ---
        lui     s0, 0x10000     # s0 = 0x10000000 (UART)
        lw      t0, 0(sp)
        addi    t0, t0, 48
        sb      t0, 0(s0)
        lw      t0, 4(sp)
        addi    t0, t0, 48
        sb      t0, 0(s0)
        lw      t0, 8(sp)
        addi    t0, t0, 48
        sb      t0, 0(s0)
        lw      t0, 12(sp)
        addi    t0, t0, 48
        sb      t0, 0(s0)
        lw      t0, 16(sp)
        addi    t0, t0, 48
        sb      t0, 0(s0)

        li      a0, 0
        li      a7, 10
        ecall
