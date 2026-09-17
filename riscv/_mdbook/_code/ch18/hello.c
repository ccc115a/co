#include <stdio.h>

// 最小編譯驗證程式（對應書 18.1：交叉編譯 Hello World）
// Host 編譯：gcc hello.c -o hello-host ；交叉編譯見 Makefile
int main(void) {
  printf("hello riscv\n");
  return 0;
}
