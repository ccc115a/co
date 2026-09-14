// prog2：向後分支迴圈測試（累加 3+2+1），驗證 BEQ 有條件、JAL 向後跳、
//        rd=x0 + regW=1 時 x0 仍不會被寫入。
//
//   0 LI x1,3
//   1 LI x2,0
//   2 LI x3,1          <- 常數 1
//   3 ADD x2,x2,x1     <- 迴圈頂端：acc += x1
//   4 SUB x1,x1,x3
//   5 BEQ x1,x0,2       x1==0 → 5+1+2=8(HALT)；否則落到 6
//   6 JAL x0,-4         向後跳 6+1-4=3 → 迴圈
//   7 (未用)
//   8 HALT
//
// 疊代：x1 3,2,1 → acc=3,5,6；x1 到 0 時 BEQ 跳 HALT。
// 預期：x1=0 x2=6，mem 不動。
LI x1,3
LI x2,0
LI x3,1
ADD x2,x2,x1
SUB x1,x1,x3
BEQ x1,x0,2
JAL x0,-4
NOP
HALT
NOP