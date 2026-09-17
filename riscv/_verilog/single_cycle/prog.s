# prog.s — single_cycle 功能測試程式（僅 RV32I）
# 用法 1（Verilog）：由 singlecycle_test.v 經 prog.hex 載入執行
# 用法 2（對拍）：node cli/rvemu.js prog.s（cwd 在 _web_tools）
# 約定：a7=10、a0=exit code 結束；全對則 a0=0、a6=16

        # --- 1. 算術：1..10 求和，t0 應為 55 ---
        addi    t0, x0, 0
        addi    t1, x0, 1
        addi    t2, x0, 11
sum_loop:
        add     t0, t0, t1
        addi    t1, t1, 1
        blt     t1, t2, sum_loop    # t0=55, t1=11, t2=11

        # --- 2. 邏輯、移位、比較 ---
        li      t3, -1              # t3 = 0xFFFFFFFF
        andi    t4, t3, 0x7F        # t4 = 0x7F
        ori     t4, t4, 0x700       # t4 = 0x7FF
        xori    t5, t4, 0x7FF       # t5 = 0（稍後重用）
        slli    t6, t4, 8           # t6 = 0x7FF00（稍後重用）
        srli    s0, t3, 8           # s0 = 0x00FFFFFF
        srai    s1, t3, 8           # s1 = 0xFFFFFFFF
        slti    s2, t3, 0           # s2 = 1
        sltiu   s3, t3, 256         # s3 = 0
        sub     s4, x0, t1          # s4 = -11
        xor     s5, t3, t3          # s5 = 0
        or      s6, s0, t6          # s6 = 0x00FFFFFF
        and     s7, s0, t6          # s7 = 0x0007FF00
        slt     s8, t1, t0          # s8 = 1
        sltu    s9, t0, t1          # s9 = 0
        lui     s10, 0x12345        # s10 = 0x12345000
        auipc   s11, 0              # s11 = 本條指令位址

        # --- 3. 記憶體存取（0x200 起 8 位元組） ---
        li      t5, 0x200
        li      t6, 0xAABBCCDD
        sw      t6, 0(t5)
        lw      a1, 0(t5)           # a1 = 0xAABBCCDD
        sb      t6, 4(t5)           # 存 0xDD
        lbu     a2, 4(t5)           # a2 = 221
        lb      a3, 4(t5)           # a3 = -35
        sh      t6, 6(t5)           # 存 0xCCDD
        lhu     a4, 6(t5)           # a4 = 52445
        lh      a5, 6(t5)           # a5 = -13091

        # --- 4. 六種分支 taken 與 not-taken ---
        addi    a6, x0, 0
        beq     t0, t0, Lbeq_t
        jal     x0, FAIL
Lbeq_t: addi    a6, a6, 1
        bne     t0, t1, Lbne_t
        jal     x0, FAIL
Lbne_t: addi    a6, a6, 1
        blt     x0, t1, Lblt_t
        jal     x0, FAIL
Lblt_t: addi    a6, a6, 1
        bge     t1, x0, Lbge_t
        jal     x0, FAIL
Lbge_t: addi    a6, a6, 1
        bltu    x0, t1, Lbltu_t
        jal     x0, FAIL
Lbltu_t: addi    a6, a6, 1
        bgeu    t1, x0, Lbgeu_t
        jal     x0, FAIL
Lbgeu_t: addi    a6, a6, 1          # a6 = 6
        beq     t0, t1, FAIL        # 以下皆不該跳
        bne     t0, t0, FAIL
        blt     t1, x0, FAIL
        bge     x0, t1, FAIL
        bltu    t1, x0, FAIL
        bgeu    x0, t1, FAIL
        jal     x0, CALLTEST
FAIL:   addi    a6, x0, -1
        jal     x0, DONE

        # --- 5. JAL/JALR 連結 ---
CALLTEST:
        jal     ra, FUNC
        jal     x0, DONE_CALL
FUNC:   addi    a6, a6, 10          # a6 = 16（子程式有跑）
        jalr    x0, 0(ra)
DONE_CALL:

        # --- 6. 結束 ---
DONE:   li      a0, 0
        li      a7, 10
        ecall
