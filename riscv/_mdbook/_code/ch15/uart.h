// uart.h — virt UART0 驅動介面（對應 15.2）
#ifndef UART_H
#define UART_H

void uart_putc(char c);              // 輸出單字元
void uart_puts(const char *s);       // 輸出字串
void uart_puthex(unsigned long v);   // 輸出 16 進位（0x 開頭）
void uart_putdec(unsigned long v);   // 輸出 10 進位

#endif
