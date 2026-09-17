# ch03: cross 組譯全部 .s 並執行 decode.py；預設 target 跑完所有驗證
CROSS := riscv64-unknown-elf-gcc
FLAGS := -march=rv64gc -mabi=lp64d

all: verify

verify: alu_demo.o loadstore.o branch_jump.o ecall_hello.o decode_run

alu_demo.o: alu_demo.s
	$(CROSS) $(FLAGS) -c alu_demo.s -o alu_demo.o

loadstore.o: loadstore.s
	$(CROSS) $(FLAGS) -c loadstore.s -o loadstore.o

branch_jump.o: branch_jump.s
	$(CROSS) $(FLAGS) -c branch_jump.s -o branch_jump.o

ecall_hello.o: ecall_hello.s
	$(CROSS) $(FLAGS) -c ecall_hello.s -o ecall_hello.o

decode_run: decode.py
	python3 decode.py

clean:
	rm -f *.o

.PHONY: all verify decode_run clean
