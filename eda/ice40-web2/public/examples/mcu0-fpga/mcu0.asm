// MCU0 program: SUM = 1 + 2 + ... + N. The server assembles this into mcu0.hex before every run.
// Every instruction and every WORD takes 2 bytes, and the operand is a byte address (12 bits).
SIZE 256                  // the block RAM holds 256 words; the rest of the image is zero

LOOP:   LD    I           // A = I
        CMP   N           // compare A with N
        JEQ   EXIT        // finished when I == N
        ADD   K1
        ST    I           // I = I + 1
        LD    SUM
        ADD   I
        ST    SUM         // SUM = SUM + I     (a store to SUM also drives the LEDs)
        JMP   LOOP
EXIT:   JMP   EXIT

ORG 0x14                  // SUM must live at byte address 0x14: the hardware copies stores there to the LEDs
SUM:    WORD  0
I:      WORD  0
K1:     WORD  1
N:      WORD  10          // change this and press Run: with fast reprogram only the program image is rebuilt
