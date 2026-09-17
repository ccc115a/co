# satp_demo.s — satp 組成與 sfence.vma 示範（對應 13.3）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -c satp_demo.s -o satp_demo.o
# 說明：satp = MODE(8=Sv39)<<60 | PPN；切表後必 sfence.vma。

    .text
    .globl satp_demo

# 參數：a0 = 根頁表實體位址（4K 對齊）
satp_demo:
    srli    t0, a0, 12           # t0 = PPN
    li      t1, 8
    slli    t1, t1, 60           # t1 = MODE(Sv39) << 60（ASID=0 省略）
    or      t0, t0, t1           # t0 = satp 值
    csrw    satp, t0             # 切表（M-Mode 不受影響；TVM=1 時 trap，見 13.3）
    sfence.vma zero, zero        # 全沖 TLB，確保新表生效
    ret

    .globl satp_fence_filtered
satp_fence_filtered:
    sfence.vma a0                # 只沖指定 VA（rs2=x0，保留其餘）
    sfence.vma a0, a1            # 只沖 VA=a0 且 ASID=a1
    ret

    .globl satp_bare
satp_bare:
    csrwi   satp, 0              # MODE=Bare：關分頁（VA=PA）
    sfence.vma zero, zero
    ret
