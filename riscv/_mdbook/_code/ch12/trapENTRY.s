# trapENTRY.s — stvec 設定＋trap 入口骨架（對應 12.4）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -c trapENTRY.s -o trapENTRY.o
# 說明：Direct 模式單一入口；save/restore 骨架＋跳轉 C handler（trap_dispatch）。

    .text
    .align 2
    .globl setup_stvec
    .globl trap_entry

# void setup_stvec(void)：stvec = trap_entry（Direct 模式，MODE=0）
setup_stvec:
    la      t0, trap_entry
    csrw    stvec, t0            # MODE 位元保持 0（Direct）
    ret

# trap 入口：sscratch 預存 trapframe 基址（進入前由 OS 設好）
trap_entry:
    csrrw   t0, sscratch, t0     # 借 t0：t0=舊值，sscratch=t0 舊值暫存
    sd      t0, 0*8(sp)          # 示意：存入 trapframe（實務以 sscratch 換棧後之指標為準）
    csrr    t0, sscratch         # 取回借存值（骨架示意，完整版應換棧＋存 x1-x31）
    # 讀 trap 原因三元組，交給 C 函式分派
    csrr    a0, scause
    csrr    a1, sepc
    csrr    a2, stval
    call    trap_dispatch        # C 函式：依 scause 分派（ecall 缺頁 中斷）
    # 恢復現場（與保存對稱，此處僅示意 t0）
    ld      t0, 0*8(sp)
    sret                        # PC<-sepc，SIE<-SPIE，權限<-SPP

# 預設弱符號 handler：連結時可被 C 檔覆寫
    .weak trap_dispatch
trap_dispatch:
    ret
