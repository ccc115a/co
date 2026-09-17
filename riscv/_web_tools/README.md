# rvjs：純前端 RV32 開發工具

`rvjs` 是本目錄（`riscv/_web_tools/`）的純前端 RV32 開發工具：組譯器（assembler）、
反組譯器（disassembler）、模擬器（emulator）全部跑在瀏覽器裡，
`file://` 直開即用，零 CDN、零 module、零 server。

> 分工：`lib/`（`isa.js`、`rvasm.js`、`rvdis.js`、`rvemu.js`）與 `examples/*.s`
> 由另一人平行撰寫。本目錄只收 `web/`、`tools/`、`README.md`；
> 雙方以「瀏覽器端全域 `RVJS`」為契約，互相防禦式相容
> （對方缺席時頁面照常開啟、顯示中文提示，不拋未捕捉例外）。
> `lib/`、`examples/`、`cli/`、`kernels/` 現皆已就位；`tools/build.js`
> 缺檔不報錯（樁實作＋`typeof` 守衛），契約見下。

## 目錄結構

```
_web_tools/
  web/            本人撰寫：純前端頁面（source of truth）
    index.html    RV32 IDE（繁體中文 UI）
    enc.html      指令編碼瀏覽器
    app.js        IDE 邏輯（classic script，全域 App）
    enc.js        編碼器邏輯（classic script，全域 Enc，自帶解碼表）
    style.css     深色簡潔 RWD 共用樣式
  tools/
    build.js      node 建置腳本（仿 _web_eda/tools/embed.js）
  lib/            isa.js、rvasm.js、rvdis.js、rvemu.js（＋cu2rv.js，DSL 編譯器本體）
  examples/       *.s 語料，有則併入 dist/corpus.js
  cli/            命令列：rvasm.js、rvdis.js、rvemu.js、cu2rv.js
  kernels/        cu2rv 自訂 kernel DSL 範例（*.ku，見 kernels/README.md）
  lib/cu2rv.js    cu2rv 編譯器本體（DSL→riscvgpu 組語，零依賴 ES module）
  dist/           建置產物（commit 進 git，見 .gitignore 的 !dist/）
    rvjs.js       lib/ 合併後的 classic script（全域 RVJS）
    corpus.js     examples/*.s 合併後的語料（全域 RVJS_CORPUS，有語料才產生）
    kucorpus.js   kernels/*.ku 合併後的 DSL 語料（全域 RVJS_KUCORPUS，有語料才產生）
    index.html、enc.html、app.js、enc.js、style.css
```

## 契約（與 lib/ 的介面）

瀏覽器端全域 `RVJS = { assemble, disassemble, Emulator, compileKernel }`（由 `dist/rvjs.js` 提供）：

- `assemble(src, { origin })` → `{ words, labels, listing }`
  - `words`：uint32 陣列；`labels`：標籤→位址；`listing`：字串陣列或 `{ addr, word, text }` 陣列（`app.js` 兩種都吃，吃不到就用 `disassemble` 自建）。
- `disassemble(words, origin)` → `string[]`（`enc.html` 反向解碼拿它顯示組語對照）。
- `new RVJS.Emulator()` 有 `loadWords`／`run`／`getReg`；
  `run` 回傳 `{ steps, halted, exitCode, uart }`。
  `app.js` 另寬容 `load`、`step`、`getRegs`／`regs`、`pc`／`getPC` 等變體。
- `RVJS.compileKernel(src)` → `{ asm }`（cu2rv：自訂 kernel DSL→`.s` 文本；錯誤 throw 中文行號）。

## CLI 用法

只需 node（無依賴）。四支 CLI 皆吃相對路徑，在本目錄下執行：

```sh
cd riscv/_web_tools
node cli/rvasm.js examples/hello.s            # 組譯 → examples/hello.hex ＋ hello.bin
node cli/rvemu.js examples/hello.s            # 組譯＋執行，印 UART／exit／steps／暫存器
node cli/rvemu.js --hex examples/hello.hex    # 直接讀 hex 執行
node cli/rvdis.js examples/hello.hex          # 反組譯，每列印 addr: hex  asm
node cli/cu2rv.js kernels/vecadd.ku -o /tmp/vecadd.s  # DSL→組語（只輸出 .s）
```

旗標：

- `rvasm.js`：`[--origin 0x0]` 設定載入位址（`assemble(src, { origin })`）。
- `rvemu.js`：`[--max N]` 最大步數（預設 100000，超步即報錯停機）。
- `cu2rv.js`：`[-o <Name>.s]` 指定輸出（預設與輸入同名，只改副檔名）。

輸出格式：`.hex` 每列 8 位十六進位一個字（可直接餵 `iverilog` 的 `$readmemh`），
`.bin` 每列 32 位二進位一個字；兩者建構物用完即刪，不進版控（見 `verify.sh` 的 `trap`）。

完整鏈路（DSL→組語→機器碼→反組譯；執行另見下段限制）：

```sh
node cli/cu2rv.js kernels/vecadd.ku -o /tmp/vecadd.s
node cli/rvasm.js /tmp/vecadd.s      # → /tmp/vecadd.hex ＋ /tmp/vecadd.bin
node cli/rvdis.js /tmp/vecadd.hex
node cli/rvemu.js examples/gpu_vecadd1.s  # UART 印 OK，exit=0
```

注意：`rvemu` 是統一編址（程式與資料在同一記憶體，都從 origin 載入），
不像硬體 IMEM／DMEM 分離。所以資料放在低位址（如 `0x100`）的 4 通道 kernel
（如 `vecadd`）**不要**直接餵 `rvemu`（會踩到程式區）；這類 kernel 取 `.hex`
上 `iverilog` 硬體跑。`rvemu`／IDE 跑單通道安全的範例
（`gpu_tid`、`gpu_vecadd1`，資料避開程式區）即可。

## 建置 dist（tools/build.js）

```sh
node tools/build.js
```

行為：

1. 把存在的 `lib/*.js` 去掉 `import` 行、`export ` 前綴後併成 `dist/rvjs.js`
   （尾部加 `globalThis.RVJS = { assemble, disassemble, Emulator, compileKernel };`，
   另有 `typeof` 守衛，lib 缺名時不炸整包）；
   `lib/` 全缺時輸出樁（呼叫拋中文提示），不報錯。
2. 把 `web/index.html`、`web/enc.html` 複製到 `dist/`
   （`../dist/rvjs.js`、`../dist/corpus.js`、`../dist/kucorpus.js` 改掛 `./` 相對路徑），
   `app.js`／`enc.js`／`style.css` 一併複製。
3. `examples/*.s` 存在才產生 `dist/corpus.js`
  （`globalThis.RVJS_CORPUS = [{ name, src }...]`，`app.js` 優先用它覆蓋組語下拉選單）；
   不存在不報錯，頁面用內嵌預設範例。
4. `kernels/*.ku` 存在才產生 `dist/kucorpus.js`
  （`globalThis.RVJS_KUCORPUS = [{ name, src }...]`，`app.js` 優先用它覆蓋 DSL 下拉選單）；
   不存在不報錯，頁面用內嵌 DSL 範例。
5. 印出產物清單。

## 測試與驗證

```sh
cd riscv/_web_tools
npm test          # = node --test test/：isa 編解碼、組譯器、模擬器、cu2rv、前端接線
bash verify.sh    # 嚴格全回歸（set -euo pipefail），通過才印「全部驗證通過」
```

`verify.sh` 依序做：`npm test` → 全部 `examples/*.s` 組譯 →
逐個 `rvemu` 比對預期 UART 與 exit code → 全部 `kernels/*.ku` 編成 `.s` 再組譯 →
`node tools/build.js` 重建 `dist` → `grep` 確認 `dist` 含 GPU／DSL 範例與編譯器。
`.hex`／`.bin`／`.tmp-ku` 等建構物用完即刪（`trap`，成功失敗皆清），不留 repo。

## web 使用法

### 方式一：直接開源碼（需先 build）

```sh
node tools/build.js
open web/index.html   # 載入 ../dist/rvjs.js（file:// 直開可用）
```

### 方式二：開建置產物（發佈形態）

```sh
open dist/index.html  # 全部 ./ 相對路徑，file:// 直開可用
```

### IDE（index.html）

- 範例下拉選單：預設內嵌 3 個範例（見下）；`dist/corpus.js` 存在時以語料覆蓋。
  - `hello`：UART 印 `Hi RV32!`（`a7=1` 逐字輸出，`a7=10` 離開）。
  - `sum`：1..10 求和，結束碼 55。
  - `fib`：`fib(10)=55`，結束碼 55。
  - `gpu_tid`：`tid`／`ntid`／`barrier` 入門，UART 印 `T0 N1`。
  - `gpu_vecadd1`：單通道向量加法 `C=A+B`，UART 印 `OK`（完整 4 通道版見 DSL 面板）。
- Kernel DSL 面板：DSL 範例下拉（`dist/kucorpus.js` 存在時以 `kernels/*.ku` 覆蓋，
  內含 `vecadd`／`saxpy`／`tiny`／`relu`／`sum`）＋［編譯 DSL→組語］，結果送入組語原始碼再按［組譯］。
  單通道語意可直接執行；4 通道 kernel 請取 `.hex` 跑 `iverilog` 硬體。
- 按鈕：［組譯］［執行］（上限 100 萬步）［單步］［重設］。
- 反組譯/機器碼列表區：單步時 PC 列高亮（`▶`）。
- 暫存器區：`x0–x31` 用 ABI 別名顯示（`x10/a0`），變動高亮。
- UART 主控台：顯示 `run` 回傳的 `uart` 字串。
- 狀態列：`steps`／`exit`／錯誤訊息；組譯失敗時提示行號並把游標移到該行。

### 指令編碼瀏覽器（enc.html）

- 上方：選擇格式（R/I/S/B/U/J）＋助記符下拉＋欄位輸入 → 即時顯示 32 位二進位分段與 hex。
- 下方：貼 hex（`0x…`、32 位二進位或純 hex）→ 解出欄位表，並以 `RVJS.disassemble` 顯示組語對照。
- 暫存器可填 `x0–x31` 或 ABI 別名（如 `a0`）。
- custom-0（`tid`／`ntid`／`barrier`）目前不在編碼瀏覽器內；看編碼用 IDE 反組譯區或 `cli/rvdis.js`。

## 自行 build dist 指令

```sh
cd riscv/_web_tools
node tools/build.js
# 檢查：dist/rvjs.js、dist/corpus.js（若有語料）、dist/kucorpus.js（若有 DSL 語料）、dist/index.html、dist/enc.html
```

## 支援指令表

### RV32I（基礎整數指令）

| 格式 | 指令 |
|------|------|
| R | `add`、`sub`、`sll`、`slt`、`sltu`、`xor`、`srl`、`sra`、`or`、`and` |
| I（OP-IMM） | `addi`、`slti`、`sltiu`、`xori`、`ori`、`andi`、`slli`、`srli`、`srai` |
| I（Load） | `lb`、`lh`、`lw`、`lbu`、`lhu` |
| S | `sb`、`sh`、`sw` |
| B | `beq`、`bne`、`blt`、`bge`、`bltu`、`bgeu` |
| U | `lui`、`auipc` |
| J | `jal` |
| I（跳躍/系統） | `jalr`、`fence`、`ecall`、`ebreak` |

### M 擴充（整數乘除）

| 格式 | 指令 |
|------|------|
| R（`funct7=0x01`） | `mul`、`mulh`、`mulhsu`、`mulhu`、`div`、`divu`、`rem`、`remu` |

### riscvgpu custom-0（4 通道 SPMD，見 `../_verilog/riscvgpu/`）

| 助憶 | 語意 | 編碼 |
|------|------|------|
| `tid rd` | `rd = 通道號` | opcode `0x0b`，`funct3=000` |
| `ntid rd` | `rd = 通道數` | opcode `0x0b`，`funct3=001` |
| `barrier` | 等全部未停通道到達 | opcode `0x0b`，`funct3=010` |

`rvemu` 以單通道語意執行（`tid=0`、`ntid=1`、`barrier=nop`）；多通道正確性以 `iverilog` 為準。

## cu2rv：自訂 kernel DSL → riscvgpu 組語

`lib/cu2rv.js`（`compileKernel(src) → { asm }`）＋`cli/cu2rv.js`＋範例 `kernels/*.ku`。
輸入為類似 CUDA 的高階 DSL（C-like 大括號、顯式 `int`）：`lanes`／`n`／`mem`／
`param`／`func`／`kernel`／`expect`，支援 `for`／`if`／`while`／真實函式呼叫／
`print`；只輸出 `.s`（再以 `cli/rvasm.js` 組譯）。詳見 `kernels/README.md`。

```sh
cd riscv/_web_tools
node cli/cu2rv.js kernels/vecadd.ku -o /tmp/vecadd.s  # 之後接 rvasm→hex（見上節完整鏈路）
```

### 偽指令（組譯器展開，編碼器以實指令為準）

`nop`（=`addi x0,x0,0`）、`li`、`mv`、`j`、`jr`、`ret`、`call`（=`jal ra, label`）。
內嵌範例僅用 `li`／`mv`／`jal x0` 等最保守子集，保證跨實作可組譯。

### ECALL / UART 約定（教學簡化版）

| 呼叫 | 語意 |
|------|------|
| `a7=1, a0=ch` ＋ `ecall` | UART 輸出一個字元（`a0` 低位元組） |
| `a7=10, a0=code` ＋ `ecall` | 停機（halt），結束碼 `exitCode = a0`（`a7=93` 目前未支援） |
| `sw/sb` 到 `0x10000000`（UART0） | MMIO 輸出（QEMU `virt` 同位址；模擬器可選支援） |

`run` 回傳的 `uart` 字串即主控台內容，`halted`＋`exitCode` 顯示於狀態列。
