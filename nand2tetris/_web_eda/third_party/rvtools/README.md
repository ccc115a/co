# third_party/rvtools —— RV32 工具鏈凍結副本（勿編輯）

來源：`riscv/_web_tools/lib/`（`isa.js`、`rvasm.js`、`rvdis.js`、`rvemu.js`），
複製日期 2026-10-04，與來源逐位元組相同（`cu2rv.js` 本目錄無人使用，未收）。

規則三條：
1. 不編輯、不重構、不改風格——有 bug 照 `lib/riscv/vm2riscv.js` 既有模式，
   改自家呼叫端繞行（如 `li` 符號版佔位坑）。
2. 上游若有修正，整檔重抄並更新本行日期；不得合併、不得挑段。
3. 本目錄不適用 `lib/` 的 `.md` companion 同步慣例。

為何在此：`_web_eda_riscv/` 搬到別處也能建置、測試、執行。
使用點：`cli/riscv_run.js`（組譯＋執行）、`tools/embed.js`（打包進
`dist/embed.js` 的 `RvToolchain`，給 `rvemu.html`／`jack.html`）、
`test/test_vm2riscv.js`（測試）。詳見 `_doc/plan-vendor-rvtools.md`。
