# 分支跳躍示範：B 型與 J 型（對應 3.1-3.5）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c branch_jump.s

    .text
    .globl max3                # a0 = max(a0, a1)，示範 beq/bne/blt/jal/jalr
max3:
    beq a0, a1, eq_case        # 相等走捷徑
    blt a0, a1, take_b         # a0 < a1 則取 b
    j done
take_b:
    mv a0, a1
    j done
eq_case:
    nop                        # 相等：a0 不變
done:
    jal t0, helper             # jal 存返回位址於 t0
    jr t0                      # jalr（jr 偽指令）跳回
helper:
    addi a0, a0, 0
    jalr x0, 0(t0)             # 直接用 t0 返回
