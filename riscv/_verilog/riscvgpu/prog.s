# prog.s — riscvgpu 向量加法測試（4 通道 SPMD）
# C[i] = A[i] + B[i]，i=0..7；A@0x100（A[i]=i+1）、B@0x120（B[i]=10*(i+1)）、C@0x140
# 每通道處理連續 2 個元素：k = tid*2+j，j=0,1
# 用法 1（Verilog）：由 riscvgpu_test.v 經 prog.hex 載入執行
# 注意：rvemu 跑不了 custom-0 自訂指令，此檔 golden 為手算：
#   C = 11,22,33,44,55,66,77,88；lane0 的 a0 = 錯誤數（0 為 PASS）
# 約定：全部通道以 ecall 結束（a7=10）

# 自訂指令編碼（custom-0，opcode=0001011；見 README）：
#   tid t0   = 0x0000028B（funct3=000，rd=x5）
#   ntid t1  = 0x0000130B（funct3=001，rd=x6）
#   barrier  = 0x0000200B（funct3=010，rd=x0）

        .word   0x0000028B      # tid t0
        .word   0x0000130B      # ntid t1
        li      t2, 0x100       # A 基址
        li      t3, 0x120       # B 基址
        li      t4, 0x140       # C 基址
        slli    t5, t0, 3       # byte offset = tid*8（2 個字）
        add     t2, t2, t5      # 我的 A 指標
        add     t3, t3, t5      # 我的 B 指標
        add     t4, t4, t5      # 我的 C 指標

        # --- 初始化：A=v, B=10*v；v0=tid*2+1, v1=tid*2+2 ---
        slli    t6, t0, 1       # k0 = tid*2
        addi    s0, t6, 1       # v0
        addi    s1, t6, 2       # v1
        sw      s0, 0(t2)
        sw      s1, 4(t2)
        slli    s2, s0, 3       # 8*v0
        slli    s3, s0, 1       # 2*v0
        add     s2, s2, s3      # 10*v0
        sw      s2, 0(t3)
        slli    s2, s1, 3       # 8*v1
        slli    s3, s1, 1       # 2*v1
        add     s2, s2, s3      # 10*v1
        sw      s2, 4(t3)

        # --- barrier：等全部通道寫完 A/B ---
        .word   0x0000200B      # barrier

        # --- 各通道不同工作量（tid 圈空轉），錯開到達第二 barrier 的時間 ---
        # 若 barrier 失效，lane0 會提早驗證、C[7] 仍為 0 而 FAIL
        add     t6, x0, t0      # 延遲圈數 = tid（lane3 跑 3 圈）
DLY:    beq     t6, x0, SKIPD
        addi    t6, t6, -1
        jal     x0, DLY
SKIPD:
        # --- 計算 C = A + B ---
        lw      s4, 0(t2)
        lw      s5, 0(t3)
        add     s6, s4, s5
        sw      s6, 0(t4)
        lw      s4, 4(t2)
        lw      s5, 4(t3)
        add     s6, s4, s5
        sw      s6, 4(t4)

        # --- 各通道不同工作量（tid 次空轉），barrier 必須等最慢者 ---
        # 若 barrier 失效，lane0 會提早驗證、C[6..7] 仍為 0 而 FAIL
        add     t6, x0, t0      # 延遲圈數 = tid（lane3 跑 3 圈）
DLY2:   beq     t6, x0, SKIPD2
        addi    t6, t6, -1
        jal     x0, DLY2
SKIPD2:
        # --- barrier：等全部通道寫完 C（且到齊） ---
        .word   0x0000200B      # barrier

        # --- 只有 lane0 驗證（其餘直跳 QUIT） ---
        bne     t0, x0, QUIT
        li      a0, 0
        # 即時抽查：最慢通道 lane3 寫的 C[7]；barrier 失效時此處讀到 0
        li      s1, 0x15C
        lw      s1, 0(s1)
        li      s2, 88
        bne     s1, s2, BAD0
        jal     x0, CHKINIT
BAD0:   addi    a0, a0, 1
CHKINIT: li     t2, 0x140
        li      t6, 0           # i（0-based 累加器，t6 即 i+1）
        slli    s0, t1, 1       # 共 ntid*2 = 8 個元素（順便用掉 NTID）
CHK:    lw      s1, 0(t2)       # C[i]
        addi    t6, t6, 1       # v = i+1
        slli    s2, t6, 3       # 8*v
        slli    s3, t6, 1       # 2*v
        add     s2, s2, s3
        add     s2, s2, t6      # 期望 11*v
        bne     s1, s2, BAD
        jal     x0, NEXT
BAD:    addi    a0, a0, 1
NEXT:   addi    t2, t2, 4
        addi    s0, s0, -1
        bne     s0, x0, CHK
        jal     x0, QUIT
QUIT:   li      a7, 10
        ecall
