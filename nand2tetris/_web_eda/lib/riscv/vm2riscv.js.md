# lib/riscv/vm2riscv.js —— VM → RISC-V 組語翻譯器

`Vm2Rv.translate(files[, { lenient }])` 吃 `[{ path, src }]`（`.vm` 文字），吐 RV32 組語
（`.s` 文字），目標是 `riscv/_web_tools` 的 rvasm（RV32I+M）＋ rvemu。呼叫慣例對齊
`lib/asm/vm2asm.js`：多檔才寫 bootstrap（`SP＝STACK_BASE`＋`call Sys.init`＋`ecall` 停機），
`label/goto/if-goto` 多檔時加 `函式$` 前綴，`return` 編號用全域計數器。
（包在 `Vm2Rv` IIFE 內：`tools/embed.js` 拼接時與 `vm2asm.js` 的同名符號會撞，
故經 `window.HackVm2Rv` 匯出；Node 端 `import { Vm2Rv }`。）

## 記憶體與暫存器約定

rvemu 預設 256KB、程式從 0 載入（須＜`0x10000`）：s1＝VM SP（初值 `0x1C000` 向上）、
s2..s5＝LCL/ARG/THIS/THAT、temp＝`0x10000`＋4i（`UART_BUF` 在＋32，供 printInt 暫存數字）、
static＝`0x11000`＋檔序*`0x400`＋4i（≤32 檔，每檔 ≤256）。
Jack 的 word 位址 W（heap／SCREEN／KBD）經 this/that 存取時映射為 `0x20000`＋4W
（`slli`＋`li` 相加；pointer 持有的仍是 word 值本身，故 `Memory.peek/poke`、
`Array`、`String` 全數可用；SCREEN/KBD 寫讀只進鏡像 Ram）。
真值沿用 Hack 慣例（true＝-1）；整數 32-bit 語意。

## 記憶體與暫存器約定

rvemu 是統一編址、程式從 0 載入；VM 資料區放固定數字位址（程式須小於 `TEMP_BASE`）：

| 用途 | 位置 |
|---|---|
| VM 堆疊（s1＝SP，向上成長） | `STACK_BASE＝0x10000` 起 |
| temp 0..7 | `TEMP_BASE＝0x7000`＋4*i |
| static（第 k 檔變數 i） | `STATIC_BASE＝0x8000`＋k*`0x400`＋4*i（上限 256/檔） |
| LCL/ARG/THIS/THAT | s2/s3/s4/s5（byte 位址）；t0,t1,t2 scratch |

真值沿用 Hack 慣例（true＝-1）。整數為 32-bit 語意（Hack 原生 16-bit；小數值一致）。

## 兩個關鍵設計（皆因 rvasm 行為而起）

1. **全程不用符號版 `li`**：rvasm 對 `li rd, <標籤>` 在 pass1 固定佔 2 格，
   pass2 若標籤位址＜2048 只吐 1 個 word，留下 `0x00000000` 非法字。
   因此 return 地址不走 `li` 取標籤：caller 在幀頂留 placeholder，
   callee 序幕第一行 `sw ra, -20(s2)` 回填（jal 寫入 ra 的正是返回位址）；
   返回時 `jalr x0, 0(t1)`（t1＝幀底讀回），巢狀呼叫安全。
2. **static 不走標籤＋`.word`**（同上坑）：改走固定數字位址，無需資料段。

## 函式幀

沿用 Hack VM 格式 `[ret][LCL][ARG][THIS][THAT]`＋ARG/LCL 重定位；
`call` 經 `jal ra, <函式>`，`return` 還原四暫存器後跳回。
`Math.multiply`／`Math.divide` 內聯為 `mul`／`div`；`Output.printChar／printInt／`
`println／printString` 內聯為 UART 輸出（`ecall a7=1`，void 照推 0；
`gen/os_src` 的 Output 是空殼，內聯後 Seven 等的 print 真正看得到）。
OS 自帶定義的呼叫（如 `Memory.alloc`）走正常呼叫；翻譯結尾才判定：
未定義的 OS 呼叫嚴格模式 throw、顯示模式（`cli --lenient`、
舊前端 `.s` 預覽用）照發 `jal` 並列在表頭（僅供檢視）；
未定義的非 OS 呼叫一律 throw（顯示模式放行）。

## 驗證與已知限制

OS 全量（`gen/os_src` 8 檔）可嚴格翻譯執行：Seven UART 印 `7`、
heap 綜合（String＋Array）印 `Hi!`＋`333`、Pong 可翻譯組譯（執行需鍵盤）。
Keyboard 恆讀 0（rvemu 無鍵盤）：`readChar/readInt` 類會空等，
`keyPressed` 非阻塞可用；Screen 寫入只進鏡像 Ram，看不到畫面。

## 驗證方式

產物不 halt（`Sys.init` 結尾是 `Main.loop` 無窮迴圈或 `Sys.halt`），故不用 rvemu 的
run-to-halt；測試（`test/test_vm2riscv.js`）以 `Emulator.step()` 定步執行後讀
static／UART 比對 oracle（chain＝5、Sum＝5050、…、Seven UART＝`7`）；
另測 `dist/embed.js` 內 `HackVm2Rv.translate` 與 lib 一致且未覆蓋 `HackVm2Asm`。

## 前端與執行

`dist/jack.html` 的 RISCV 後端：`.vm`（顯示用使用者模組）→全量（OS 在前）**嚴格**翻譯→
`HackRv.assemble` 組譯→`HackRv.Emulator` 跑滿 20 萬步，
印 `ra/s1/a0`＋`STATIC[0..7]`＋`UART`（OS 全量可跑；`readChar` 類除外，見上）。
`rvasm/rvemu/rvdis/isa` 由 `tools/embed.js` 包成 `RvToolchain` IIFE
（`window.HackRv`），勿改 `riscv/_web_tools` 原始碼。
`cli/riscv_run.js` 是同路徑的命令列版（`--max`／`--dump`）。
`{ lenient: true }` 顯示模式（`cli --lenient`）僅供檢視不可執行。
