// Bootstrap code
// Initialize SP = 256
@256
D=A
@SP
M=D
// Call Sys.init
@Sys.init$ret.0
D=A
@SP
A=M
M=D
@SP
M=M+1
@LCL
D=M
@SP
A=M
M=D
@SP
M=M+1
@ARG
D=M
@SP
A=M
M=D
@SP
M=M+1
@THIS
D=M
@SP
A=M
M=D
@SP
M=M+1
@THAT
D=M
@SP
A=M
M=D
@SP
M=M+1
@SP
D=M
@5
D=D-A
@0
D=D-A
@ARG
M=D
@SP
D=M
@LCL
M=D
@Sys.init
0;JMP
(Sys.init$ret.0)

// ========== File: gen/sum/vm/Main.vm ==========
// function Main.init 1
(Main.init)
@SP
A=M
M=0
@SP
M=M+1
// push constant 0
@0
D=A
@SP
A=M
M=D
@SP
M=M+1
// pop static 0
@SP
AM=M-1
D=M
@Main.0
M=D
// push constant 1
@1
D=A
@SP
A=M
M=D
@SP
M=M+1
// pop local 0
@0
D=A
@LCL
D=D+M
@R13
M=D
@SP
AM=M-1
D=M
@R13
A=M
M=D
// label WHILE_EXP0
(Main.init$WHILE_EXP0)
// push local 0
@0
D=A
@LCL
A=D+M
D=M
@SP
A=M
M=D
@SP
M=M+1
// push constant 11
@11
D=A
@SP
A=M
M=D
@SP
M=M+1
// lt
@SP
AM=M-1
D=M
A=A-1
D=M-D
@TRUE_0
D;JLT
@SP
A=M-1
M=0
@END_0
0;JMP
(TRUE_0)
@SP
A=M-1
M=-1
(END_0)
// not
@SP
A=M-1
M=!M
// if-goto WHILE_END1
@SP
AM=M-1
D=M
@Main.init$WHILE_END1
D;JNE
// push static 0
@Main.0
D=M
@SP
A=M
M=D
@SP
M=M+1
// push local 0
@0
D=A
@LCL
A=D+M
D=M
@SP
A=M
M=D
@SP
M=M+1
// add
@SP
AM=M-1
D=M
A=A-1
M=D+M
// pop static 0
@SP
AM=M-1
D=M
@Main.0
M=D
// push local 0
@0
D=A
@LCL
A=D+M
D=M
@SP
A=M
M=D
@SP
M=M+1
// push constant 1
@1
D=A
@SP
A=M
M=D
@SP
M=M+1
// add
@SP
AM=M-1
D=M
A=A-1
M=D+M
// pop local 0
@0
D=A
@LCL
D=D+M
@R13
M=D
@SP
AM=M-1
D=M
@R13
A=M
M=D
// goto WHILE_EXP0
@Main.init$WHILE_EXP0
0;JMP
// label WHILE_END1
(Main.init$WHILE_END1)
// function Main.loop 0
(Main.loop)
// label WHILE_EXP2
(Main.loop$WHILE_EXP2)
// push constant 0
@0
D=A
@SP
A=M
M=D
@SP
M=M+1
// not
@SP
A=M-1
M=!M
// not
@SP
A=M-1
M=!M
// if-goto WHILE_END3
@SP
AM=M-1
D=M
@Main.loop$WHILE_END3
D;JNE
// goto WHILE_EXP2
@Main.loop$WHILE_EXP2
0;JMP
// label WHILE_END3
(Main.loop$WHILE_END3)

// ========== File: gen/sum/vm/Sys.vm ==========
// function Sys.init 0
(Sys.init)
// call Main.init 0
@Main.init$ret.1
D=A
@SP
A=M
M=D
@SP
M=M+1
@LCL
D=M
@SP
A=M
M=D
@SP
M=M+1
@ARG
D=M
@SP
A=M
M=D
@SP
M=M+1
@THIS
D=M
@SP
A=M
M=D
@SP
M=M+1
@THAT
D=M
@SP
A=M
M=D
@SP
M=M+1
@SP
D=M
@5
D=D-A
@0
D=D-A
@ARG
M=D
@SP
D=M
@LCL
M=D
@Main.init
0;JMP
(Main.init$ret.1)
// pop temp 0
@SP
AM=M-1
D=M
@5
M=D
// call Main.loop 0
@Main.loop$ret.2
D=A
@SP
A=M
M=D
@SP
M=M+1
@LCL
D=M
@SP
A=M
M=D
@SP
M=M+1
@ARG
D=M
@SP
A=M
M=D
@SP
M=M+1
@THIS
D=M
@SP
A=M
M=D
@SP
M=M+1
@THAT
D=M
@SP
A=M
M=D
@SP
M=M+1
@SP
D=M
@5
D=D-A
@0
D=D-A
@ARG
M=D
@SP
D=M
@LCL
M=D
@Main.loop
0;JMP
(Main.loop$ret.2)
// pop temp 0
@SP
AM=M-1
D=M
@5
M=D
// push constant 0
@0
D=A
@SP
A=M
M=D
@SP
M=M+1
// return
@LCL
D=M
@R13
M=D
@5
A=D-A
D=M
@R14
M=D
@SP
AM=M-1
D=M
@ARG
A=M
M=D
@ARG
D=M+1
@SP
M=D
@R13
AM=M-1
D=M
@THAT
M=D
@R13
AM=M-1
D=M
@THIS
M=D
@R13
AM=M-1
D=M
@ARG
M=D
@R13
AM=M-1
D=M
@LCL
M=D
@R14
A=M
0;JMP
