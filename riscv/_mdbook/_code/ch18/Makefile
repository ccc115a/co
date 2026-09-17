# ch18 Makefile：hello.c 交叉編譯（對應書 18.1）
# 用法：make          # 編出 rv32 + rv64 兩個 ELF
#       make check    # 以 file / readelf 驗證為 RISC-V
#       make clean    # 清除產物
CC = riscv64-unknown-elf-gcc
OBJDUMP = riscv64-unknown-elf-objdump

all: hello32.elf hello64.elf

# RV32 MCU 組合（書 18.2 黃金組合一）
hello32.elf: hello.c
	$(CC) -march=rv32imac -mabi=ilp32 -o $@ $<

# RV64 應用組合（書 18.2 黃金組合二）
hello64.elf: hello.c
	$(CC) -march=rv64gc -mabi=lp64d -o $@ $<

check: all
	file hello32.elf hello64.elf
	$(CC) -march=rv32imac -mabi=ilp32 -E -dM - < /dev/null | grep -i riscv > /dev/null && echo "rv32 toolchain OK"
	riscv64-unknown-elf-readelf -h hello64.elf | grep -E 'Class|Machine|Entry'

clean:
	rm -f hello32.elf hello64.elf
