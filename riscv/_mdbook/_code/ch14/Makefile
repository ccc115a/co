# ch14 Makefile：SBI Hello（QEMU virt＋OpenSBI）與 Device Tree
RISCV_GCC = riscv64-unknown-elf-gcc
MARCH = -march=rv64gc -mabi=lp64d -mcmodel=medany
ELF = sbi_hello/hello.elf

all: $(ELF)

$(ELF): sbi_hello/start.s sbi_hello/sbi_puts.c sbi_hello/boot.ld
	$(RISCV_GCC) $(MARCH) -nostdlib -T sbi_hello/boot.ld \
		-o $(ELF) sbi_hello/start.s sbi_hello/sbi_puts.c

# 在 QEMU virt 跑出 Hello（guest 印完即 wfi 休眠，故 5 秒後砍掉；此處不用 GNU
# timeout，改用 shell 背景執行＋sleep/kill，macOS/Linux 通用）
qemu: $(ELF)
	qemu-system-riscv64 -machine virt -bios default -kernel $(ELF) -nographic & pid=$$!; sleep 5; kill $$pid 2>/dev/null; wait $$pid 2>/dev/null; true

# Device Tree 編譯（需 dtc；若無則略過）
dtb: virt.dtb

virt.dtb: virt.dts
	dtc -I dts -O dtb -o virt.dtb virt.dts

clean:
	rm -f $(ELF) virt.dtb

.PHONY: all qemu dtb clean
