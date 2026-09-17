# rvjs：純前端 RV32 開發工具

`rvjs` 是本目錄（`riscv/_web_tools/`）的純前端 RV32 開發工具：組譯器（assembler）、
反組譯器（disassembler）、模擬器（emulator）全部跑在瀏覽器裡，
`file://` 直開即用，零 CDN、零 module、零 server。

> 分工：`lib/`（`isa.js`、`rvasm.js`、`rvdis.js`、`rvemu.js`）與 `examples/*.s`
> 由另一人平行撰寫。本目錄只收 `web/`、`tools/`、`README.md`；
> 雙方以「瀏覽器端全域 `RVJS`」為契約，互相防禦式相容
> （對方缺席時頁面照常開啟、顯示中文提示，不拋未捕捉例外）。

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
  lib/            另一人撰寫（本任務不碰）：isa.js、rvasm.js、rvdis.js、rvemu.js
  examples/       另一人撰寫（本任務不碰）：*.s 語料，有則併入
  dist/           建置產物（commit 進 git，見 .gitignore 的 !dist/）
    rvjs.js       lib/ 合併後的 classic script（全域 RVJS）
    corpus.js     examples/*.s 合併後的語料（全域 RVJS_CORPUS，有語料才產生）
    index.html、enc.html、app.js、enc.js、style.css
```

## 契約（與 lib/ 的介面）

瀏覽器端全域 `RVJS = { assemble, disassemble, Emulator }`（由 `dist/rvjs.js` 提供）：

- `assemble(src, { origin })` → `{ words, labels, listing }`
  - `words`：uint32 陣列；`labels`：標籤→位址；`listing`：字串陣列或 `{ addr, word, text }` 陣列（`app.js` 兩種都吃，吃不到就用 `disassemble` 自建）。
- `disassemble(words, origin)` → `string[]`（`enc.html` 反向解碼拿它顯示組語對照）。
- `new RVJS.Emulator()` 有 `loadWords`／`run`／`getReg`；
  `run` 回傳 `{ steps, halted, exitCode, uart }`。
  `app.js` 另寬容 `load`、`step`、`getRegs`／`regs`、`pc`／`getPC` 等變體。

## CLI 用法

只需 node（無依賴）：

```sh
cd riscv/_web_tools
node tools/build.js
```

行為：

1. 把存在的 `lib/*.js` 去掉 `import` 行、`export ` 前綴後併成 `dist/rvjs.js`
   （尾部加 `globalThis.RVJS = { assemble, disassemble, Emulator };`，
   另有 `typeof` 守衛，lib 缺名時不炸整包）；
   `lib/` 全缺時輸出樁（呼叫拋中文提示），不報錯。
2. 把 `web/index.html`、`web/enc.html` 複製到 `dist/`（`../dist/rvjs.js` 改掛 `./rvjs.js`），
   `app.js`／`enc.js`／`style.css` 一併複製。
3. `examples/*.s` 存在才產生 `dist/corpus.js`
  （`globalThis.RVJS_CORPUS = [{ name, src }...]`，`app.js` 優先用它覆蓋下拉選單）；
   不存在不報錯，頁面用內嵌預設範例。
4. 印出產物清單。

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
- 按鈕：［組譯］［執行］（上限 100 萬步）［單步］［重設］。
- 反組譯/機器碼列表區：單步時 PC 列高亮（`▶`）。
- 暫存器區：`x0–x31` 用 ABI 別名顯示（`x10/a0`），變動高亮。
- UART 主控台：顯示 `run` 回傳的 `uart` 字串。
- 狀態列：`steps`／`exit`／錯誤訊息；組譯失敗時提示行號並把游標移到該行。

### 指令編碼瀏覽器（enc.html）

- 上方：選擇格式（R/I/S/B/U/J）＋助記符下拉＋欄位輸入 → 即時顯示 32 位二進位分段與 hex。
- 下方：貼 hex（`0x…`、32 位二進位或純 hex）→ 解出欄位表，並以 `RVJS.disassemble` 顯示組語對照。
- 暫存器可填 `x0–x31` 或 ABI 別名（如 `a0`）。

## 自行 build dist 指令

```sh
cd riscv/_web_tools
node tools/build.js
# 檢查：dist/rvjs.js、dist/corpus.js（若有語料）、dist/index.html、dist/enc.html
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

### 偽指令（組譯器展開，編碼器以實指令為準）

`nop`（=`addi x0,x0,0`）、`li`、`mv`、`j`、`jr`、`ret`、`call`（依目的位址遠近展開）。
內嵌範例僅用 `li`／`mv`／`jal x0` 等最保守子集，保證跨實作可組譯。

### ECALL / UART 約定（教學簡化版）

| 呼叫 | 語意 |
|------|------|
| `a7=1, a0=ch` ＋ `ecall` | UART 輸出一個字元（`a0` 低位元組） |
| `a7=10, a0=code` ＋ `ecall` | 停機（halt），結束碼 `exitCode = a0`（`a7=93` 目前未支援） |
| `sw/sb` 到 `0x10000000`（UART0） | MMIO 輸出（QEMU `virt` 同位址；模擬器可選支援） |

`run` 回傳的 `uart` 字串即主控台內容，`halted`＋`exitCode` 顯示於狀態列。
