// prog1：綜合測試──立即值、ALU、前遞（1/2 級）、SW/LW、load-use stall、
//        BEQ 不跳/跳、JAL 連結與 flush。
//
// 執行順序：
//   0 LI x1,3          x1=3
//   1 LI x2,5          x2=5
//   2 ADD x3,x1,x2     x3=8   （無 RAW）
//   3 SUB x4,x3,x1     x4=5   （1 級前遞，從 EX/MEM）
//   4 AND x5,x3,x4     x5=0   （1 級前遞）
//   5 SW  x0,x4,0      mem[0]=5
//   6 LW  x6,x0,0      x6=5   （store→load）
//   7 ADD x7,x6,x1     x7=8   （load-use：LW 在 EX 時 ADD 要用 x6 → 停一拍）
//   8 BEQ x3,x4,2      x3(8)==x4(5)? 否 → 落到 9
//   9 JAL x7,4         x7=link=10，跳到 9+1+4=14
//  10-13               被 flush 沖掉（LI x5,99 與 HALT 都不會執行）
//  14 HALT
//
// 預期：x1=3 x2=5 x3=8 x4=5 x5=0 x6=5 x7=10，mem[0]=5。
LI x1,3
LI x2,5
ADD x3,x1,x2
SUB x4,x3,x1
AND x5,x3,x4
SW x0,x4,0
LW x6,x0,0
ADD x7,x6,x1
BEQ x3,x4,2
JAL x7,4
LI x5,99
HALT
NOP
NOP
HALT
NOP