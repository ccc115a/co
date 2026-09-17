# 從高階語言到 CUDA-like 組合語言：cu2rv 轉換範例

本文件用兩個可重現的範例，說明 `cu2rv` 如何把高階 kernel DSL（`.ku`）
轉成 riscvgpu 可執行的組合語言（`.s`）。所有組語片段皆為編譯器實際輸出，
未經手工改寫。

## 完整鏈路

```sh
cd riscv/_web_tools
node cli/cu2rv.js kernels/vecadd.ku -o /tmp/vecadd.s  # 高階 DSL → 組語
node cli/rvasm.js /tmp/vecadd.s                       # 組語 → /tmp/vecadd.hex
node cli/rvdis.js /tmp/vecadd.hex | head -3           # 反組譯確認
```

`.hex` 載入 `../_verilog/riscvgpu/prog.hex` 後跑 `iverilog` 自檢，
實測輸出 `PASS: 向量加法全對（C=11,22,..,88，a0=0）`。

## 範例一：vecadd（向量加法，最小完整程式）

### 高階碼（`kernels/vecadd.ku`）

```c
lanes 4;
n 8;
mem A[8] @ 0x100 = i + 1;
mem B[8] @ 0x120 = 10 * (i + 1);
mem C[8] @ 0x140;
kernel vecadd {
  for (i: int = tid; i < n; i += ntid) {
    C[i] = A[i] + B[i];
  }
  barrier();
}
expect {
  C[i] = A[i] + B[i];
}
```

### 產生的組語（節錄；全文 86 列，用上節命令自行產生後對照）

#### 1. 啟動：通道號、堆疊、基址

```asm
        tid     t0              # t0 = 通道號（custom-0，funct3=000）
        ntid    t1              # t1 = 通道數（custom-0，funct3=001）
        li      sp, 0x1000
        slli    t6, t0, 7       # tid * 128：每通道私有堆疊
        sub     sp, sp, t6
        li      t2, 0x100       # A 基址
        li      t3, 0x120       # B 基址
        li      t4, 0x140       # C 基址
```

解說：`tid`／`ntid` 是 riscvgpu 的 custom-0 自訂指令（opcode `0x0b`），
對應 CUDA 的 `threadIdx.x`／`blockDim.x`。堆疊放在 DMEM 頂部往下，
每通道 128 位元組，函式呼叫與 spill 共用（見範例二）。

#### 2. init：grid-stride 初始化（以 `B[i] = 10 * (i + 1)` 為例）

```asm
        # --- init B[0..8) ---
        addi    s2, t0, 0       # 游標 = tid（各通道從自己的元素開始）
INIT2:
        sltiu   a7, s2, 8       # 游標 < 8？
        beq     a7, x0, INITEND3
        ...
        slli    t6, a7, 1       # (i+1) * 2
        slli    a6, a7, 3       # (i+1) * 8
        add     t6, t6, a6      # 相加 = (i+1) * 10
        ...
        slli    t6, a6, 2       # 元素索引 * 4（字組定址）
        add     t6, t3, t6      # 基址 + 位元組偏移
        sw      a7, 0(t6)
        add     s2, s2, t1      # 游標 += ntid（grid-stride）
        jal     x0, INIT2
INITEND3:
        barrier
```

解說有三個重點：

- `10 * (i + 1)` **沒有**編成 `mul`——riscvgpu 的 ALU 是純 RV32I，
  沒有 M 擴充。編譯器把常數乘法展開成 shift-add：`×10 = ×8 + ×2`。
- 陣列定址永遠是 `slli idx, 2`（`×4`）再加基址，因為一個 `int` 四個位元組。
- 迴圈是 grid-stride：通道 `k` 處理 `k, k+ntid, k+2*ntid, …`，
  `n` 不必被通道數整除。`barrier` 確保全部通道寫完 A/B 才進入 kernel。

#### 3. kernel：`for` 迴圈本體

```asm
        # --- kernel vecadd ---
        addi    a7, t0, 0
        addi    s3, a7, 0       # i = tid（迴圈變數住在 s3）
FOR4:
        li      a7, 8
        slt     a6, s3, a7      # i < n？（slt 結果 0/1）
        beq     a6, x0, FEND6
        ...
        lw      a6, 0(a7)       # A[i]
        ...
        lw      t6, 0(a7)       # B[i]
        add     a6, a6, t6      # A[i] + B[i]
        ...
        sw      a6, 0(t6)       # C[i] = …
FSTEP5:
        addi    a7, t1, 0
        add     s3, s3, a7      # i += ntid
        jal     x0, FOR4
FEND6:
        barrier
        barrier                 # 一個來自使用者，一個是 kernel 結尾自動插入
```

解說：`for` 拆成初值／條件（`slt`＋`beq`）／本體／步進（`FSTEP`）四段；
`C[i] = A[i] + B[i]` 拆成兩次 `lw`、一次 `add`、一次 `sw`——
純量通道一次只做一件事，這正是 SIMT「單程式」的樣子。

#### 4. expect：只有 lane0 跑的自我檢查

```asm
        # --- expect（僅 lane0，a0=錯誤數） ---
        bne     t0, x0, QUIT    # 只有 tid==0 留下
        li      a0, 0
        ...
EXP0_7:
        ...
        lw      a6, 0(a6)       # 讀回 C[i]
        bne     a6, a7, EXPBAD0_9  # 與重算值不合就記錯
        ...
EXPBAD0_9:
        addi    a0, a0, 1       # 錯誤數 + 1
        ...
EXP0N_8:
QUIT:   li      a7, 10
        ecall                   # a7=10：停機，結束碼 = a0
```

解說：`expect` 段由 lane0 把 kernel 的右端重算一次並逐項比對；
`a0` 是錯誤計數，`ecall(a7=10)` 停機後，testbench 檢查 `a0==0` 即 PASS。
這就是前一節 `PASS: …a0=0` 中 `a0` 的由來。

## vecadd 的 GPU 平行化原理

答案是：**有，而且是標準的 SPMD**（單程式、多資料）。

riscvgpu 的四條 lane 共用一份 `prog.hex`（共享 IMEM），但每條 lane 有
**自己的 PC 和暫存器檔**，四條同時跑。平行化的關鍵只有一行觀念：
同一份程式＋不同的 `tid`＝不同的工作。

### 分工：grid-stride，lane k 做索引 k, k+4

init 與 kernel 都是同一個模式——游標從 `tid` 出發、步進 `ntid`：

```asm
        addi    s2, t0, 0       # init 游標 = tid
        ...
        add     s2, s2, t1      # 游標 += ntid（=4）
```

```asm
        addi    s3, a7, 0       # kernel 的 i = tid（a7 剛從 t0 拷貝）
        ...
        add     s3, s3, a7      # i += ntid（a7 剛從 t1 拷貝）
```

`n=8`、`lanes=4` 時分工如下（每條 lane 只跑 2 次迴圈本體，同時執行）：

| lane（`tid`） | init 寫入的索引 | kernel 計算的索引 |
|---|---|---|
| 0 | 0, 4 | `C[0]`, `C[4]` |
| 1 | 1, 5 | `C[1]`, `C[5]` |
| 2 | 2, 6 | `C[2]`, `C[6]` |
| 3 | 3, 7 | `C[3]`, `C[7]` |

8 個元素÷4 條 lane，每條做 2 個——這就是加速的來源。
若是序列執行，FOR 迴圈本體要跑 8 次；這裡四條 lane 各跑 2 次，
重疊在同樣的時脈區間內（實測全體 done 於 cycle 254）。

### 為什麼這樣分不會錯

- **不相交劃分**：每個索引只被一條 lane 讀寫（`sw` 的目標位址互不重疊），
  所以同一階段內沒有 data race，不需要 lock。
- **跨階段可見性靠 `barrier`**：init 寫的 A/B 存在共享 DMEM，
  kernel 讀之前必須確定四條都寫完了。硬體語意是每條 lane 凍結自己的 PC
 （`pc_hold = halted | (is_barrier & ~barrier_release)`），直到
  「全部未停通道皆到達」（`barrier_release = &(halted | barrier)`）才一起放行。
  init→kernel、kernel→expect 之間的 `barrier` 都是這個作用。

### 什麼部分不是平行的

`expect` 是序列的：`bne t0, x0, QUIT` 把 lane1–3 直接送去停機，
只有 lane0 逐項重算比對。這是故意的——驗證工作小，沒必要平行化；
真正的計算（init＋kernel）全部平行。

### 跟 CUDA SIMT 的一個差異

CUDA 同一 warp 內是 lockstep（共用 PC，分歧要靠遮罩）。
riscvgpu 每條 lane 的 PC 是獨立的，分歧天然沒問題，
代價是同步只能靠顯式的 `barrier` 交會——上面三個 `barrier` 就是這麼來的。

## 範例二：saxpy（函式呼叫的 ABI）

### 高階碼（`kernels/saxpy.ku`，節錄）

```c
param a: int = 2;                          // 全域 param，住在 s2
func axpy(a: int, xi: int, yi: int) -> int {
  t: int = a * xi;                         // 參數 a 遮蔽全域 a，住在 s4
  return t + yi;
}
kernel saxpy {
  for (i: int = tid; i < n; i += ntid) {
    C[i] = axpy(a, A[i], B[i]);            // 真實 call，不是 inline
  }
  barrier();
}
```

### 呼叫端（caller）：spill → 傳參 → jal

```asm
        lw      a6, 0(a7)       # B[i]（第三個引數，先算好）
        addi    sp, sp, -12
        sw      a6, 0(sp)       # spill 活著的暫存器（callee 可能蓋掉）
        sw      t6, 4(sp)
        sw      a7, 8(sp)
        addi    a0, s2, 0       # a0 = 全域 a（s2）
        addi    a1, a6, 0       # a1 = A[i]
        addi    a2, t6, 0       # a2 = B[i]
        jal     ra, F_axpy      # 跳進函式，返回位址存 ra
        lw      a6, 0(sp)       # 回復 spill
        lw      t6, 4(sp)
        lw      a7, 8(sp)
        addi    sp, sp, 12
        addi    a7, a0, 0       # 回傳值（a0）拿去存 C[i]
```

解說：呼叫慣例是 `a0–a3` 傳參、`a0` 回傳。`jal ra, F_axpy` 前先把
活著的暫存器壓堆疊，因為 callee 只保證恢复 s-regs（見下），
`t`／`a` 類暫存器由 caller 自己保護。

### 被呼叫端（callee）：frame → 搬參數 → jalr

```asm
F_axpy:
        addi    sp, sp, -20
        sw      ra, 16(sp)      # 存返回位址
        sw      s4, 0(sp)       # 存自己會寫的 s-regs（callee-saved）
        sw      s5, 4(sp)
        sw      s6, 8(sp)
        sw      s7, 12(sp)
        addi    s4, a0, 0       # 參數 a 進家（s4）：遮蔽全域的 a（s2）
        addi    s5, a1, 0       # xi
        addi    s6, a2, 0       # yi
        slli    a7, s5, 1       # a * xi：a=2 → 左移一位（又是 shift 取代 mul）
        ...
        addi    a0, a7, 0       # return 值進 a0
        jal     x0, RET_axpy_10
RET_axpy_10:
        lw      s4, 0(sp)       # 恢复 s-regs
        ...
        lw      ra, 16(sp)
        addi    sp, sp, 20
        jalr    x0, 0(ra)       # 返回
```

解說：callee 只存「自己寫入」的 s-regs（這裡是 `s4–s7`），frame 恰好 20 位元組，
不浪費。注意 `a * xi` 中 `a=2` 是常數（param 在編譯期已知），
所以又是 `slli` 而不是 `mul`——只要乘數一方是常數，永遠不需要乘法器。
遮蔽（shadowing）靠「家」區分：全域 `a` 住 `s2`，參數 `a` 住 `s4`，
兩者在組語層面毫無關係。

## 高階語法 → 組語模式對照表

| 高階寫法 | 產生的組語模式 |
|---|---|
| `tid`／`ntid` | custom-0 指令（opcode `0x0b`） |
| `mem X[n] @ addr` | `li 基址, addr`（`t2/t3/t4/s0/s1` 輪流當家） |
| `A[e]` 讀／寫 | `slli 位移, e, 2` ＋ `add 基址` ＋ `lw`／`sw` |
| `c * x`（c 常數） | shift-add 展開（`×10 = slli 3 ＋ slli 1 ＋ add`） |
| `x / d`、`x % d` | 只接受 2 的冪次常數 `d`（`srai`＋偏置修正，向零取整） |
| `for` | 初值＋`slt`／`beq` 條件＋本體＋`FSTEP` 步進＋`jal` 回邊 |
| `if`／`while` | `beq` 分歧＋標籤（`ELSE`／`ENDIF`／`WHILE`／`WEND`） |
| `f(a, b)` | spill＋`a0/a1…` 傳參＋`jal ra`；callee 建 frame＋`jalr` 返回 |
| `barrier();` | `barrier`（custom-0，funct3=010） |
| `print(e)` | `__print_int`：二進位長除法逐位＋`ecall(a7=1)`（僅 IDE／rvemu 可見） |
| `expect` | 僅 lane0（`bne t0, x0, QUIT`）重算＋比對，`a0` 計錯 |

## 在硬體上驗證

一鍵跑全部（`riscv/gpu_examples.sh`，可帶 kernel 名只跑指定的；
`prog.hex` 自動備份還原，不污染 repo）：

```sh
cd riscv
./gpu_examples.sh
```

手動逐步跑：

```sh
cd riscv/_web_tools
node cli/cu2rv.js kernels/vecadd.ku -o /tmp/vecadd.s
node cli/rvasm.js /tmp/vecadd.s
cp /tmp/vecadd.hex ../_verilog/riscvgpu/prog.hex   # 暫代，測完記得還原
cd ../_verilog/riscvgpu
iverilog -o sim riscvgpu_test.v riscvgpu.v lane.v alu.v control.v immgen.v regfile.v
vvp sim
```

實測輸出（`git checkout -- prog.hex` 已還原）：

```
done at cycle 254, lanes_halted=1111
PASS: 向量加法全對（C=11,22,..,88，a0=0）
```

## 其他 kernel 的硬體實測

`riscvgpu_test.v` 的陣列黃金值是按 vecadd 寫死的（`B=10×`、`C=11×`），
所以 `saxpy`／`relu`／`sum` 跑它一定會報陣列不符——但這不代表程式錯。
判斷方式：只看 `done`＋有沒有 `lane0 a0` FAIL（`a0` 是 kernel 內建
`expect` 的錯誤數，`a0=0` 即語意正確）。實測（`.hex` 暫代 `prog.hex`）：

| kernel | 結果 | 說明 |
|---|---|---|
| `vecadd` | `PASS`（cycle 254） | 與黃金值完全一致 |
| `saxpy` | `done`（cycle 321），無 `a0` FAIL | 函式呼叫 ABI 在硬體上正確；`C=4,7,10,…,25`（`=3i+4`）與語意相符，16 個 FAIL 全是黃金值對不上 |
| `relu` | `done`（cycle 98），無 `a0` FAIL | `if`／`else` 在硬體上正確 |
| `sum` | `done`（cycle 183），無 `a0` FAIL | reduction＋`barrier` 在硬體上正確 |

四者皆 `lanes_halted=1111`（四條通道全部跑完停機）。結論：
cu2rv 產生的組語經組譯後，四個 kernel 都能在 verilog riscvgpu 上跑，
且語意全對。

附註：`rvemu` 是單通道、統一編址的模擬器（`tid=0`、`ntid=1`），
`vecadd` 這種資料在低位址（`0x100`）的多通道 kernel 不適合直接餵給它；
要是想在 IDE 裡跑，改用 `examples/gpu_tid.s`、`examples/gpu_vecadd1.s`
這類單通道安全的範例。
