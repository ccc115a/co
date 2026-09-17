// 位元組序檢查（對應 2.1-2.4）
// 編譯執行：gcc endian.c -o endian && ./endian
#include <assert.h>
#include <stdint.h>
#include <stdio.h>

int main(void) {
    uint32_t x = 0x01020304;              // 測試樣式
    unsigned char *p = (unsigned char *)&x;
    int little = (p[0] == 0x04);          // 最低位址放最低位元組即 LE
    printf("byte order: %s\n", little ? "little-endian" : "big-endian");
    printf("bytes: %02x %02x %02x %02x\n", p[0], p[1], p[2], p[3]);
    assert(little && "本書假設 little-endian（RISC-V 預設）");
    assert(sizeof(uint32_t) == 4);
    printf("SELF-CHECK PASS\n");
    return 0;
}
