# 位元操作示範（Zbb）（對應 4.1-4.6）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc_zbb -mabi=lp64d -c bitmanip.s

    .text
    .globl bitmanip_demo      # a0=x, a1=y；展示 Zbb 常用指令
bitmanip_demo:
    andn a2, a0, a1           # x & ~y
    orn a3, a0, a1            # x | ~y
    xnor a4, a0, a1           # ~(x ^ y)
    clz a5, a0                # 前導零個數
    ctz a6, a0                # 尾隨零個數
    cpop t0, a0               # population count
    rori t1, a0, 8            # 右旋 8 位
    rev8 t2, a0               # 位元組反轉
    add a0, a2, a3            # 彙整回傳（示意）
    add a0, a0, a4
    ret
