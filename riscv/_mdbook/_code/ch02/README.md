# ch02 範例（對應書中 2.1–2.4：暫存器、ABI、堆疊框、位元組序）

## 檔案說明

- `abi_demo.s`：`caller` 用 a0–a7 傳 8 參數，展示 caller-saved（t0 可被破壞）與 callee-saved（s0/ra 進出棧保存）。
- `stack_frame.s`：`leaf_add`（葉函式免開框）對照 `nested_call`（存 ra/s0、建 frame 再呼叫）。
- `endian.c`：host 執行，印出位元組序並以 `assert` 驗證 little-endian。
- `Makefile`：cross 組譯 `.s`、host 編譯 `endian.c` 並執行；預設 target 跑完所有驗證。

## 執行指令

```sh
make   # 組譯 abi_demo.s、stack_frame.s；編譯並執行 endian
```
