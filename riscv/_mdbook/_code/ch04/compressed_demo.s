# 壓縮指令示範（RVC）（對應 4.1-4.6）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c compressed_demo.s

    .text
    .globl compressed_demo    # a0=n；回傳 sum(1..n)，倒數迴圈全用 C 指令
compressed_demo:
    c.li a1, 0                # sum = 0（16-bit）
    c.mv a2, a0               # i = n
1:
    c.add a1, a2              # sum += i
    c.addi a2, -1             # i--
    c.bnez a2, 1b             # i != 0 繼續
    c.mv a0, a1               # 回傳值搬移
    c.jr ra                   # 壓縮返回
