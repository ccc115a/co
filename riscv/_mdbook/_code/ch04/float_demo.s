# 浮點點積：fmadd.d（對應 4.1-4.6）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c float_demo.s

    .section .rodata
    .align 3
vec_x:
    .double 1.0, 2.0, 3.0, 4.0
vec_y:
    .double 5.0, 6.0, 7.0, 8.0

    .text
    .globl dot4               # fa0 = sum(x[i]*y[i])，a0=x, a1=y, a2=n
dot4:
    fmv.d.x fa0, zero         # 累加器歸零
    li t0, 0                  # i = 0
1:
    fld ft0, 0(a0)            # 取 x[i]
    fld ft1, 0(a1)            # 取 y[i]
    fmadd.d fa0, ft0, ft1, fa0  # acc += x*y
    addi a0, a0, 8
    addi a1, a1, 8
    addi t0, t0, 1
    blt t0, a2, 1b
    ret
