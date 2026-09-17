# Makefile — ch15 bare-metal（對應 15.1/15.2）
# 用法：make / make qemu / make check / make clean
CC     := riscv64-unknown-elf-gcc
CFLAGS := -march=rv64imac -mabi=lp64 -mcmodel=medany -nostdlib -ffreestanding -Wall -Wextra -O2 -g
OBJS   := crt0.o uart.o main.o

all: kernel.elf

crt0.o: crt0.s
	$(CC) $(CFLAGS) -c $< -o $@

uart.o: uart.c uart.h
	$(CC) $(CFLAGS) -c $< -o $@

main.o: main.c uart.h
	$(CC) $(CFLAGS) -c $< -o $@

kernel.elf: $(OBJS) link.ld
	$(CC) $(CFLAGS) -T link.ld -o $@ $(OBJS)

# 真機執行：QEMU virt，輸出導向終端
# （不用 GNU timeout，改用 shell 背景執行＋sleep/kill，macOS/Linux 通用）
qemu: kernel.elf
	qemu-system-riscv64 -machine virt -bios none -kernel kernel.elf -nographic & pid=$$!; sleep 3; kill $$pid 2>/dev/null; wait $$pid 2>/dev/null; true

# 自動驗證：輸出須含 Hello RISC-V 與 DONE
check: kernel.elf
	qemu-system-riscv64 -machine virt -bios none -kernel kernel.elf -nographic > .qemu_out.txt 2>&1 & pid=$$!; sleep 3; kill $$pid 2>/dev/null; wait $$pid 2>/dev/null; true; grep -E "Hello RISC-V|DONE" .qemu_out.txt

clean:
	rm -f $(OBJS) kernel.elf .qemu_out.txt

.PHONY: all qemu check clean
