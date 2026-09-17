# ch02: cross 組譯 .s、host 編譯 endian.c 並執行；預設 target 跑完所有驗證
CROSS := riscv64-unknown-elf-gcc
FLAGS := -march=rv64gc -mabi=lp64d

all: verify

verify: abi_demo.o stack_frame.o endian_run

abi_demo.o: abi_demo.s
	$(CROSS) $(FLAGS) -c abi_demo.s -o abi_demo.o

stack_frame.o: stack_frame.s
	$(CROSS) $(FLAGS) -c stack_frame.s -o stack_frame.o

endian_run: endian.c
	gcc -Wall -Wextra endian.c -o endian && ./endian

clean:
	rm -f *.o endian

.PHONY: all verify clean
