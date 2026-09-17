# start.s — _start 進入點（對應 14.1 交棒：a0=hartid，a1=DTB）
# 環境：QEMU virt＋OpenSBI，載入位址 0x80200000，S-Mode 進入。

    .section .text
    .globl _start
_start:
    la      sp, stack_top     # 設核心棧（本檔 .bss 尾端）
    call    sbi_main          # C 側印 Hello
hang:
    wfi                       # 印完休眠（多核下非 boot hart 亦停此）
    j       hang

    .section .bss
    .align 4
    .space 4096               # 4K 棧空間
stack_top:
