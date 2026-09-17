# ch19 自訂擴充指令（對應書 19.1–19.3）
# custom_add.s：以 .insn 示範 custom-0 自訂指令（組譯＋objdump 驗證）
# decode_custom.py：custom opcode 空間解析（host 執行＋assert 自查）
# spike_ext_skel.cc：Spike 擴充骨架（三個銜接函式，註解為主）
# spike_notes.md：Spike / QEMU 擴充步驟與指令
# 用法：make / make dump / make decode / make check
CC = riscv64-unknown-elf-gcc
OBJDUMP = riscv64-unknown-elf-objdump
CFLAGS = -march=rv32imac -mabi=ilp32

all: custom_add.o

custom_add.o: custom_add.s
	$(CC) $(CFLAGS) -c -o $@ $<

# 反組譯並核對 opcode（低 7 位須為 0x0b = custom-0）
dump: custom_add.o
	$(OBJDUMP) -d $<
	$(OBJDUMP) -d $< | grep -q '0073028b' && echo "opcode OK：custom-0 (0x0b)"

decode:
	python3 decode_custom.py

check: dump decode

clean:
	rm -f custom_add.o
