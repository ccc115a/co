# hackjs（`_web_eda_riscv/`）：JavaScript 版 Nand2Tetris 全工具鏈＋RISC-V 後端

零依賴 ESM，Node ≥ 20。同一套 `lib/` 跑在 Node（CLI／測試）與瀏覽器
（`dist/*.html`，`file://` 雙擊即開，免 server）。

Jack 編譯器有兩條路（`jack.html` 可切，命令列都通）：

```
路徑 1（HackCPU）：.jack → jack2vm → .vm → vm2asm → .asm → hackasm → .hack/.bin → hackemu
路徑 2（RISCV） ：.jack → jack2vm → .vm → vm2riscv → .s → rvasm → bytecode → rvemu
```

另有 `.hdl → hdl2js → JS 模擬`。RISC-V 目標是 `riscv/_web_tools` 的
rvasm（RV32I+M）＋rvemu，兩目錄須在同一 repo 共存。

## 網頁版（最快上手）

```sh
open dist/jack.html    # Jack 雙後端編譯器
open dist/index.html   # Hack 組語 Emulator
open dist/hdl.html     # HDL 批次模擬
```

`jack.html` 頁首可選 **HackCPU／RISCV**，網址也能指定（hash 優先）：

```
jack.html#prog=Sum                        # HackCPU 跑 Sum
jack.html#prog=Fib&backend=riscv&run=1    # RISCV 跑 Fib 並自動執行
```

- 顯示分頁（`.vm/.asm/.hack`、`.vm/RISCV/bytecode`）只看使用者模組，不含 OS。
- `▶執行`與「送 Emulator（僅 HackCPU）」用 OS 在前的全量。
- RISCV 執行＝嚴格翻譯→組譯→跑滿 20 萬步，印 `ra/s1/a0`＋`STATIC[0..7]`＋`UART`。
  只有無 OS 程式與 OS 全量可跑；`readChar/readInt` 類會等不到鍵盤（見限制）。

## 命令列（cwd 在本目錄；語料先複製到 /tmp 再玩，`jack2vm` 會在來源旁寫 `output/`）

路徑 1（以無 OS 的 Sum 為例，答案 5050 在 `RAM[16]`）：

```sh
cp -r ../11/jackNoOs/Sum /tmp/Sum && node cli/jack2vm.js /tmp/Sum >/dev/null
node cli/vm2asm.js /tmp/Sum/sum.asm /tmp/Sum/output/Main.vm /tmp/Sum/output/Sys.vm
node cli/hackasm.js /tmp/Sum/sum
node cli/hackemu.js --headless /tmp/Sum/sum.bin --max 500000 | grep "RAM\[16\] static"
```

路徑 2（同一個 Sum，答案在 `0x8000`，程式不 halt、跑滿即停）：

```sh
node cli/vm2riscv.js /tmp/Sum/sum.s /tmp/Sum/output/Main.vm /tmp/Sum/output/Sys.vm
node cli/riscv_run.js /tmp/Sum/sum.s --max 100000
```

路徑 2＋OS（Seven，答案 `7` 從 UART 印出）：

```sh
mkdir -p /tmp/Seven && cp gen/os_src/*.jack ../11/jack/Seven/Main.jack /tmp/Seven/
node cli/jack2vm.js /tmp/Seven >/dev/null
node cli/vm2riscv.js /tmp/Seven/seven.s /tmp/Seven/output/*.vm
node cli/riscv_run.js /tmp/Seven/seven.s --max 500000
```

HDL 模擬（`--dir` 必填可重複；`Memory.tst` 需人工按鍵，自動跳過）：

```sh
node cli/hdl2js.js --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b
```

## CLI 一覽

| 指令 | 用法 |
|---|---|
| `hdl2js` | `--dir DIR [--dir …] [--test F.tst] [--top NAME] [--out gen] [--keep]` |
| `jack2vm` | `<Name.jack｜目錄>`（輸出在來源旁 `output/`） |
| `vm2asm` | `<out>.asm <in>.vm […vm]`（輸出在前；多檔才寫 bootstrap） |
| `vm2riscv` | `<out>.s <in>.vm […vm] [--lenient]`（同上；`--lenient` 僅供檢視） |
| `hackasm` | `<Name>`（讀 `.asm`，寫 `.hack`＋`.bin`） |
| `hackemu` | `--headless <file> [--max N] [--dump A,B] [--keys F] [--img F]`（只支援 headless） |
| `riscv_run` | `<in>.s [--max N] [--dump A,C]`（跑滿即停，印暫存器＋UART＋MEM） |

## 測試

```sh
node --test test/test_vm2riscv.js   # VM→RV32：28 個（形狀＋noOS/OS e2e＋bundle＋CLI）
node --test test/test.js             # 原 Hack 鏈（較重）
node tools/browser_smoke.js          # hdl.html 語料 41/41（瀏覽器同路）
node tools/browser_jack_smoke.js     # jack.html 12 支程式全鏈路
```

注意：`npm test`（＝`node --test test/`）在此環境壞掉（pre-existing 目錄解析失敗），
逐檔跑；`bash verify.sh` 是嚴格全回歸（很重），`bash test.sh` 是容錯版。

## RISC-V 記憶體約定（`lib/riscv/vm2riscv.js`）

s1＝VM SP（`0x1C000` 向上）、s2..s5＝LCL/ARG/THIS/THAT、temp＝`0x10000`＋4i、
static＝`0x11000`＋檔序*`0x400`＋4i；Jack word 位址 W 經 this/that 映射為
`0x20000`＋4W；`Math.multiply/divide` 內聯 `mul/div`，
`Output.printChar/printInt/println/printString` 內聯為 UART。
程式本體須＜64KB；真值 true＝-1。

## 已知限制

- Keyboard 恆讀 0：`readChar/readInt` 類（如 Average）會空等，`keyPressed` 可用；
  Screen 寫入只進鏡像 Ram，看不到 Pong 畫面。
- 產物不 halt：一律跑滿步數即停，看 STATIC／UART 驗收，不看結束碼。

## 更多文件

- `AGENTS.md`——給 agent 的本目錄精簡指令（含兩處 rvasm 坑與網址規則）。
- `_doc/v2.0.md`——本版完整版本紀錄；`_doc/v0.1…v1.2.md`——歷史版本。
- `lib/riscv/vm2riscv.js.md`——RV 後端設計細節；其餘 `lib/` 多數也有 `.md` companion。
- 重建網頁：`node tools/gen_corpus.js && node tools/embed.js`
  （`npm run build` 是壞的；改 `dist/*.js` 後把引用它的 `?v=` 版號＋1）。
