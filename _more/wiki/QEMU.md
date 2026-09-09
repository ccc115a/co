# QEMU

## 概述

QEMU (Quick Emulator) 是一個開源的完整系統模擬器，支援多種 CPU 架構和硬體平臺，可用於開發、測試和除錯作業系統及應用程式。

## 安裝

```bash
# macOS
brew install qemu

# Ubuntu/Debian
sudo apt install qemu

# 從原始碼編譯
git clone https://github.com/qemu/qemu.git
cd qemu
./configure
make -j$(nproc)
```

## 基本用法

### 執行虛擬機
```bash
# 基本用法
qemu-system-x86_64 -hda disk.img -m 2048

# 指定核心數和記憶體
qemu-system-x86_64 -hda disk.img -m 4G -smp 4

# 使用 ISO 開機
qemu-system-x86_64 -cdrom ubuntu.iso -m 4G

# 無頭模式（無圖形介面）
qemu-system-x86_64 -hda disk.img -m 4G -nographic
```

## RISC-V 模擬

### 安裝 RISC-V 工具鏈
```bash
# Ubuntu
sudo apt install riscv64-unknown-elf-gcc
sudo apt install riscv64-unknown-elf-gdb

# 或使用 xpack
wget https://github.com/xpack-dev-tools/riscv-none-elf-gcc-xpack/releases/...
```

### 執行 RISC-V 模擬器
```bash
# 模擬 Spike (RISC-V 參考模擬器)
spike pk hello

# 使用 QEMU 模擬 RISC-V
qemu-system-riscv64 -kernel vmlinux -m 256M -nographic
```

## 除錯功能

### GDB 遠端除錯
```bash
# 啟動 QEMU 並等待 GDB 連接
qemu-system-x86_64 \
    -kernel kernel.img \
    -append "console=ttyS0" \
    -S \              # 等待 GDB
    -gdb tcp::1234   # GDB 監聽埠

# 另一終端執行 GDB
riscv64-unknown-elf-gdb vmlinux
(gdb) target remote localhost:1234
(gdb) break start_kernel
(gdb) continue
```

### 指令追蹤
```bash
# 記錄執行的指令
qemu-system-riscv64 \
    -d exec \
    -D qemu.log \
    -kernel vmlinux
```

## 磁碟映像管理

### 建立磁碟映像
```bash
# 建立新映像檔
qemu-img create -f qcow2 disk.img 20G

# 建立預分配映像
qemu-img create -f raw disk.img 20G

# 轉換格式
qemu-img convert -f vmdk input.vmdk -O qcow2 output.qcow2
```

### 調整映像大小
```bash
qemu-img resize disk.img +10G
```

## 網路功能

### 使用 TAP 介面
```bash
# 建立橋接網路
sudo ip link add br0 type bridge
sudo ip link set eth0 master br0
sudo ip link set tap0 up

# 啟動 VM 使用橋接
qemu-system-x86_64 \
    -hda disk.img \
    -netdev tap,id=net0,ifname=tap0 \
    -device e1000,netdev=net0
```

### 使用 NAT
```bash
qemu-system-x86_64 \
    -hda disk.img \
    -netdev user,id=net0 \
    -device e1000,netdev=net0
```

## 快照功能

```bash
# 建立快照
qemu-img snapshot -c "before-upgrade" disk.img

# 列出快照
qemu-img snapshot -l disk.img

# 恢復快照
qemu-img snapshot -a "before-upgrade" disk.img

# 刪除快照
qemu-img snapshot -d "before-upgrade" disk.img
```

## 加速器

### KVM (Linux)
```bash
# 檢查 KVM 支援
ls /dev/kvm

# 使用 KVM 加速
qemu-system-x86_64 \
    -enable-kvm \
    -hda disk.img \
    -m 4G
```

### HVF (macOS)
```bash
# 使用 macOS Hypervisor.framework
qemu-system-x86_64 \
    -accel hvf \
    -hda disk.img \
    -m 4G
```

## 常見用法範例

### 測試作業系統
```bash
# 編譯 xv6
git clone https://github.com/mit-pdos/xv6-public.git
cd xv6-public
make qemu

# 或單獨執行
qemu-system-i386 -kernel kernel.img -append "root=/dev/sda" -hda fs.img
```

### 開發嵌入式系統
```bash
# ARM 模擬
qemu-system-arm \
    -M vexpress-a9 \
    -kernel vmlinuz \
    -dtb vexpress-v2p-ca9.dtb \
    -sd card.img \
    -append "root=/dev/mmcblk0" \
    -m 512M
```

## 進階功能

### 熱插拔
```bash
# 熱新增硬碟
qemu monitor
(qemu) drive_add 0 if=none,id=newdisk,file=new.img
(qemu) device_add virtio-blk,drive=newdisk
```

### 共享資料夾
```bash
# 9p filesystem virtio
qemu-system-x86_64 \
    -kernel vmlinux \
    -append "root=/dev/sda" \
    -fsdev local,id=hostshare,path=/host/path,security_model=mapped \
    -device virtio-9p-pci,fsdev=hostshare,mount_tag=hostshare
```

## 相關資源

- 相關工具：[Verilog](Verilog.md) - 硬體描述語言
- 相關概念：[指令集架構](指令集架構.md)

## Tags

#QEMU #模擬器 #虛擬化 #RISC-V
