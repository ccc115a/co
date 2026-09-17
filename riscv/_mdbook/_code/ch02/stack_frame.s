# 堆疊框對照：leaf 與 nested（對應 2.1-2.4）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c stack_frame.s

    .text
    .globl leaf_add
leaf_add:
    add a0, a0, a1            # 葉函式：不呼叫他者，免開框
    ret

    .globl nested_call
nested_call:
    addi sp, sp, -16          # 非葉函式：開 16 位元組框
    sd ra, 8(sp)              # 存返回位址（會被內層 call 蓋掉）
    sd s0, 0(sp)              # 存 frame pointer
    mv s0, sp                 # 建立 frame
    call leaf_add             # 內層呼叫
    add a0, a0, a2            # 用回傳值再算
    ld s0, 0(sp)              # 還原 frame
    ld ra, 8(sp)              # 還原 ra
    addi sp, sp, 16
    ret
