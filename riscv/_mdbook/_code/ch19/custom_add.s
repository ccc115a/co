# custom_add.s：自訂加法指令示範（對應書 19.1）
# 語義（由 Spike 外掛 / RTL 實現）：t0 = t1 + t2
# 編碼：custom-0（opcode 0x0b），funct3=0，funct7=0
# 字組：0000000_00111_00110_000_00101_0001011 = 0x0073028b
# 驗證：見 Makefile（make dump：組譯＋objdump 核對 opcode）
    .text
    .globl custom_add
custom_add:
    .insn r 0x0b, 0, 0, t0, t1, t2  # R 型：opcode,funct3,funct7,rd,rs1,rs2
    ret
