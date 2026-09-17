# ALU 示範：R 型與 I 型整數運算（對應 3.1-3.5）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c alu_demo.s

    .text
    .globl alu_demo
alu_demo:
    add a0, a0, a1            # R 型：加
    sub a0, a0, a2            # R 型：減
    and a0, a0, a1            # R 型：邏輯與
    or  a0, a0, a2            # R 型：邏輯或
    xor a0, a0, a1            # R 型：互斥或
    sll a0, a0, a2            # R 型：邏輯左移
    srl a0, a0, a2            # R 型：邏輯右移
    sra a0, a0, a2            # R 型：算術右移
    slt a0, a0, a1            # R 型：小於置位
    addi a0, a0, 10           # I 型：加立即值
    andi a0, a0, 0xFF         # I 型：與立即值
    slli a0, a0, 2            # I 型：左移立即值
    ret
