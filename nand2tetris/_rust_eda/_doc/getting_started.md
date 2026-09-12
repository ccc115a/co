# 環境建置與快速入門（Getting Started）

這份文件說明如何在乾淨機器上把 `_eda/`（Rust 工具鏈）建起來、跑驗收，
以及每個章節對應的工具怎麼用。全部命令在 macOS / Linux 執行。

## 1. 前置需求

| 需求 | 說明 |
|---|---|
| **Rust**（cargo） | 本機開發用 `rustc 1.98.0-nightly`；穩定版（≥1.85 左右）一般也能編 |
| **C 工具鏈** | 編譯原生依賴需要 `cc`。macOS 裝 Xcode Command Line Tools |
| **網路** | 第一次 `cargo build` 會下載 crates（eframe 全家約 400+ 個套件） |

macOS 安裝 Xcode CLT（沒裝過的話）：

```bash
xcode-select --install
```

## 2. 安裝 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# 照提示選 default profile；重新登入終端後生效
rustc --version && cargo --version
```

## 3. 建置與單元測試

```bash
cd nand2tetris/_eda
cargo build                 # 產出 target/debug/{hackasm,vm2asm,jack2vm,hackemu,...}
cargo test -q               # 30 個單元測試（hackhdl/hackrt/hdl2rs/hackasm/vm2asm/jack2vm/hackemu）
```

> 第一次 `cargo build` 較慢（下載 + 編譯 egui/eframe）。可改用 `cargo build -q`。

## 4. 驗收（回歸）

```bash
bash verify.sh     # 嚴格版：set -e，任何一步失敗即中止
bash test.sh       # 容錯版：逐步執行、失敗也繼續，最後印 gen/ 內容
```

`verify.sh` 跑什麼（40/40 全綠）：

1. workspace 全部單元測試；
2. ch01–03 全部 `.tst`（hdl2rs → Computer.hdl 模擬）；
3. ch04 `Mult`/`Fill`（跑在整台 Computer 上）；
4. ch05 CPU 內部/外部 + `ComputerAdd/Max/Rect`；
5. **全鏈路 e2e**：`Main.jack+Sys.jack → chain.hack → Computer.hdl`（RAM[16]=5）；
6. **hackemu headless 交叉**：`chain.bin → RAM[16] static: 5`（與 hdl2rs 一致）。

## 5. 各章節工具速查

| 章節 | 工具 | 範例命令 |
|---|---|---|
| 01–05（.hdl） | `hdl2rs` | `cargo run -p hdl2rs -- --release --dir ../01 --dir ../02 --dir ../03 --dir ../05 --out gen` |
| 04（Mult/Fill） | `hdl2rs`（跑在 Computer） | 見 `verify.sh` |
| 06（.asm 組語） | `hackasm` | `target/debug/hackasm ../06/Add.asm --bin` |
| 07/08（.vm） | `vm2asm` | `target/debug/vm2asm out.asm ../08/ProgramFlow/BasicLoop/BasicLoop.vm` |
| 09/11（.jack） | `jack2vm` | `target/debug/jack2vm -o gen/vm ../11/jack/Seven` |
| 12（OS） | 全鏈路 | 見 `_doc/v0.7.md`（規劃中） |
| 任何 .bin/.hack | `hackemu` | `target/debug/hackemu out.bin`（GUI）/ `--headless … --max N` |

完整詳細用法見各 crate 目錄的 `README.md`。

## 6. 常見問題

- **`error: linker 'cc' not found`** → 裝 Xcode CLT（見上）。
- **`unable to download …` / 卡在 「Compiling eframe …」** → 網路問題；
  eframe 需一次性下載。換 stable toolchain 也有效：`rustup default stable`。
- **GUI 開不起來（headless server / SSH）** → GUI 需要視窗環境；改跳過執行
  視窗：`hackemu --headless <file> --max N`。
- **`hackemu --headless` grep 不到 `RAM[16] static`** → 確認檔是 `hackasm
  --bin` 產出、且以 `--max` 步數夠跑完 bootstrap（chain 約需 >5 萬條）。
- **想把 C 版當 oracle 比對** → 見 `_doc/v0.5.md`「坑 1」：用 **plain `gcc -O2`**
  編 `/tmp/coracle/{jack2vm,vm2asm}`，**不要**用 `-fsanitize=address`（macOS
  子程序會 crash）。

## 7. 本專案還需要什麼

- 各版完整紀錄：`_doc/v0.1.md` … `_doc/v0.6.md`、規劃 `_doc/plan.md`。
- 各子模組用法：`hackhdl/README.md`、`hackrt/README.md`、`hdl2rs/README.md`、
  `hackasm/README.md`、`vm2asm/README.md`、`jack2vm/README.md`、`hackemu/README.md`。