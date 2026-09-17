# riscvgpu — 4 通道 SPMD 共享記憶體 GPU（Verilog）

教學用極簡 GPGPU：4 個獨立 PC 的單週期 RV32I 純量通道，共享指令記憶體與 4KB 資料記憶體，以 `TID`／`NTID`／`BARRIER` 三條 custom-0 自訂指令協同。寫法沿用 `_verilog/5stage/` 的方法（小模組＋頂層組裝＋`prog.hex`＋自檢 testbench＋`test.sh`）。

## 架構

```text
                ┌──────── IMEM（256 字，共享）────────┐
                │                                     │
           lane0 systemów lane1  lane2  lane3（獨立 PC＋暫存器檔）
           RV32I RV32I  RV32I  RV32I（單週期，見 lane.v）
                │                                     │
                └──────── DMEM（4KB，共享，小端序）───┘
```

- SPMD（單程式多資料）：全部通道跑同一份 `prog.hex`，靠 `TID` 分工；各通道 PC 獨立，分歧（Divergence）天然支援，無需遮罩堆疊。
- `done`：全部通道 `ECALL` 後成立；已停通道在 barrier 計數中視為到達。
- 同週期多通道寫同一位址：編號大者勝出（模擬確定性語意；程式應避免）。

## 自訂指令（custom-0，opcode `0001011`，R 型，rs1=rs2=0）

| 助憶（未來工具鏈用） | funct3 | 語意 | 編碼範例 |
|---|---|---|---|
| `tid rd` | 000 | `rd = 通道號` | `tid t0` = `.word 0x0000028B` |
| `ntid rd` | 001 | `rd = 通道數` | `ntid t1` = `.word 0x0000130B` |
| `barrier` | 010 | 停住 PC，直到全部未停通道皆到達 | `.word 0x0000200B` |

目前組譯器（`_web_tools/cli/rvasm.js`）尚未收錄這三個助憶符，先用 `.word` 手工編碼（`prog.s` 內附註）；未來的 CUDA-like 工具鏈（C→組合語言）可直接輸出助憶符，屆時再為 rvasm 補助憶符表（唯讀擴充，不影響現有測試）。

## 檔案

| 檔案 | 職責 |
|---|---|
| `riscvgpu.v` | 頂層：`NUM_LANES` 參數（預設 4）、共享 IMEM/DMEM、`barrier_release`、`done` |
| `lane.v` | 單通道：RV32I 單週期資料路徑＋custom-0 解碼＋`is_barrier` 等待 |
| `alu.v`／`control.v`／`immgen.v`／`regfile.v` | 與 `single_cycle` 相同邏輯，原樣沿用 |
| `prog.s` | 向量加法測試：`C[i]=A[i]+B[i]`，i=0..7，4 通道各算 2 個 |
| `prog.hex` | `prog.s` 組譯結果（66 列），`$readmemh` 載入 |
| `riscvgpu_test.v` | 自檢：等 `done` 後核對 lane0 `a0=0`、A/B/C 陣列、4 通道皆停 |
| `test.sh` | 一鍵編譯執行，`grep ^PASS` 判定成敗 |

## 執行

```sh
# 組譯（cwd 在 _web_tools；rvemu 跑不了 custom-0，golden 為手算）
node cli/rvasm.js ../_verilog/riscvgpu/prog.s
# 自檢（cwd 在 _verilog/riscvgpu）
bash test.sh   # done at cycle 156, PASS: 向量加法全對（C=11,22,..,88，a0=0）
```

測試刻意讓各通道工作量不同（`tid` 圈空轉錯開到達），barrier 後 lane0 立刻抽查最慢通道寫的 `C[7]`：barrier 被強制放行時此測試必 FAIL（已驗證 `a0=1`），正常硬體 PASS——同步語意有實證，不是擺設。

## 給 CUDA-like 工具鏈的介面備忘

- 核心函式即 `prog.s` 的形狀：`tid` 取索引 → 分區計算 → `barrier` → 寫回 → `ecall`；host 端（lane0）負責驗證與結束碼。
- 記憶體配置：`0x100` A、`0x120` B、`0x140` C（8 字）；4KB 內自由劃分，工具鏈可自訂配置表。
- 後續工作：rvasm 加 `tid/ntid/barrier` 助憶符、rvemu 加單通道語意（多通道以腳本驅動）、C 前端做分區＋barrier 插入。
