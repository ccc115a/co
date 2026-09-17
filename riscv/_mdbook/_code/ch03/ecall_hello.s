# ecall hello：系統呼叫骨架（對應 3.1-3.5）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c ecall_hello.s
# 說明：Linux RV64 上 a7=64(write)/93(exit)；裸機僅示意呼叫慣例

    .section .rodata
msg:
    .ascii "hello\n"
    .equ MSG_LEN, . - msg

    .text
    .globl _start
_start:
    li a0, 1                  # fd = stdout
    la a1, msg                # buf
    li a2, MSG_LEN            # len
    li a7, 64                 # sys_write
    ecall                     # 陷入核心
    li a0, 0                  # 結束碼
    li a7, 93                 # sys_exit
    ecall
