// sbi_puts.c — 經 SBI legacy console_putchar 印字串（對應 14.2）
// 環境：QEMU virt＋OpenSBI，S-Mode，-nostdlib 無 libc。

struct sbiret {
    long error;
    long value;
};

// SBI 呼叫：a7=EID，a6=FID，a0-a5=參數；回 a0=error，a1=value
static struct sbiret sbi_ecall(long eid, long fid, long a0, long a1,
                               long a2, long a3, long a4, long a5) {
    register long r_a0 asm("a0") = a0;
    register long r_a1 asm("a1") = a1;
    register long r_a2 asm("a2") = a2;
    register long r_a3 asm("a3") = a3;
    register long r_a4 asm("a4") = a4;
    register long r_a5 asm("a5") = a5;
    register long r_a6 asm("a6") = fid;
    register long r_a7 asm("a7") = eid;
    asm volatile("ecall" // S 級 ecall（異常碼 9）進 OpenSBI
                 : "+r"(r_a0), "+r"(r_a1)
                 : "r"(r_a2), "r"(r_a3), "r"(r_a4), "r"(r_a5),
                   "r"(r_a6), "r"(r_a7)
                 : "memory");
    return (struct sbiret){r_a0, r_a1};
}

// Legacy Console Putchar：EID=0x01，FID=0，字元放 a0
static void sbi_putchar(char c) {
    sbi_ecall(0x01, 0, (long)c, 0, 0, 0, 0, 0);
}

static void sbi_puts(const char *s) {
    while (*s)
        sbi_putchar(*s++);
}

// _start 呼叫的進入點（C 側主函式）
void sbi_main(void) {
    sbi_puts("Hello, RISC-V SBI!\n");
}
