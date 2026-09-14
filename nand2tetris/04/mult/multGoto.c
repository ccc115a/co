#include <stdio.h>

int main() {
    int R0 = 3; // 測試程式會設，自己不要去設定
    int R1 = 5; // 測試程式會設，自己不要去設定
    int R2 = 0; // @2 M=0,
    
//    while (R0 > 0) {
loop: // (loop)
    if (R0 <= 0) goto exit1; // @0 D=M @exit1 D;JLE
    R2 = R2 + R1; // @1 D=M @2 M=M+D  
    R0 = R0 - 1;  // @0 M=M-1
    printf("R0=%d R1=%d R2=%d\n", R0, R1, R2);
    goto loop;    // @loop 0;JMP
exit1:
//    }
    
    printf("R2=%d\n", R2);
}
