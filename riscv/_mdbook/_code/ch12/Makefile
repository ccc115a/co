# ch12 Makefile：trap 入口＋中斷控制器模型
RISCV_GCC = riscv64-unknown-elf-gcc
MARCH = -march=rv64gc

all: asm test

asm: trapENTRY.o

trapENTRY.o: trapENTRY.s
	$(RISCV_GCC) $(MARCH) -c trapENTRY.s -o trapENTRY.o

test:
	python3 plic_model.py
	python3 clint_model.py

clean:
	rm -f *.o __pycache__ -r

.PHONY: all asm test clean
