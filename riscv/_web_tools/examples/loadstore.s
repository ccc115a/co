# loadstore.s — LW/SW/SB/LB 往返測試（含符號延伸、零延伸、小端位元組序）。
# 全對則 a0=0 並印 `OK`；任一失敗則 a0=1 並印 `FAIL`。
# 預期 UART(全對): OK
# 預期 exit(全對): 0
# 只用 RV32I + 偽指令 li；以 sp 指向的堆疊區作測試記憶體。

        # sp 明確指向 RAM 高位（模擬器開機 sp=0，bare-metal 需自行初始化）
        lui     sp, 0x10          # sp = 0x10000（程式碼在其下方）
        addi    sp, sp, -16

        # SW/LW 往返
        li      t0, 12345
        sw      t0, 0(sp)
        lw      t1, 0(sp)
        bne     t0, t1, ls_fail

        # SB/LB 往返（含符號延伸）：-5 存位元組再讀回仍為 -5
        li      t0, -5
        sb      t0, 4(sp)
        lb      t1, 4(sp)
        bne     t0, t1, ls_fail

        # SB/LBU 往返（零延伸）：200 讀回仍為 200
        li      t0, 200
        sb      t0, 5(sp)
        lbu     t1, 5(sp)
        bne     t0, t1, ls_fail

        # 小端序檢查：0x01020304 的最低位位元組為 0x04，最高位為 0x01
        lui     t0, 0x1020
        addi    t0, t0, 0x304   # t0 = 0x01020304
        sw      t0, 8(sp)
        lb      t1, 8(sp)
        li      t2, 4
        bne     t1, t2, ls_fail
        lb      t1, 11(sp)
        li      t2, 1
        bne     t1, t2, ls_fail

        # --- 全對 ---
        lui     s0, 0x10000     # s0 = 0x10000000 (UART)
        li      t1, 79          # 'O'
        sb      t1, 0(s0)
        li      t1, 75          # 'K'
        sb      t1, 0(s0)
        li      a0, 0
        li      a7, 10
        ecall

ls_fail:
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
