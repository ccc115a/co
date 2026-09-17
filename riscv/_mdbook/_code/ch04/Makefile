# ch04: 各檔以對應 -march 組譯；host 編譯執行 spinlock_host；預設 target 跑完所有驗證
CROSS := riscv64-unknown-elf-gcc
ABI := -mabi=lp64d
GC := -march=rv64gc
GC_ZBB := -march=rv64gc_zbb
GC_V := -march=rv64gcv

all: verify

verify: mul_div.o atomic_spinlock.o float_demo.o compressed_demo.o \
        bitmanip.o vector_add.o spinlock_run

mul_div.o: mul_div.s
	$(CROSS) $(GC) $(ABI) -c mul_div.s -o mul_div.o

atomic_spinlock.o: atomic_spinlock.s
	$(CROSS) $(GC) $(ABI) -c atomic_spinlock.s -o atomic_spinlock.o

float_demo.o: float_demo.s
	$(CROSS) $(GC) $(ABI) -c float_demo.s -o float_demo.o

compressed_demo.o: compressed_demo.s
	$(CROSS) $(GC) $(ABI) -c compressed_demo.s -o compressed_demo.o

bitmanip.o: bitmanip.s
	$(CROSS) $(GC_ZBB) $(ABI) -c bitmanip.s -o bitmanip.o

vector_add.o: vector_add.s
	$(CROSS) $(GC_V) $(ABI) -c vector_add.s -o vector_add.o

spinlock_run: spinlock_host.c
	gcc -Wall -Wextra spinlock_host.c -pthread -o spinlock_host && ./spinlock_host

clean:
	rm -f *.o spinlock_host

.PHONY: all verify spinlock_run clean
