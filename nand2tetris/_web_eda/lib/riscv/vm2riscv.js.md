# lib/riscv/vm2riscv.js —— VM → RISC-V 組語翻譯器

`Vm2Rv.translate(files)` 吃 `[{ path, src }]`（`.vm` 文字），吐 RV32 組語（`.s` 文字），
目標是 `riscv/_web_tools` 的 rvasm（RV32I+M）＋ rvemu。呼叫慣例對齊
`lib/asm/vm2asm.js`：多檔才寫 bootstrap（`SP＝STACK_BASE`＋`call Sys.init`＋`ecall` 停機），
`label/goto/if-goto` 多檔時加 `函式$` 前綴，`return` 編號用全域計數器。
（包在 `Vm2Rv` IIFE 內：`tools/embed.js` 拼接時與 `vm2asm.js` 的同名符號會撞，
故經 `window.HackVm2Rv` 匯出；Node 端 `import { Vm2Rv }`。）

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
`Math.multiply`／`Math.divide` 內聯為 `mul`／`div`；其餘 `Math|Memory|String|Array|`
`Screen|Keyboard|Output.*` 嚴格模式直接 throw，顯示模式（`{ lenient: true }`，
`jack.html` 的 `.s` 分頁與 `cli --lenient` 用）照發 `jal` 並列在表頭外部呼叫
（僅供檢視，不可直接組譯執行）。翻譯結束檢查所有 `call` 目標皆有對應
`function`（顯示模式跳過，否則早於組譯報錯）。

## 驗證方式

產物不 halt（`Sys.init` 結尾是 `Main.loop` 無窮迴圈），故不用 rvemu 的 run-to-halt；
測試（`test/test_vm2riscv.js`）以 `Emulator.step()` 定步執行後讀
`STATIC_BASE`（Main 結果 static 0）比對 oracle：chain＝5、Sum＝5050、
Factorial＝120、Fib＝6765、GCD＝63、PrimeUnder100＝97；
另測 `dist/embed.js` 內 `HackVm2Rv.translate` 與 lib 一致且未覆蓋 `HackVm2Asm`。

## 前端

`dist/jack.html` 另有 `.s` 分頁：同一批 `.vm` 經 `HackVm2Rv` 轉換後**僅顯示、不執行**
（含 OS 呼叫的程式顯示錯誤訊息，Hack 主鏈路不受影響）。
改 `lib/` 後重建顺序：`node tools/gen_corpus.js && node tools/embed.js`，
並把有改的 `dist/*.js` 在三頁 html 的 `?v=` 版號＋1。
