# crt0.s — 最小啟動檔（對應 15.1）
# 流程：設 sp → 清 bss → 跳 main；main 返回後 wfi 休眠。

    .section .text.init, "ax"
    .globl _start
_start:
    la sp, _stack_top        # 設堆疊頂（link.ld 定義）

    la t0, _bss_start        # 清 bss 區段
    la t1, _bss_end
1:
    bgeu t0, t1, 2f
    sw zero, 0(t0)
    addi t0, t0, 4
    j 1b
2:
    call main                # 跳 C 主程式

hang:
    wfi                      # 返回後休眠等待中斷
    j hang
