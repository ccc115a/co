# gpu_vecadd1.s — 單通道向量加法（C = A + B，n=2）。
# 示範 GPU 寫法（tid 取號＋barrier 分段＋lane0 驗證），但 lanes=1，
# 故單通道語意下可完整跑完：瀏覽器 IDE 與 rvemu 在 origin 0 直接跑。
# 資料放在 0x200 以上，避開程式區（程式約 30 條指令）。
# 預期 UART: OK
# 預期 exit: 0（a0 = 驗證錯誤數）
# 完整 4 通道版見 kernels/vecadd.ku（cu2rv 產生，跑 iverilog 硬體）。

        tid     t0              # 單通道 tid=0
        li      t2, 0x200       # A 基址
        li      t3, 0x208       # B 基址
        li      t4, 0x210       # C 基址

        # --- init：A={1,2}，B={10,20} ---
        li      t5, 1
        sw      t5, 0(t2)
        li      t5, 2
        sw      t5, 4(t2)
        li      t5, 10
        sw      t5, 0(t3)
        li      t5, 20
        sw      t5, 4(t3)
        barrier

        # --- kernel：C = A + B ---
        lw      t5, 0(t2)
        lw      t6, 0(t3)
        add     t5, t5, t6
        sw      t5, 0(t4)
        lw      t5, 4(t2)
        lw      t6, 4(t3)
        add     t5, t5, t6
        sw      t5, 4(t4)
        barrier

        # --- verify：C 應為 {11,22} ---
        li      a0, 0
        lw      t5, 0(t4)
        li      t6, 11
        bne     t5, t6, bad
        lw      t5, 4(t4)
        li      t6, 22
        bne     t5, t6, bad
        j       done
bad:    addi    a0, a0, 1
done:   lui     s0, 0x10000     # UART
        li      t5, 79           # 'O'
        sb      t5, 0(s0)
        li      t5, 75           # 'K'
        sb      t5, 0(s0)
        li      a7, 10
        ecall
