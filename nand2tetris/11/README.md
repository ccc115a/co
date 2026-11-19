# 第 11 章：Jack 編譯器使用說明

本目錄有**兩套彼此獨立的 Jack → VM 編譯器**，輸入與輸出規則相同：

| 實作 | 位置 | 說明 |
|------|------|------|
| Python 版 | `py/` | 模組化：`Lex.py`、`Parser.py`、`SymbolTable.py`、`VMWriter.py`、`Compiler.py` |
| C 版 | `c/jack2vm.c` | 單檔編譯器，由 Python 版改寫而來 |

`c/jack2vm_v1.c`、`jack2vm_v2.c` 是舊版草稿，實際使用 `jack2vm.c`。

| 資料 | 位置 | 是否需要 OS |
|------|------|-------------|
| 教材程式 | `jack/`（`Seven`、`Average`、`Square`、`Pong` 等） | 需要第 12 章的作業系統 |
| 無 OS 程式 | `jackNoOs/`（`Sum`、`Factorial`、`Fib`、`GCD`、`PrimeUnder100`） | 不需要，各程式自帶 `Sys.jack` |

## 共通規則

- 輸入可以是**單一 `.jack` 檔**或**整個資料夾**。
- 傳入資料夾時，會編譯其中所有 `.jack` 檔；C 版只接受副檔名正好是 `.jack`
  的檔案，不會誤編 `.jack.md` 說明檔。
- 輸出固定寫到「輸入路徑旁的 `output/`」：

  | 輸入 | 輸出 |
  |------|------|
  | `jack/Seven/Main.jack` | `jack/Seven/output/Main.vm` |
  | `jack/Square`（資料夾） | `jack/Square/output/Main.vm`、`Square.vm`、`SquareGame.vm` |
  | `jackNoOs/Sum`（資料夾） | `jackNoOs/Sum/output/Main.vm`、`Sys.vm` |

- 多類別程式（例如 `Square`、`Pong`）請傳入**資料夾**，一次產生所有類別的
  `.vm`。
- `jack/` 的程式會呼叫 `Math`、`Output`、`Screen` 等 OS 服務；`jackNoOs/`
  的程式則完全不呼叫 OS，所以不能使用 `*`、`/`、`%`、字串或 `Array.new`
  等會被翻成 OS 呼叫的語法。

## C 版：建置與編譯

```bash
cd c
bash build.sh
```

`build.sh` 的內容是：

```bash
gcc -Wall -Wextra -g \
    -fsanitize=address -fsanitize=undefined \
    jack2vm.c -o jack2vm
```

編譯單一檔案或整個資料夾：

```bash
./jack2vm ../jack/Seven
./jack2vm ../jack/Seven/Main.jack
./jack2vm ../jack/Square
./jack2vm ../jackNoOs/Sum
```

一次編譯教材程式（`all2vm.sh`，內含 `Seven`、`Square`、`Average`、
`ConvertToBin`、`ComplexArrays`；`Pong` 目前註解掉）：

```bash
bash all2vm.sh
```

`all2vm.sh` 必須在 `c/` 目錄內執行，因為它使用 `../jack/...` 相對路徑。

> **先重新編譯再執行。** repo 內附的 `jack2vm` 可能是舊機器建置的
> AddressSanitizer 執行檔；若出現
> `dyld: Library not loaded: ... libclang_rt.asan_osx_dynamic.dylib`，
> 執行 `bash build.sh` 以目前系統的編譯器重建即可。

## Python 版：執行

在 `nand2tetris/11/` 目錄下：

```bash
python3 py/Compiler.py jack/Seven
python3 py/Compiler.py jack/Square
python3 py/Compiler.py jack/Square/Main.jack
python3 py/Compiler.py jackNoOs/Sum
```

或執行 `pyrun.sh`，它會依序編譯 `Average`、`Square`、`Seven`：

```bash
bash pyrun.sh
```

`pyrun.sh` 使用 `python` 指令；若系統只有 `python3`，直接使用上面的
`python3 py/Compiler.py ...` 即可。

## 驗證方式

### 1. 檢查產生的 VM 檔

以 `jackNoOs/Sum` 為例，C 版與 Python 版都應產生：

```
jackNoOs/Sum/output/Main.vm
jackNoOs/Sum/output/Sys.vm
```

```bash
# C 版
cd c && bash build.sh && ./jack2vm ../jackNoOs/Sum

# Python 版（在 nand2tetris/11/）
python3 py/Compiler.py jackNoOs/Sum
```

兩套編譯器的輸出**不保證逐字相同**：Python 版的 label 多為 `label1`、
`label2`，C 版使用 `WHILE_EXP0`、`WHILE_END1` 等名稱，且 Python 版可能在
行尾留下空白。這些差異不影響 VM 語意，也不影響第 08 章 `vm2asm` 的翻譯。

### 2. 完整執行無 OS 範例（已實測）

`jackNoOs/` 的程式自帶 `Sys.init`，可以一路跑到 Hack 機器碼。以下使用
repo 內的 16-bit 工具鏈 `_web_eda16`：

```bash
# 在 nand2tetris/11/ 執行
c/jack2vm jackNoOs/Sum

node ../_web_eda16/cli/vm2asm.js /tmp/Sum.asm \
    jackNoOs/Sum/output/Sys.vm \
    jackNoOs/Sum/output/Main.vm

node ../_web_eda16/cli/hackasm.js /tmp/Sum
node ../_web_eda16/cli/hackemu.js \
    --headless /tmp/Sum.bin --dump 16,1 --max 1000000
```

輸出：

```
RAM[16] static: 5050
```

`vm2asm.js` 必須把該程式的**所有 `.vm` 檔都列出來**；同時提供多個 `.vm` 時
會自動加入 bootstrap（`SP = 256`、`call Sys.init 0`），正好符合
`jackNoOs` 自備 `Sys.init` 的設計。

五個無 OS 範例的實測結果（答案都存在 `Main` 的 static 變數，即 `RAM[16]`）：

| 程式 | 計算內容 | `RAM[16]` |
|------|----------|-----------|
| `Sum` | 1 + 2 + … + 100 | 5050 |
| `Factorial` | 5! | 120 |
| `Fib` | F(20) | 6765 |
| `GCD` | gcd(1386, 3213) | 63 |
| `PrimeUnder100` | 小於 100 的最大質數 | 97 |

### 3. 執行需要 OS 的教材程式

`jack/` 的程式需要第 12 章的 OS。repo 內已有一份可用的 OS VM 位於
`_web_eda16/gen/os_src/output/`，把它排在應用程式前面一起翻譯即可：

```bash
# 在 nand2tetris/11/ 執行
c/jack2vm jack/Seven

node ../_web_eda16/cli/vm2asm.js /tmp/Seven.asm \
    ../_web_eda16/gen/os_src/output/*.vm \
    jack/Seven/output/Main.vm

node ../_web_eda16/cli/hackasm.js /tmp/Seven
node ../_web_eda16/cli/hackemu.js --headless /tmp/Seven.bin --max 1000000
```

`Seven` 會把 `1 + 2 × 3 = 7` 輸出到模擬螢幕左上角；上面的 `hackemu`
headless 指令只驗證程式能執行完，實際畫面要用圖形化模擬器觀察。
`Square`、`Pong` 等互動程式需要鍵盤／畫面，較適合用圖形化的 VMEmulator
或 `_rust_eda/hackserve` 網頁版執行。

> 若用官方 VMEmulator，請載入「應用程式 `.vm` ＋ OS `.vm`」所在資料夾；
> VMEmulator 只吃 `.vm`，不要載入 `.asm` 或 CPUEmulator 的 `.tst`。

## 常見錯誤

| 訊息 / 症狀 | 原因與解法 |
|-------------|------------|
| `dyld: Library not loaded: ... libclang_rt.asan_osx_dynamic.dylib` | 舊的 ASan 執行檔與目前系統不相容；在 `c/` 執行 `bash build.sh` 重建。 |
| `Compiler Error: Expected 'class', but got 'Main'` | 舊版 C 編譯器把 `Main.jack.md` 也當成 `.jack` 讀入；本版已修正，重新 `bash build.sh` 即可。 |
| Python 版 `FileNotFoundError` | 路徑不對。請在 `nand2tetris/11/` 下使用 `jack/Seven` 這類相對路徑。 |
| 找不到 `output/*.vm` | 確認輸入是 `.jack` 檔或資料夾；輸出會放在該輸入旁邊的 `output/`，不是目前工作目錄。 |
| `unknown instruction - @SP`（VMEmulator） | 把 `.asm` 或 CPU 的 `.tst` 載入 VMEmulator。VMEmulator 只能載入 `.vm`／`*VME.tst`。 |
| `jackNoOs` 編譯出的程式執行失敗 | 無 OS 範例不能使用 `*`、`/`、`%`、字串或任何 OS 類別；乘法／取餘要用加減法自製。 |
