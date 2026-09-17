# ch11 Makefile：CSR 與 PMP 示範
RISCV_GCC = riscv64-unknown-elf-gcc
MARCH = -march=rv64gc

all: asm test

asm: csr_demo.o pmp_config.o

csr_demo.o: csr_demo.s
	$(RISCV_GCC) $(MARCH) -c csr_demo.s -o csr_demo.o

pmp_config.o: pmp_config.s
	$(RISCV_GCC) $(MARCH) -c pmp_config.s -o pmp_config.o

test:
	python3 csr_policy.py

clean:
	rm -f *.o __pycache__ -r

.PHONY: all asm test clean
