# ch01 範例（對應書中 1.1–1.4：ISA 概觀、開放授權、第一支程式）

觀念章，輕量：先建立「ISA 比較 → 裸機程式骨架」的直覺，細節留待 ch02 起。

## 檔案說明

- `compare_isa.py`：輸出 x86/ARM/RISC-V 授權與程式碼密度對照表，內含 `assert` 自我檢查。
- `hello.s`：RV64 裸機 hello 骨架（`_start` → 設堆疊 → `putstr` → `halt`），`putstr` 留白給各平台補 UART/ecall。

## 執行指令

```sh
python3 compare_isa.py
riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c hello.s -o hello.o
```
