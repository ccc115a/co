# WebEDA — 純前端 Verilog EDA 工具

以 [YoWASP](https://yowasp.org/)（Yosys / nextpnr 的 WebAssembly 版本）為基礎的**純前端** EDA 網頁：
在瀏覽器裡完成 Verilog 的**解析、合成、模擬、佈局繞線、位元流產生**，全程不需要後端運算（只靠一個靜態檔案伺服器）。

## 功能

| 步驟 | 功能 | 引擎 |
|------|------|------|
| ① 解析 | Elaborate + 電路檢查，列出模組埠 | `yowasp-yosys` |
| ② 合成 | `synth_ice40` 合成到 iCE40，顯示 cell 統計 | `yowasp-yosys` |
| ③ 模擬 | 閘階層（gate-level）事件驅動模擬 + 波形檢視 + VCD 下載 | `yowasp-yosys`（映射網列）+ 內建 JavaScript 模擬器 |
| ④ 佈局繞線 | `nextpnr-ice40` 佈局繞線，顯示資源利用率與最高頻率 | `@yowasp/nextpnr-ice40` |
| ⑤ 位元流 | `icepack` 產生 FPGA bitstream | `@yowasp/nextpnr-ice40` |

其他：多檔範例電路、腳位限制檔（PCF）、目標裝置/封裝/頻率設定、各階段產物下載（`.json` / `.asc` / `.bin` / `.vcd`）。

## 快速開始

```bash
npm install          # 安裝 YoWASP 引擎（npm 套件，內含 WebAssembly）
npm run vendorize    # 把引擎複製到 public/vendor/（瀏覽器直接以 ES module 載入）
npm start            # 啟動靜態伺服器 → http://localhost:8088
```

打開網頁後：

1. 選一個範例（或自己貼 Verilog），設定 top 模組名稱。
2. 按「① 解析」——左側會列出輸入埠的激勵設定（定值／時脈／序列）。
3. 按「② 合成」「③ 模擬」（看波形）「④ 佈局繞線」「⑤ 位元流」。
   各步驟會自動補跑遺失的前置步驟；引擎的 WebAssembly 只在第一次使用時下載，之後由瀏覽器快取。

### 瀏覽器需求

引擎使用 WebAssembly exception handling（exnref）：**Chrome／Edge 137+、Firefox 138+**（Safari 支援度未確認）。

## 架構

```
server.js              # 純 Node.js 靜態伺服器（無依賴），只是把 public/ 送上來
tools/vendorize.js     # node_modules 的 YoWASP 引擎 → public/vendor/
public/
  index.html           # 單頁 UI
  css/style.css
  js/main.js           # UI 邏輯、流程編排（①→⑤）、激勵設定
  js/worker.js         # Web Worker：宿主 yosys / nextpnr / icepack
  js/sim.js            # 閘階層模擬器（吃 yosys write_json 網列）+ VCD 產生器
  js/wave.js           # canvas 波形檢視器（縮放／平移／游標）
  samples/*.v          # 範例電路
  vendor/yowasp/       # YoWASP 引擎（vendorize 產生，已 gitignore）
test/                  # node --test（npm test）
```

## 模擬器說明與限制

YoWASP 的 yosys 不含 `sim` 指令，因此本專案內建一個 JavaScript 閘階層模擬器（`js/sim.js`）：

- 前處理：`proc; flatten; memory_map; async2sync; techmap; simplemap` 把設計映射成 `$_AND_`、`$_MUX_`、`$_DFF_*` 等基本 cell。
- 三值邏輯（0/1/x）、事件驅動收斂；支援 DFF／DFFE／DFFSR／SDFF（同步重置）／DLATCH／SR 等正反器語意。
- 激勵不用 testbench，而是由網頁設定：每個輸入埠可為**定值**、**時脈**（半週期步數）或**序列**（每步一個值，最後一個重複）。
- 「正反器初值為 0」選項：無重置的設計（如範例 counter）打開才能看到計數；關閉則遵循真實 x 傳播語意。
- 限制：不支援 `$mem` 未展開的記憶體模型（已用 `memory_map` 展開為正反器）、不支援 tri-state 匯流排語意（視為 x）、暫存器初值行為與 Icarus 不完全相同。

## 測試

```bash
npm test    # 模擬器單元測試 + YoWASP 全流程（合成→佈局→位元流）+ 伺服器測試
```

## 設計緣由

- YoWASP 把 Yosys／nextpnr 編譯成 WASM 並提供 npm 套件，`gen/bundle.js` 是可用原生 ES module 載入的瀏覽器相容模組（以 `import.meta.url` 相對路徑抓取 `.wasm` 與資源檔），因此只要把 `gen/` 原封不動放進靜態目錄即可，不需要打包器。
- 引擎跑在 Web Worker 裡，UI 不會被合成／佈局的運算卡住；模擬則在主執行緒（網列規模小，通常數毫秒內完成）。
