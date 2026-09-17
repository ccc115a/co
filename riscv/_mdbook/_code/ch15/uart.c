// uart.c — virt UART0（0x10000000）MMIO 輪詢輸出（對應 15.2）
// 16550 相容：THR(+0x00) 發送，LSR(+0x05) bit5=THRE 表示可寫。
#include "uart.h"

#define UART0_BASE 0x10000000UL
#define UART_THR   (*(volatile unsigned char *)(UART0_BASE + 0x00))
#define UART_LSR   (*(volatile unsigned char *)(UART0_BASE + 0x05))
#define UART_LSR_THRE 0x20  // 發送保持暫存器空

void uart_putc(char c) {
    if (c == '\n')
        uart_putc('\r');                          // 終端換行補 CR
    while ((UART_LSR & UART_LSR_THRE) == 0) { }   // 輪詢等待可發送
    UART_THR = (unsigned char)c;
}

void uart_puts(const char *s) {
    while (*s)
        uart_putc(*s++);
}

void uart_puthex(unsigned long v) {
    static const char dig[] = "0123456789abcdef";
    char buf[16];
    int i = 0;
    uart_puts("0x");
    if (v == 0) { uart_putc('0'); return; }
    while (v > 0 && i < 16) { buf[i++] = dig[v & 0xf]; v >>= 4; }
    while (i-- > 0) uart_putc(buf[i]);
}

void uart_putdec(unsigned long v) {
    char buf[20];
    int i = 0;
    if (v == 0) { uart_putc('0'); return; }
    while (v > 0 && i < 20) { buf[i++] = (char)('0' + v % 10); v /= 10; }
    while (i-- > 0) uart_putc(buf[i]);
}
