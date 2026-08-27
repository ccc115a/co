// 這是 Gemini 寫的快速乘法，經測試，結果是對的！
// 對話網址 -- https://gemini.google.com/share/e2ba07b455aa
//    在上文的最後面

// Mult.asm (Revised - Using legal M=M+D for M=M*2)
// Computes R2 = R1 * R0 using the Shift-and-Add algorithm.
// Temp variables:
// RAM[3]: MAND (Multiplicand, R1 copy, shifted left)
// RAM[4]: MASK (Bit mask, shifted left)

// --- Initialization ---
@R2
M=0     // R2 = 0 (Initialize result)

@R1
D=M     // D = R1
@R3     // A = MAND (RAM[3])
M=D     // MAND = R1 (The value to be conditionally added)

@1
D=A     // D = 1
@R4     // A = MASK (RAM[4])
M=D     // MASK = 1 (Initialize bit mask: 00...0001)

// --- LOOP ---
(LOOP)
    @R4
    D=M     // D = MASK
    @END
    D;JEQ   // If MASK is 0 (all 16 bits checked), goto END

    // 1. Check current bit of R0
    @R0
    D=M     // D = R0 (Multiplier)
    @R4
    A=M     // A = MASK
    D=D&A   // D = R0 AND MASK

    @SHIFT_STEP
    D;JEQ   // If bit is 0 (D=0), skip addition and goto SHIFT_STEP

    // 2. Add (if bit is 1)
(ADD_PARTIAL)
    @R3
    D=M     // D = MAND (current shifted R1 value)
    @R2
    M=D+M   // R2 = R2 + D (R2 = R2 + MAND)

// 3. Shift and Prepare for Next Iteration
(SHIFT_STEP)
    // Shift MAND (R1 copy) left (MAND = MAND * 2)
    @R3
    D=M     // D = MAND
    M=D+M   // M[3] = D + M[3] (MAND = MAND + MAND = MAND * 2)

    // Shift MASK left (MASK = MASK * 2)
    @R4
    D=M     // D = MASK
    M=D+M   // M[4] = D + M[4] (MASK = MASK + MASK = MASK * 2)

    @LOOP
    0;JMP   // Unconditional jump to LOOP

// --- END ---
(END)
    @END
    0;JMP   // Infinite loop to halt the program