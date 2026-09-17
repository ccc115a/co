/* link.ld — 裸機連結腳本（對應 15.1）：基址 0x80000000 */
OUTPUT_ARCH(riscv)
ENTRY(_start)

BASE = 0x80000000;  /* QEMU virt DRAM 起始 */

SECTIONS
{
    . = BASE;
    .text : {
        *(.text.init)           /* _start 擺最前 */
        *(.text .text.*)
    }
    .rodata : {
        *(.rodata .rodata.*)
    }
    . = ALIGN(8);
    .data : {
        *(.data .data.*)
        *(.sdata .sdata.*)
    }
    .bss : {
        _bss_start = .;         /* crt0.s 清零區間 */
        *(.bss .bss.*)
        *(COMMON)
        *(.sbss .sbss.*)
        _bss_end = .;
    }
    /* 堆疊頂：基址 + 2MB，向下成長（virt 記憶體充足） */
    _stack_top = BASE + 0x200000;
}
