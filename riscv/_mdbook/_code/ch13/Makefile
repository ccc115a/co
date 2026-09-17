# ch13 Makefile：Sv39 頁表模型＋satp 示範
CC = gcc
CFLAGS = -Wall -Wextra -O2
RISCV_GCC = riscv64-unknown-elf-gcc
MARCH = -march=rv64gc

all: pagetable asm test

pagetable: pagetable.c
	$(CC) $(CFLAGS) -o pagetable pagetable.c

asm: satp_demo.o

satp_demo.o: satp_demo.s
	$(RISCV_GCC) $(MARCH) -c satp_demo.s -o satp_demo.o

test: pagetable
	./pagetable

clean:
	rm -f pagetable *.o

.PHONY: all asm test clean
