# branch.s — 六種比較分支（beq/bne/blt/bge/bltu/bgeu）各測 taken 與 not-taken。
# 全對則印 `OK` 且 exit 0；任一失敗則印 `FAIL` 且 exit 1。
# 預期 UART(全對): OK
# 預期 exit(全對): 0
# 只用 RV32I + 偽指令 li/j。

        # --- beq ---
        li      t0, 5
        li      t1, 5
        beq     t0, t1, br_beq_t
        j       br_fail
br_beq_t:
        li      t1, 6
        beq     t0, t1, br_fail  # 5 == 6？不該跳

        # --- bne ---
        bne     t0, t1, br_bne_t  # 5 != 6，該跳
        j       br_fail
br_bne_t:
        li      t1, 5
        bne     t0, t1, br_fail  # 5 != 5？不該跳

        # --- blt（有號）：-1 < 1 成立，1 < -1 不成立 ---
        li      t0, -1
        li      t1, 1
        blt     t0, t1, br_blt_t
        j       br_fail
br_blt_t:
        blt     t1, t0, br_fail

        # --- bge（有號）：1 >= -1 成立，-1 >= 1 不成立 ---
        bge     t1, t0, br_bge_t
        j       br_fail
br_bge_t:
        bge     t0, t1, br_fail

        # --- bltu（無號）：1 < 0xFFFFFFFF 成立，0xFFFFFFFF < 1 不成立 ---
        bltu    t1, t0, br_bltu_t
        j       br_fail
br_bltu_t:
        bltu    t0, t1, br_fail

        # --- bgeu（無號）：0xFFFFFFFF >= 1 成立，1 >= 0xFFFFFFFF 不成立 ---
        bgeu    t0, t1, br_bgeu_t
        j       br_fail
br_bgeu_t:
        bgeu    t1, t0, br_fail

        # --- 全對 ---
        lui     s0, 0x10000     # s0 = 0x10000000 (UART)
        li      t1, 79          # 'O'
        sb      t1, 0(s0)
        li      t1, 75          # 'K'
        sb      t1, 0(s0)
        li      a0, 0
        li      a7, 10
        ecall

br_fail:
        lui     s0, 0x10000
        li      t1, 70          # 'F'
        sb      t1, 0(s0)
        li      t1, 65          # 'A'
        sb      t1, 0(s0)
        li      t1, 73          # 'I'
        sb      t1, 0(s0)
        li      t1, 76          # 'L'
        sb      t1, 0(s0)
        li      a0, 1
        li      a7, 10
        ecall
