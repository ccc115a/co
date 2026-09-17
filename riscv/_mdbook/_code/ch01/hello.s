# RV64 裸機 hello 骨架（對應 1.1-1.4）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c hello.s

    .section .bss              # 保留 4KB 堆疊
    .align 4
_stack:
    .space 4096
_stack_top:

    .section .rodata            # 訊息本體
msg:
    .ascii "hello\n"
    .equ MSG_LEN, . - msg

    .text
    .globl _start
_start:
    la sp, _stack_top          # 初始化堆疊指標
    la a0, msg                # a0 = 字串位址
    li a1, MSG_LEN            # a1 = 長度
    call putstr               # 呼叫輸出副程式（平台自補）
    li a0, 0                  # 結束碼
    call halt

putstr:
    ret                       # 樁：實際平台改寫為 UART/ecall

halt:
    wfi                       # 等待中斷
    j halt                    # 保底迴圈
