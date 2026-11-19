# third_party/courses —— 課程測資凍結副本（勿編輯）

來源：課程目錄 `01/`、`02/`、`03/`、`04/`、`05/`、`06/`、`08/`、`11/`、
`Riscv32/`（`Riscv32` 僅收 `asm.js` 一檔），複製日期 2026-10-04，
內容逐位元組相同。只收測資四種副檔名 `.hdl`／`.tst`／`.cmp`／`.hack`、
Jack 程式 `.jack`、以及測試點名的 `06/*.asm,*.bin`、`08/*.vm`、
`Riscv32/asm.js`；可再生的 `.out`、`output/`、`*.hdl.md` 一律不收
（跑測試會自己長出來，由本目錄 `.gitignore` 蓋住）。

規則三條（同 `../rvtools/README.md`）：
1. 不編輯、不重構、不改風格——課程教材若更新，整批重抄並更新本行日期。
2. 語料 key 凍結為 `../01/...` 形式（見 `tools/gen_corpus.js` 的來源→key 映射），
   網頁章節選單、網址 hash、`test.js` 斷言都不必改。
3. 本目錄不適用 `lib/` 的 `.md` companion 同步慣例。

使用點：`verify.sh`／`test.sh` 的 `--dir`／`--test`、`test/test.js`、
`test/test_vm2riscv.js`、`tools/browser_jack_smoke.js`、
`tools/gen_corpus.js`（打包進已提交的 `dist/corpus.js`）。
已刪除的 `cpu2stage.sh` 指到的 `../Cpu2stage` 本就不存在，不在本目錄收容。
