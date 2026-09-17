# pmp_config.s — PMP TOR 區域設定示範（對應 11.5）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -c pmp_config.s -o pmp_config.o
# 說明：區域 0 守韌體（TOR，只讀可執行＋鎖定），區域 1 守 UART（TOR，可讀寫）。
# pmpaddr 存 addr[33:2]（位址右移 2 位元）。

    .text
    .globl pmp_config
pmp_config:
    # 區域 0 下界：pmpaddr0 = 0x00000（TOR 下界）
    li      t0, 0x0
    csrw    pmpaddr0, t0

    # 區域 0 上界：pmpaddr1 = 0x10000 >> 2 = 0x4000（64KB 韌體區上界）
    li      t0, 0x4000
    csrw    pmpaddr1, t0         # 區域 1（index 1）之上界即區域 1 之 TOR 範圍頂

    # pmpcfg0 低 16 位元：區域 0 = OFF（未用），區域 1 = TOR+R+X+L
    # 0x8D = 0b10001101：L=1，A=01(TOR)，X=1，W=0，R=1
    li      t0, 0x8D00           # 區域 1 欄位在 pmpcfg0[15:8]
    csrw    pmpcfg0, t0          # 一次寫入（實務上應讀改寫，本例求簡潔）

    # UART 區：pmpaddr2 = 0x10000000 >> 2（TOR 上界，下界為 pmpaddr1）
    li      t0, 0x04000000
    csrw    pmpaddr2, t0

    # 區域 2 = TOR+R+W（0x09：A=TOR，R=1，W=1，不鎖定，留給 OS 調整）
    li      t0, 0x09908D00       # 區域 2 欄位在 pmpcfg0[23:16]，保留前兩區
    csrw    pmpcfg0, t0

    ret
