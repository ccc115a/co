# hackemu — HACK 虛擬機（GUI + headless）

`hackemu` 是執行 **HACK 機器碼**的模擬器（模擬整台 ch05 電腦：CPU + 32K RAM
+ 螢幕 + 鍵盤）。可載入 `hackasm` 產生的 **`.bin`**（u16 little-endian）或
`.hack` 文字檔，執行時用 egui/eframe 開視窗顯示 **SCREEN（512×256）**、
接受鍵盤輸入；另有無視窗的 `--headless` 模式供自動化驗證。

> 命名由來：`vm2asm`/`jack2vm` 的「vm」指 `.vm` 中間語言，容易混淆，
> 故取名 `hackemu`（hack + emulator）。

## 用法（CLI）

```bash
# 在 _eda/ 下
cargo run -p hackemu gen/chain/chain.hack          # 開 GUI 並載入程式
target/debug/hackemu                                            # 開 GUI（空）
target/debug/hackemu --headless file.bin --max 500000          # 無視窗跑 50 萬條
target/debug/hackemu --headless file.hack --max 500000
```

- GUI 文字一律英文（egui 預設字型不含中文字形）。
- headless 的 `--max` 預設 100,000；跑完印出前後 PC/A/D/SP/cycles、
  `RAM[0..16]` 與 `RAM[16] static` 供 grep 檢查。

## GUI 控制

| 控制 | 作用 |
|---|---|
| 路徑輸入框 + **Load** | 載入 `.bin`/`.hack`（Enter 同效） |
| **Run / Pause** | 開始 / 暫停執行（不限步數） |
| **Step** | 單步執行一條指令 |
| **Reset** | 全部暫存器與記憶體歸零 |
| **Speed** | 對數滑桿 0..=50,000 條/幀 |

狀態列即時顯示 `PC A D SP cycles`；鍵盤按下寫進 KBD 暫存器、放開清 0。

## Library API（`src/lib.rs`，純 std）

```rust
pub struct Vm { pub ram: [u16; 32768], pub a: u16, pub d: u16, pub pc: u32, pub cycles: u64 }
Vm::new / load_bin(&[u8]) / load_hack(&str) / load_file(path) / reset
    / step() -> bool   // false = PC 已超出 ROM（程式結束/卡在迴圈）
    / run(n)           // 跑 n 條
    / screen_pixel(row, col) -> bool   // 該畫素是否黑
    / screen_bitmap() -> Vec<[bool; 512]>   // 256 列 × 512 欄
    / set_key(code: u16)
```

常數：`SCREEN_BASE`/`SCREEN_WORDS`/`SCREEN_ROWS`/`SCREEN_COLS`/`KBD_ADDR`/
`RAM_WORDS`，與鍵盤碼 `KEY_NEWLINE(128)`/`KEY_BACKSPACE(129)`/方向鍵(130–133)/
`KEY_HOME/END/PAGE_UP/PAGE_DOWN/INSERT/DELETE/ESCAPE`/`KEY_F1`(141，F1–F12)。

## 行為慣例

- 記憶體映射：`RAM[0..16384)` 一般記憶體、`SCREEN = 16384..24576`（256 列 ×
  512 欄、每列 32 word）、`KBD = 24576`（無按鍵為 0）。
- 指令語意與教材 `CPU.hdl` 一致：**M 的寫入位址用「更新前」的 A、jump 用
  「更新後」的 A**（例 `AM=M-1`、`A=M;JMP`）。
- 畫素：word 的 **bit15（MSB）= 最左邊畫素**，畫素 1 = 黑。

## 測試 / 驗證

```bash
cargo test -p hackemu    # 6 個單元測試（用 hackasm::assemble 產生指令）
bash verify.sh           # 含 headless 交叉檢查：chain.bin → RAM[16] static: 5
```

與 hdl2rs 的 `Computer.hdl` 全閘層模擬交叉驗證：同一支 chain 程式，
兩邊執行後 **RAM[16] = 5** 一致。