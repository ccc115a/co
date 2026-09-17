# hello.s — 以 SB 寫 0x10000000 逐字印出 `Hi RV32!`，再以 ecall(a7=10) 結束。
# 預期 UART: Hi RV32!
# 預期 exit: 0
# 只用 RV32I + 偽指令 li；s0 = UART base (0x10000000)。

        lui     s0, 0x10000     # s0 = 0x10000000 (UART)

        li      t1, 72          # 'H'
        sb      t1, 0(s0)
        li      t1, 105         # 'i'
        sb      t1, 0(s0)
        li      t1, 32          # ' '
        sb      t1, 0(s0)
        li      t1, 82          # 'R'
        sb      t1, 0(s0)
        li      t1, 86          # 'V'
        sb      t1, 0(s0)
        li      t1, 51          # '3'
        sb      t1, 0(s0)
        li      t1, 50          # '2'
        sb      t1, 0(s0)
        li      t1, 33          # '!'
        sb      t1, 0(s0)

        li      a0, 0           # exit code 0
        li      a7, 10          # ecall: halt
        ecall
