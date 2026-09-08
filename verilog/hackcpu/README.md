# 

```
$ iverilog -o gate_test gate_test.v

$ vvp gate_test
   0ns b=0 a=0 aNot=1 abNand=1 abAnd=0 abOr=0 abXor=0
  50ns b=0 a=1 aNot=0 abNand=1 abAnd=0 abOr=1 abXor=1
 100ns b=1 a=0 aNot=1 abNand=1 abAnd=0 abOr=1 abXor=1
 150ns b=1 a=1 aNot=0 abNand=0 abAnd=1 abOr=1 abXor=0
 200ns b=0 a=0 aNot=1 abNand=1 abAnd=0 abOr=0 abXor=0
 250ns b=0 a=1 aNot=0 abNand=1 abAnd=0 abOr=1 abXor=1
 300ns b=1 a=0 aNot=1 abNand=1 abAnd=0 abOr=1 abXor=1
 350ns b=1 a=1 aNot=0 abNand=0 abAnd=1 abOr=1 abXor=0
 400ns b=0 a=0 aNot=1 abNand=1 abAnd=0 abOr=0 abXor=0
 450ns b=0 a=1 aNot=0 abNand=1 abAnd=0 abOr=1 abXor=1
gate_test.v:28: $finish called at 500 (1s)
 500ns b=1 a=0 aNot=1 abNand=1 abAnd=0 abOr=1 abXor=1
```
