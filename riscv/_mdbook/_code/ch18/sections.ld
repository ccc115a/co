/* sections.ld：RV32 MCU 最小連結腳本（對應書 18.4）
   Flash 0x08000000（256K），RAM 0x20000000（64K）
   自訂 .mysection：以 KEEP 保留，起止符號 _smy/_emy */
ENTRY(_start)
MEMORY {
  FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 256K
  RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 64K
}
SECTIONS {
  .text : {
    KEEP(*(.vectors))          /* 中斷向量表，不可被 GC */
    *(.text*) *(.rodata*)
    . = ALIGN(4);
    _etext = .;
  } > FLASH

  .mysection : {               /* 自訂節：放魔數表等關鍵資料 */
    . = ALIGN(4);
    _smy = .;
    KEEP(*(.mysection))
    *(.mysection*)
    . = ALIGN(4);
    _emy = .;
  } > FLASH

  .data : {  /* LMA 由 AT>FLASH 自動接在 .mysection 之後 */
    . = ALIGN(4);
    _sdata = .;
    *(.data*) *(.sdata*)
    . = ALIGN(4);
    _edata = .;
  } > RAM AT > FLASH

  .bss (NOLOAD) : {
    . = ALIGN(4);
    _sbss = .;
    *(.bss*) *(.sbss*) *(COMMON)
    . = ALIGN(4);
    _ebss = .;
  } > RAM

  PROVIDE(_stack_top = ORIGIN(RAM) + LENGTH(RAM));
  PROVIDE(_end = _ebss);
}
