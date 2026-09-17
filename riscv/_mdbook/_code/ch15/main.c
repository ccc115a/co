// main.c — 裸機主程式：印 Hello RISC-V + 數字（對應 15.1/15.2）
#include "uart.h"

int main(void) {
    uart_puts("Hello RISC-V!\n");
    for (unsigned long i = 0; i < 5; i++) {
        uart_puts("count = ");
        uart_putdec(i);
        uart_puts(" (hex ");
        uart_puthex(i);
        uart_puts(")\n");
    }
    uart_puts("DONE\n");
    return 0;
}
