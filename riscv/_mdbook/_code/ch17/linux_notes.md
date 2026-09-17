# Linux RISC-V 除錯筆記（對應 17.1–17.4）

## 一、arch/riscv 導覽

```bash
ls arch/riscv/{kernel,mm,lib}          # 進入點、缺頁/頁表、字串拷貝
head arch/riscv/Makefile               # march/mabi 預設旗標
grep -rn riscv_sys /arch/riscv/ | head # syscall 入口線索
```

## 二、建 Image

```bash
make ARCH=riscv CROSS_COMPILE=riscv64-unknown-elf- defconfig
make ARCH=riscv CROSS_COMPILE=riscv64-unknown-elf- -j"$(nproc)" Image
ls -lh arch/riscv/boot/Image
```

## 三、QEMU 開機

```bash
qemu-system-riscv64 -machine virt -smp 2 -m 2G -kernel arch/riscv/boot/Image \
  -append "root=/dev/vda ro console=ttyS0" -drive file=rootfs.ext2,format=raw,id=hd0 \
  -device virtio-blk-device,drive=hd0 -nographic
```

## 四、GDB 除錯

```bash
# 終端 A：QEMU 凍結等 GDB
qemu-system-riscv64 -machine virt -kernel arch/riscv/boot/Image -nographic -s -S
# 終端 B：連線除錯（腳本見 gdb_cmds.txt）
riscv64-unknown-elf-gdb vmlinux -x gdb_cmds.txt
```
