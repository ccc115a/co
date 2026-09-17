# kernels/：cu2rv 自訂 kernel DSL 範例（`.ku`）

`cu2rv`（`lib/cu2rv.js`＋`cli/cu2rv.js`）把類似 CUDA 的自訂 DSL 編成
`riscvgpu`（`../_verilog/riscvgpu/`）可執行的組合語言（只輸出 `.s`；
再以 `cli/rvasm.js` 組譯成 `.hex`）。整數運算限定（硬體無 F/M 擴充）。

## 範例

| 檔案 | 內容 |
|------|------|
| `vecadd.ku` | 向量加法 `C[i]=A[i]+B[i]`（n=8；語意同 `riscvgpu/prog.s`，可直接暫代跑自檢） |
| `saxpy.ku` | `C[i]=a*A[i]+B[i]`（展示 `param`＋暫存變數＋多敘述 kernel） |
| `tiny.ku` | 單通道最小例（lanes=1，供 `rvemu` 單通道自檢） |

## DSL 摘要

```
lanes 4            # 通道數 1..8
n 8                # 總元素數（須被 lanes 整除）
mem A @ 0x100      # 陣列（字對齊、4KB 內、不重疊；長度預設 n，可 x LEN 指定）
param a = 2        # 純量常數
init:              # 各通道分區寫入（只可用 i／常數／param）
  A[i] = i + 1
kernel:            # 各通道分區計算（可用 mem 讀寫、暫存變數、barrier）
  t = a * A[i]
  C[i] = t + B[i]
```

運算式支援整數 `+ - *`、括號、前置負號；`*` 的一邊須為常數或 `param`
（硬體無 M 擴充，編譯器以 shift-add 展開；變數相乘、浮點數一律報錯）。
`i` 為 0-based 全域索引；編譯器自動插入指標分區（`base += tid*(E*4)`）、
init 後與 kernel 後的 `barrier`，以及 lane0 逐項重算的 verify
（`a0`=錯誤數，`a7=10` 結束）。

## 執行

```sh
# 1. 編成組語（只輸出 .s）
node cli/cu2rv.js kernels/vecadd.ku -o /tmp/vecadd.s
# 2. 組譯成 hex
node cli/rvasm.js /tmp/vecadd.s
# 3. 硬體自檢（暫代 prog.hex；勿覆蓋 repo 內的 prog.hex）
cp ../_verilog/riscvgpu/*.v /tmp/ && cp /tmp/vecadd.hex /tmp/prog.hex
#   在 /tmp：iverilog -o sim riscvgpu_test.v riscvgpu.v lane.v alu.v control.v immgen.v regfile.v && vvp sim
#   期望：PASS（vecadd 語意與 prog.hex 相同）
```

`saxpy.ku` 的陣列內容與 `riscvgpu_test.v` 寫死的期望不同，跑完整自檢會
報陣列不符；此時以 lane0 的 `a0` 為準（`a0=0` 即 kernel 自檢通過）。

## 前端

`*.ku` 會由 `tools/build.js` 併入 `dist/kucorpus.js`，在 IDE 的 Kernel DSL
面板下拉選得到，按［編譯 DSL→組語］即送入組語區組譯執行（單通道語意）。
手寫 GPU 組語範例（`examples/gpu_tid.s`、`examples/gpu_vecadd1.s`）則進
`dist/corpus.js` 的組語下拉選單，瀏覽器可直接跑。
