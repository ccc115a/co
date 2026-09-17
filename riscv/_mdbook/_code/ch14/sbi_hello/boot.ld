/* boot.ld — 載入位址 0x80200000（QEMU virt＋OpenSBI 預設 next_addr） */
OUTPUT_ARCH(riscv)
ENTRY(_start)

BASE = 0x80200000;

SECTIONS {
    . = BASE;
    .text : {
        *(.text*)
    }
    .rodata : {
        *(.rodata*)
    }
    .data : {
        *(.data*)
    }
    .bss : {
        *(.bss*)
        *(COMMON)
    }
}
