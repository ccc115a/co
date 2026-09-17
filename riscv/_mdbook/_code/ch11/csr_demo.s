# csr_demo.s — CSR 讀寫三件套示範（對應 11.4）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -c csr_demo.s -o csr_demo.o
# 說明：僅示範組譯器接受 csrrw/csrrs/csrrc 語法，不代表 U-Mode 可執行其中 M 級 CSR。

    .text
    .globl csr_demo
csr_demo:
    # 讀 mstatus（0x300）：csrr 為 csrrs rd, csr, x0 之偽指令
    csrr    t0, mstatus          # t0 = mstatus 舊值（純讀，不寫入）

    # 置位 mstatus.MIE（bit 3）：csrs 為 csrrs x0, csr, rs1 之偽指令
    li      t1, 0x8              # MIE 遮罩
    csrs    mstatus, t1          # mstatus |= 0x8（回讀丟棄）

    # 清除 mstatus.MIE：csrc 為 csrrc x0, csr, rs1 之偽指令
    csrc    mstatus, t1          # mstatus &= ~0x8

    # 原子交換 sscratch：讀舊值並寫入 sp
    csrrw   t2, sscratch, sp     # t2 = 舊 sscratch，sscratch = sp

    # 讀 sstatus（0x100，mstatus 之受限視窗）
    csrrs   t3, sstatus, x0      # 純讀寫法（等價 csrr）

    # 立即數版：關 S 級中斷使能 SIE（sstatus bit 1）
    csrci   sstatus, 0x2         # sstatus &= ~0x2（zimm=2）

    ret
