# ABI 示範：傳參與 caller/callee-saved（對應 2.1-2.4）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c abi_demo.s

    .text
    .globl caller
caller:
    addi sp, sp, -32          # 開框
    sd ra, 24(sp)             # 存 ra（caller 視角的返回位址）
    sd s0, 16(sp)             # 存 callee-saved
    mv s0, a0                 # s0 暫存首參（跨越呼叫仍有效）
    li a0, 1                  # a0-a7 依序傳 8 個參數
    li a1, 2
    li a2, 3
    li a3, 4
    li a4, 5
    li a5, 6
    li a6, 7
    li a7, 8
    li t0, 99                 # caller-saved：呼叫後不可假設保留
    call callee               # 跳被呼叫者
    mv t1, t0                 # 注意：t0 已被破壞，僅示意不可靠
    mv a1, s0                 # 取回跨越呼叫的舊值
    ld s0, 16(sp)             # 還原 callee-saved
    ld ra, 24(sp)
    addi sp, sp, 32
    ret

    .globl callee
callee:
    addi sp, sp, -16          # 被呼叫者開框
    sd s0, 8(sp)              # 保存自己會用的 s0
    add a0, a0, a1            # 取用 a0/a1 參數
    add a0, a0, a2
    li t0, 0                  # 隨意破壞 t0（caller-saved，合法）
    ld s0, 8(sp)              # 還原 s0
    addi sp, sp, 16
    ret                       # 回傳值在 a0
