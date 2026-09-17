# prog.s — 5stage 管線功能測試（僅 RV32I）
# 用法 1（Verilog）：由 pipeline_test.v 經 prog.hex 載入執行
# 用法 2（對拍）：node cli/rvemu.js prog.s（cwd 在 _web_tools）
# 約定：a7=10、a0=exit code 結束；全對則 a0=0、a6=16
# 重點：背靠背相依（EX→EX 前遞）、隔一條（MEM/WB→EX 前遞）、
#       load-use 停頓、store 資料前遞、分支/JAL/JALR 沖除

        # --- 1. EX→EX forwarding 鏈（背靠背相依） ---
        addi    t0, x0, 5
        addi    t1, x0, 7
        add     t2, t0, t1      # 12
        add     t3, t2, t2      # 24
        add     t4, t3, t2      # 36
        sub     s0, t4, t0      # 31
        xor     s1, t4, t4      # 0
        or      s2, t0, t1      # 7
        and     s3, t0, t1      # 5
        sll     s4, t0, t1      # 640
        srl     s5, t1, t0      # 0
        slt     s6, t0, t1      # 1
        sltu    s7, t1, t0      # 0

        # --- 2. MEM/WB→EX forwarding（隔一條無關指令） ---
        addi    t5, x0, 100     # t5 = 100
        addi    t6, x0, 1       # 無關，隔開
        add     s8, t5, t5      # 200（t5 已到 WB）

        # --- 3. 立即數、移位、比較 ---
        li      s9, -1          # s9 = 0xFFFFFFFF（稍後重用）
        andi    s9, s9, 0x7F    # s9 = 0x7F
        ori     s9, s9, 0x700   # s9 = 0x77F
        xori    s10, s9, 0x7FF  # s10 = 0x080（稍後重用）
        slli    s11, s9, 8      # s11 = 0x7FF00（稍後重用）
        srli    t3, s9, 3       # t3 = 0xFF（重用 t3）
        srai    t4, s9, 31      # t4 = 0（重用 t4）
        slti    t2, s9, 0x7FF   # t2 = 0（2047 < 2047 不成立；重用 t2）
        sltiu   s0, s9, 256     # s0 = 0（重用 s0）

        # --- 4. LUI / AUIPC ---
        lui     s10, 0x12345    # s10 = 0x12345000
        auipc   s11, 0          # s11 = 本條指令位址

        # --- 5. load-use stall：lw 緊接著讀 ---
        li      t5, 0x200
        li      t6, 0xAABBCCDD
        sw      t6, 0(t5)
        lw      a1, 0(t5)       # a1 = 0xAABBCCDD
        add     a2, a1, a1      # load-use：stall 一拍；a2 = low32(2*a1)
        sw      a2, 4(t5)       # store 資料來自前遞（add 緊鄰在前）
        lw      a3, 4(t5)       # 回讀 a2
        sb      t6, 8(t5)       # 存 0xDD
        lbu     a4, 8(t5)       # a4 = 221
        lb      a5, 8(t5)       # a5 = -35
        sh      t6, 10(t5)      # 存 0xCCDD
        lhu     a6, 10(t5)      # load-use 讀 a6（稍後分支段重設為計數器）
        lh      a7, 10(t5)      # load-use 讀 a7（稍後結束段重設）

        # --- 6. 六種分支 taken 與 not-taken（沖除正確性） ---
        addi    a6, x0, 0       # a6 清零當計數器
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
Lbgeu_t: addi    a6, a6, 1      # a6 = 6
        beq     t0, t1, FAIL    # 以下皆不該跳
        bne     t0, t0, FAIL
        blt     t1, x0, FAIL
        bge     x0, t1, FAIL
        bltu    t1, x0, FAIL
        bgeu    x0, t1, FAIL
        jal     x0, CALLTEST
FAIL:   addi    a6, x0, -1
        jal     x0, DONE

        # --- 7. JAL/JALR 連結 ---
CALLTEST:
        jal     ra, FUNC
        jal     x0, DONE_CALL
FUNC:   addi    a6, a6, 10      # a6 = 16（子程式有跑）
        jalr    x0, 0(ra)
DONE_CALL:

        # --- 8. 結束 ---
DONE:   li      a0, 0
        li      a7, 10
        ecall
