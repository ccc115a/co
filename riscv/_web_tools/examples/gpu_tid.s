# gpu_tid.s — riscvgpu custom-0 入門：tid／ntid／barrier。
# 單通道語意（tid=0、ntid=1、barrier=nop），瀏覽器 IDE 與 rvemu 可直接跑；
# 4 通道硬體上各通道印出自己的 T<tid> N<ntid>。
# 預期 UART: T0 N1
# 預期 exit: 0（exit code = tid）
# 只用 RV32I＋custom-0，不碰資料記憶體。

        tid     t0              # t0 = 通道號（單通道為 0）
        ntid    t1              # t1 = 通道數（單通道為 1）
        barrier                 # 通道同步（單通道為 nop）

        lui     s0, 0x10000     # s0 = 0x10000000 (UART)
        li      t2, 84           # 'T'
        sb      t2, 0(s0)
        addi    t2, t0, 48       # '0' + tid
        sb      t2, 0(s0)
        li      t2, 32           # ' '
        sb      t2, 0(s0)
        li      t2, 78           # 'N'
        sb      t2, 0(s0)
        addi    t2, t1, 48       # '0' + ntid
        sb      t2, 0(s0)

        mv      a0, t0           # exit code = tid
        li      a7, 10
        ecall
