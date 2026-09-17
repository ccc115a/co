# lr/sc 自旋鎖（對應 4.1-4.6）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c atomic_spinlock.s
# 語意：a0 = 鎖位址（0 開、1 關）；成功才進入臨界區

    .text
    .globl spin_acquire
spin_acquire:
    lr.w t0, (a0)             # 預約讀取
    bnez t0, spin_acquire     # 有人持有則自旋
    li t1, 1
    sc.w t0, t1, (a0)         # 預約寫入 1
    bnez t0, spin_acquire     # 失敗重試
    fence r, rw               # 取鎖後屏障
    ret

    .globl spin_release
spin_release:
    fence rw, w               # 放鎖前屏障
    amoswap.w x0, x0, (a0)    # 原子寫回 0（讀值丟棄）
    ret
