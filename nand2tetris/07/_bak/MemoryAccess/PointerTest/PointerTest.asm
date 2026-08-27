// push constant 3030
@3030
D=A
@SP
A=M
M=D
@SP
M=M+1
// pop pointer 0
@SP
AM=M-1
D=M
@THIS
M=D
// push constant 3040
@3040
D=A
@SP
A=M
M=D
@SP
M=M+1
// pop pointer 1
@SP
AM=M-1
D=M
@THAT
M=D
// push constant 32
@32
D=A
@SP
A=M
M=D
@SP
M=M+1
// pop this 2
@2
D=A
@THIS
D=D+M
@R13
M=D
@SP
AM=M-1
D=M
@R13
A=M
M=D
// push constant 46
@46
D=A
@SP
A=M
M=D
@SP
M=M+1
// pop that 6
@6
D=A
@THAT
D=D+M
@R13
M=D
@SP
AM=M-1
D=M
@R13
A=M
M=D
// push pointer 0
@THIS
D=M
@SP
A=M
M=D
@SP
M=M+1
// push pointer 1
@THAT
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
// push this 2
@2
D=A
@THIS
A=D+M
D=M
@SP
A=M
M=D
@SP
M=M+1
// sub
@SP
AM=M-1
D=M
A=A-1
M=M-D
// push that 6
@6
D=A
@THAT
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
