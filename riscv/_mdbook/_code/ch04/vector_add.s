# 向量加法（RVV）（對應 4.1-4.6）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gcv -mabi=lp64d -c vector_add.s

    .text
    .globl vector_add         # a0=dst, a1=src1, a2=src2, a3=n（64-bit 元素個數）
vector_add:
    beqz a3, done
loop:
    vsetvli t0, a3, e64, m8, ta, ma  # 取本次處理元素數
    vle64.v v0, (a1)          # 載入 src1
    vle64.v v8, (a2)          # 載入 src2
    vadd.vv v16, v0, v8       # 向量相加
    vse64.v v16, (a0)         # 存回 dst
    sub a3, a3, t0            # 扣掉已處理數
    slli t0, t0, 3            # 元素數轉位元組（*8）
    add a0, a0, t0
    add a1, a1, t0
    add a2, a2, t0
    bnez a3, loop
done:
    ret
