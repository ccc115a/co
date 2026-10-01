# AGENTS.md（`nand2tetris/_web_eda_riscv/` 範圍）

hackjs：Nand2Tetris 全工具鏈的 JavaScript 版（零依賴 ESM，Node ≥ 20）。
管線：`.jack → jack2vm → .vm → vm2asm → .asm → hackasm → .hack/.bin → hackemu`，
外加 `.hdl → hdl2js → JS 模擬`；另有 VM→RV32 後端（Jack→VM→RISC-V 兩段式）。

## 指令（cwd 在本目錄）

- `node --test test/<檔>.js`——逐檔跑。`npm test`（＝`node --test test/`）在此環境壞掉
  （pre-existing 目錄解析失敗），不要用；`bash verify.sh` 嚴格全回歸但很重，
  `bash test.sh` 容錯版。
- `node cli/hdl2js.js --dir DIR [--dir …] [--test F.tst] [--top NAME] [--out gen] [--keep]`
  `--dir` 必填可重複；`Memory.tst` 需人工按鍵，自動跳過。
- `node cli/vm2asm.js <out>.asm <in>.vm […vm]`、**`node cli/vm2riscv.js <out>.s <in>.vm […vm]`——輸出在前**，多檔才寫 bootstrap。
- `node cli/jack2vm.js <Name.jack|目錄>`——輸出寫在來源旁 `output/`；`node cli/hackasm.js <Name>` 讀 `.asm` 寫 `.hack`＋`.bin`。
- `node cli/hackemu.js --headless <file.bin|.hack> [--max N] [--dump A,B] [--keys F] [--img F]`——只支援 headless。
- `node cli/riscv_run.js <in>.s [--max N] [--dump A,C]`——組譯 RV32 `.s` 後定步執行
  （產物不 halt，永遠跑滿即停），印 `ra/s1/a0`＋`UART`＋`MEM` 區（預設 static 區 8 bytes）。
  完整路徑 2：`jack2vm` → `vm2riscv` →（`rvasm` 或）`riscv_run`。
- 重建 `dist/`：`node tools/gen_corpus.js && node tools/embed.js`；`npm run build` 是壞的（`tools/build.js` 不存在）。`dist/` 有 commit（靠本目錄 `.gitignore` 的 `!dist/`），改 `lib/`/`cli/` 影響網頁時要重建並 commit；`gen/` 產物不 commit。

## vm2riscv（VM→RV32，`lib/riscv/vm2riscv.js`＋`cli/vm2riscv.js`）

- 目標＝`riscv/_web_tools` 的 rvasm（RV32I+M）＋rvemu，只用子集
  （真指令＋`li/mv/j/jr/ret/call`＋`.text/.word`，註解 `#`）；測試直接 import
  `../../../riscv/_web_tools/lib/{rvasm,rvemu}.js`，兩目錄須同 repo 共存。
- **禁符號版 `li`**（`li rd, <標籤>`）：rvasm pass1 固定佔 2 格，標籤位址＜2048 時
  pass2 只吐 1 word，留下 `0x0` 非法字。故 return 地址走 ra 壓幀
  （callee 序幕 `sw ra, -20(s2)` 回填，返回 `jalr x0, 0(t1)`），static 走固定位址。
- 記憶體約定（byte 位址；程式從 0 載入，須＜`0x10000`）：s1＝VM SP（初值 `0x1C000` 向上）、
  s2..s5＝LCL/ARG/THIS/THAT、temp＝`0x10000`＋4i、static＝`0x11000`＋檔序*`0x400`＋4i
  （≤32 檔，每檔 ≤256）；Jack word 位址 W（heap／SCREEN／KBD）經 this/that 時映射為
  `0x20000`＋4W（`slli`＋`li` 相加，pointer 持有仍是 word 值本身）。
  真值 true＝-1；整數 32-bit 語意（Hack 原生 16-bit，小數值一致）。
- `Math.multiply/divide` 內聯 `mul/div`；`Output.printChar/printInt/println/printString`
  內聯為 UART（`ecall a7=1`，void 照推 0；`gen/os_src` 的 Output 是空殼，內聯後才看得到輸出）。
  OS 全量（`gen/os_src` 8 檔）可嚴格翻譯執行（Seven 印 `7`、Pong 跑得動只看不到畫面）；
  其餘未定義 OS 呼叫嚴格模式 throw，`translate(files, { lenient: true })` 顯示模式則照發
  `jal` 並列在表頭（僅供檢視、不可組譯）；結尾檢查 `call` 皆有對應 `function`（顯示模式跳過）。
- 已知限制：Keyboard 恆讀 0（rvemu 無鍵盤），`readChar/readInt` 類會空等；
  `keyPressed` 非阻塞可用；Screen 寫入只進鏡像 Ram，看不到畫面。
- 產物不 halt（尾巴是無窮迴圈或 `Sys.halt`）：不用 run-to-halt 驗證，
  以 `step()` 定步後讀 static／UART 比對：chain 5、Sum 5050、Factorial 120、Fib 6765、
  GCD 63、PrimeUnder100 97、Seven UART `7`、heap 綜合 `Hi!`＋`333`
  （見 `test/test_vm2riscv.js`）。
- 前端：`jack.html` 有 HackCPU／RISCV 後端選單（網址 `backend=hackcpu|riscv`，hash 優先，
  切換寫回 `#prog=X&backend=Y`）。HackCPU 分頁 `.vm/.asm/.hack`，RISCV 分頁
  `.vm/RISCV/bytecode`，其中 `.vm` 只顯示使用者模組，`RISCV` 是模組的 lenient 預覽
  （OS 呼叫列外部表頭）；`bytecode` 需模組可獨立組譯（含未定義呼叫時只顯示原因）；
  `▶執行`與「送 Emulator（僅 HackCPU）」用 OS 在前的全量。
  用 OS 在前的全量。RISCV 執行＝嚴格翻譯→rvasm 組譯→rvemu 跑滿 20 萬步，
  印 `ra/s1/a0`＋`STATIC[0..7]`＋`UART`（OS 程式可跑；無鍵盤程式除外，見上）。
  `rvasm/rvemu/rvdis/isa` 由 `tools/embed.js` 包成 `RvToolchain` IIFE
  （`window.HackRv`），**勿改 `riscv/_web_tools` 原始碼**（`assemble` 同名會覆蓋）。
  改 `dist/*.js` 後把引用它的 `?v=` 版號＋1（快取用；
  `index.html`/`hdl.html` 的 `embed.js` 連帶一起加）。

## 慣例

- 價值判斷：文件、註解、`_doc/v*.md` 版本紀錄一律**繁體中文**；VM 轉出的每行前加
  `# <原 VM 行>`；新 `lib/` 模組附 `.md` companion 並保持同步。
- `lib/` 純 ESM 須同時能被 Node 與 `tools/embed.js` 綴合進瀏覽器（`import` 行會被剝掉，
  勿依賴 import 副作用；`export ` 前綴會被剝，寫法保持簡單）。**拼接後全域同作用域**：
  新 lib 若頂層符號與既有檔撞名（如 `translate`），須包命名空間 IIFE
  （前例：`export const Vm2Rv = (() => {...})()`，`embed.js` 匯出 `HackVm2Rv`）。
- 跨章節語料（`../01`、`../11/jackNoOs` 等）只讀不寫；`cli/jack2vm.js` 會在來源旁產生
  `output/`，手動驗證請先複製到 `/tmp` 再跑。
