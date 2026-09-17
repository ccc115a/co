# 整數乘除（RV64M）（對應 4.1-4.6）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c mul_div.s

    .text
    .globl mul_div_demo       # a0=x, a1=y；回傳 (x*y, x/y, x%y) 之組合示意
mul_div_demo:
    mul a2, a0, a1            # 低 64 位乘積
    mulh a3, a0, a1           # 有號乘積高位
    mulhu a4, a0, a1          # 無號乘積高位
    beqz a1, div_skip         # 避開除零
    div a5, a0, a1            # 有號除法
    divu t0, a0, a1           # 無號除法
    rem t1, a0, a1            # 有號餘數
    remu t2, a0, a1           # 無號餘數
    mulw a0, a0, a1           # 32 位乘（符號擴展）
    divw a0, a0, a1           # 32 位除
    ret
div_skip:
    li a0, 0
    ret
