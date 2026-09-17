# kernels/：cu2rv 高階 kernel 語言範例（`.ku`）

`cu2rv`（`lib/cu2rv.js`＋`cli/cu2rv.js`）把類似 CUDA 的高階 DSL 編成
`riscvgpu`（`../_verilog/riscvgpu/`）可執行的組合語言（只輸出 `.s`；
再以 `cli/rvasm.js` 組譯成 `.hex`）。C-like 大括號、顯式 `int`、分號結尾。

## 範例

| 檔案 | 展示 |
|------|------|
| `vecadd.ku` | 向量加法 `C[i]=A[i]+B[i]`（語意同 `riscvgpu/prog.s`，可直接暫代跑自檢） |
| `saxpy.ku` | `param`＋真實函式呼叫＋grid-stride loop |
| `tiny.ku` | 單通道最小例（lanes=1，供 `rvemu` 自檢） |
| `relu.ku` | `if`／`else`＋區域變數＋自動記憶體配置 |
| `sum.ku` | reduction（部分和＋`barrier`＋lane0 加總） |

## 語言摘要

```
lanes 4;                 # 通道數 1..8
n 16;                    # 總元素數（grid-stride，不必被 lanes 整除）
mem x[16] = i + 1;       # 自動配置（0x100 起）；初始式只可用 i／常數／param
mem y[16] @ 0x140;       # @ 手動覆寫位址（字對齊、堆疊區外、不重疊）
param a: int = 2;        # 純量常數
func axpy(a: int, xi: int, yi: int) -> int {   # 真實 call/ret
  t: int = a * xi;
  return t + yi;
}
kernel saxpy {           # SPMD，每通道跑同一份
  for (i: int = tid; i < n; i += ntid) {
    z[i] = axpy(a, x[i], y[i]);
  }
  barrier();
}
expect {                 # lane0 逐項檢查，a0=錯誤數
  z[i] = 2 * (i + 1) + 10 * (i + 1);
}
```

* 敘述：`v: int = e;`、`v = e;`、`A[e] = e;`、`f(args);`、`print(e);`、
  `if`／`else`、`for`、`while`、`break`／`continue`、`return`、`barrier();`。
* 運算式：整數 `+ - * / % & | ^ << >>`、比較、索引 `A[e]`（任意運算式）、
  `tid`／`ntid`／`n`。`*` 的一邊須為常數（硬體無 M 擴充）；
  `/` `%` 只吃 2 的冪次常數；變數相乘、浮點數、`&&`／`||` 一律報錯。
* ABI：`a0–a3` 傳參、`a0` 回傳；每通道私有堆疊（`sp = 0x1000 - tid*128`）。
* `print(e)` 印十進位到 UART（IDE／rvemu 可見；硬體上 `ecall` 會停機，僅供除錯）。
* `expect` 索引為 `i` 即逐項檢查（`i` 遍歷該陣列），常數索引即單項檢查；
  運算式可用 `i`、常數、`param`、mem 讀取；`barrier` 不可出現在 `expect`。

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

`saxpy`／`relu`／`sum` 的陣列內容與 `riscvgpu_test.v` 寫死的期望不同，
跑完整自檢會報陣列不符；改用只看 `done`＋lane0 `a0` 的方式
（`a0=0` 即 kernel 內建 `expect` 全過）。

## 前端

`*.ku` 會由 `tools/build.js` 併入 `dist/kucorpus.js`，在 IDE 的 Kernel DSL
面板下拉選得到，按［編譯 DSL→組語］即送入組語區組譯執行（單通道語意）。
手寫 GPU 組語範例（`examples/gpu_tid.s`、`examples/gpu_vecadd1.s`）則進
`dist/corpus.js` 的組語下拉選單，瀏覽器可直接跑。
