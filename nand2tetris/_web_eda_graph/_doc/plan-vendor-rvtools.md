# plan：把 `riscv/_web_tools` 收進 `_web_eda_riscv/`（vendor 凍結快照）

目標：`_web_eda_riscv/` 搬到別處也能建置、測試、執行，不再讀取
`riscv/_web_tools/` 任何檔案。做法是把用到的 4 個檔案**原樣複製進來凍結**，
之後視為唯讀（沿用現行「勿改上游原始碼」規則，只是上游從「隔壁目錄」變成
「目錄內的凍結副本」）。

## 1. 先釐清：哪一層還在依賴

| 層 | 現況 | 是否依賴外部 |
|---|---|---|
| 瀏覽器執行期 | `dist/embed.js` 已內含 bundle（committed） | 已獨立 |
| Node 建置期 | `tools/embed.js` 讀 `../../riscv/_web_tools/lib/*.js` 打包 | 依賴 |
| Node 測試期 | `test/test_vm2riscv.js` 直接 import rvasm/rvemu | 依賴 |
| CLI 執行期 | `cli/riscv_run.js` 直接 import rvasm/rvemu | 依賴 |

所以要搬的只有 4 個純 ESM、零依賴的檔案（`cu2rv.js` 本目錄沒人用，不搬）：

| 檔案 | 行數 | 用途 | 本目錄使用點 |
|---|---|---|---|
| `lib/isa.js` | 229 | 指令定義與編解碼原語 | 被下三者 import（`./isa.js` 相對路徑，搬家後不變） |
| `lib/rvasm.js` | 386 | RV32 組譯器 | `cli/riscv_run.js:6`、`tools/embed.js:56`、`test/test_vm2riscv.js:11` |
| `lib/rvdis.js` | 124 | 反組譯器 | `tools/embed.js:57`（經 `HackRv` 給 `rvemu.html`／`jack.html`） |
| `lib/rvemu.js` | 260 | RV32 模擬器 | `cli/riscv_run.js:7`、`tools/embed.js:58`、`test/test_vm2riscv.js:12` |

## 2. 方案：`third_party/rvtools/` 凍結副本

- 新目錄 `_web_eda_riscv/third_party/rvtools/`，放入上述 4 檔，**內容逐位元組相同**，
  檔頭加一行註記來源（原路徑＋複製日期；內文不動）。
- 附 `third_party/rvtools/README.md`：來源、快照日期、規則三條——
  不編輯、不重構、不改風格；上游若有修正，整檔重抄並更新日期。
- 為什麼不用 `lib/`：`lib/` 有 `.md` companion 同步慣例（見 AGENTS.md），
  第三方凍結碼不該套用本目錄的文件規則；獨立目錄一眼可辨。

## 3. 具體修改清單

1. `cli/riscv_run.js:6-7`：改為 `../third_party/rvtools/rvasm.js`、
   `../third_party/rvtools/rvemu.js`；第 3 行註解改路徑。
2. `tools/embed.js:54-58`：`rvLibs` 改為新路徑；重建 `dist/embed.js`。
   注意：bundle 內只有 `/***** 路徑 *****/` 標題註解會變，其餘位元組應一致，
   用 diff 驗（見 §5）。
3. `test/test_vm2riscv.js:11-12`：import 改新路徑。
4. 重建後 `?v=` 依慣例＋1（`dist/*.html` 引用 `embed.js` 處；見 AGENTS.md）。
5. 文件同步（只改字，不改義）：AGENTS.md（L31、L33、L65 的路徑與「勿改」規則
   改指凍結副本）、README.md（L14）、`_book/41-跑riscv.md`（L32）、
   `lib/riscv/vm2riscv.js` L3 註解、`lib/riscv/vm2riscv.js.md` 對應段落。

## 4. 驗收

1. `diff` 重建前後的 `dist/embed.js`：僅 `/***** ... *****/` 標題行不同。
2. `node --test test/test_vm2riscv.js` 全過；`node --test test/test.js` 全過。
3. `bash verify.sh` RV 相關段（v2.4／v2.5 等）通過；`node tools/browser_smoke.js` 通過。
4. 收尾 grep：`riscv/_web_tools` 只剩歷史 `_doc/v*.md` 提到（不改寫歷史），
   程式碼零引用；並實際把目錄搬到無 `riscv/` 的路徑重跑一次 2＋3（真獨立驗證）。

## 5. 風險

- 上游與副本分叉：用「整檔重抄＋日期」政策壓住；本目錄 bans 編輯副本，
  有 bug 照 40 章 `li` 坑模式繞行（改自家呼叫端）。
- `dist/embed.js` 重建若帶入非預期差異：以 §4.1 的 diff 為門，擋下就停。

## 6. 範圍外的外部引用（本次不動，列出供決策）

| 引用 | 使用點 | 若要獨立的可選做法 |
|---|---|---|
| `../01、../02…` HDL 語料 | `tools/gen_corpus.js:12`（打包進已提交的 `dist/corpus.js`，執行期已獨立） | 不動（改了等於搬課程教材） |
| `../11/jack、../11/jackNoOs` | 同上＋測試讀檔 | 同上 |
| `../Riscv32/asm.js`（182 行，CJS） | `verify.sh:108、115`（組 `Riscv32i` 測資） | 選項：維持現狀；或另案 vendor（注意它是 `require` 風格，與本目錄 ESM 慣例不同） |
| `test/*.js` 的 `../../`（讀 `../11` 測資） | 測試期 | 同課程語料，不動 |

本規劃只做 `riscv/_web_tools` 4 檔；上表若要收，另開規劃。
