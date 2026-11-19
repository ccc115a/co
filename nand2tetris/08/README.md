# 第 08 章：VM 翻譯器使用說明

本目錄是 Nand2Tetris 專案 7、8 的 VM → Hack 翻譯器（C 版）。它把 `.vm`
翻譯成 Hack 組合語言 `.asm`，再用官方 CPUEmulator 執行驗證；VMEmulator
則用來直接執行原始 `.vm`，當作 VM 層的對照組。

## 檔案說明

| 檔案 | 用途 |
|------|------|
| `vm2asm.c` | VM 翻譯器原始碼（單檔 C 程式） |
| `build.sh` | 編譯：`gcc -std=c99 vm2asm.c -o vm2asm` |
| `vm2asm` | 編譯產物，翻譯器執行檔 |
| `vm2asm.sh` | 單檔翻譯包裝：`./vm2asm.sh <路徑不含 .vm>` |
| `all2asm.sh` | 一次翻譯本章 11 個測試程式 |
| `test1.vm` / `test1.asm` | 最小範例（`7 + 8`），用來觀察逐條翻譯 |

| 目錄 | 對應習題 |
|------|----------|
| `StackArithmetic/` | 專案 7：`SimpleAdd`、`StackTest` |
| `MemoryAccess/` | 專案 7：`BasicTest`、`PointerTest`、`StaticTest` |
| `ProgramFlow/` | 專案 8：`BasicLoop`、`FibonacciSeries` |
| `FunctionCalls/` | 專案 8：`SimpleFunction`、`NestedCall`、`FibonacciElement`、`StaticsTest` |

每個測試資料夾內的檔案：

| 檔案 | 說明 |
|------|------|
| `Xxx.vm` | 原始 VM 程式（也可能是多個 `.vm`） |
| `Xxx.asm` | 翻譯產物，由 `all2asm.sh` 重建 |
| `Xxx.tst` | CPUEmulator 測試腳本，內含 `load Xxx.asm` |
| `XxxVME.tst` | VMEmulator 測試腳本，內含 `load Xxx.vm` |
| `Xxx.cmp` | 預期輸出，測試腳本用 `compare-to` 比對 |
| `Xxx.out` | 執行後產生的實際輸出（若有） |
| `*.md` | 各檔案的中文說明 |

## 建置與翻譯

```bash
bash build.sh      # 產生 ./vm2asm
bash all2asm.sh    # 翻譯全部 11 個測試，產生各自的 .asm
```

單檔翻譯（專案 7 與單檔的專案 8）：

```bash
./vm2asm.sh MemoryAccess/BasicTest/BasicTest
# 等同於：
./vm2asm MemoryAccess/BasicTest/BasicTest.asm MemoryAccess/BasicTest/BasicTest.vm
```

多檔翻譯（`FibonacciElement`、`StaticsTest`）：

```bash
./vm2asm FunctionCalls/FibonacciElement/FibonacciElement.asm \
    FunctionCalls/FibonacciElement/Sys.vm \
    FunctionCalls/FibonacciElement/Main.vm
```

注意參數順序是「**先輸出檔，再輸入檔**」，和一般編譯器相反；`all2asm.sh`
最後三行即為多檔範例。

翻譯器在輸入兩個以上 `.vm` 時才會自動加入 bootstrap（`SP = 256`、`call
Sys.init 0`）。單檔情況（專案 7 全部、`SimpleFunction`、`NestedCall`）不加入
bootstrap，因為對應的測試腳本會自行初始化記憶體與堆疊。

## 用 CPUEmulator 驗證（專案 7、8 的主要驗收方式）

1. 先執行 `bash all2asm.sh` 產生 `.asm`。
2. 開啟 `tools/CPUEmulator.sh`。
3. 載入 **`.tst` 測試腳本**（不是直接載入 `.asm`）；腳本會自己 `load Xxx.asm`。
4. 按 Run。狀態列出現 `Comparison ended successfully` 表示通過；若失敗，
   將產生的 `Xxx.out` 與 `Xxx.cmp` 對照。

也可以直接從命令列指定測試腳本：

```bash
tools/CPUEmulator.sh MemoryAccess/BasicTest/BasicTest.tst
```

本章測試對照表：

| 習題 | 測試腳本（CPUEmulator） | 翻譯輸出 |
|------|--------------------------|----------|
| 7 | `StackArithmetic/SimpleAdd/SimpleAdd.tst` | `SimpleAdd.asm` |
| 7 | `StackArithmetic/StackTest/StackTest.tst` | `StackTest.asm` |
| 7 | `MemoryAccess/BasicTest/BasicTest.tst` | `BasicTest.asm` |
| 7 | `MemoryAccess/PointerTest/PointerTest.tst` | `PointerTest.asm` |
| 7 | `MemoryAccess/StaticTest/StaticTest.tst` | `StaticTest.asm` |
| 8 | `ProgramFlow/BasicLoop/BasicLoop.tst` | `BasicLoop.asm` |
| 8 | `ProgramFlow/FibonacciSeries/FibonacciSeries.tst` | `FibonacciSeries.asm` |
| 8 | `FunctionCalls/SimpleFunction/SimpleFunction.tst` | `SimpleFunction.asm` |
| 8 | `FunctionCalls/NestedCall/NestedCall.tst` | `NestedCall.asm` |
| 8 | `FunctionCalls/FibonacciElement/FibonacciElement.tst` | `FibonacciElement.asm` |
| 8 | `FunctionCalls/StaticsTest/StaticsTest.tst` | `StaticsTest.asm` |

## 用 VMEmulator 驗證原始 VM（對照組）

VMEmulator 只執行 VM 程式，載入的是資料夾中的 `.vm` 檔，測試腳本要用
`XxxVME.tst`：

```bash
tools/VMEmulator.sh ProgramFlow/BasicLoop/BasicLoopVME.tst
```

或在 VMEmulator 中先 Load Program 選擇含 `.vm` 的資料夾，再 Load Test 選擇
`XxxVME.tst`。它可以逐步觀察堆疊、frame 與各記憶體段，適合檢查 VM 邏輯；
但它不會驗證你寫的翻譯器。

## 關於輸出註解與 VMEmulator 的重要說明

`vm2asm` 會在 `.asm` 中輸出註解，例如：

```asm
// push local 0
@0
D=A
@LCL
...
// ========== File: MemoryAccess/BasicTest/BasicTest.vm ==========
```

這些 `//` 註解對 **CPUEmulator 完全合法**，不會影響 `.tst` 的執行與比對。

**VMEmulator 不能載入 `.asm`，也不能載入 CPUEmulator 的 `.tst`。** 若把
`.asm` 或 `Xxx.tst` 交給 VMEmulator，它會把 `@SP`、`D=A` 等組譯語法當成
VM 指令，於是出現：

```
unknown instruction - @SP
```

或

```
A command cannot start with '@'
```

這是因為檔案類型與模擬器配錯，不是註解本身造成。正確配對如下：

| 要驗證什麼 | 模擬器 | 載入檔案 |
|------------|--------|----------|
| VM 程式邏輯（原始 `.vm`） | VMEmulator | `XxxVME.tst`（內含 `load Xxx.vm`） |
| 翻譯器產生的組合語言 | CPUEmulator | `Xxx.tst`（內含 `load Xxx.asm`） |

若你的工具鏈版本較舊，真的需要「不含註解」的組合語言，可用：

```bash
grep -v '^[[:space:]]*//' Xxx.asm > Xxx.stripped.asm
```

但產生的檔案仍然只能交給 CPUEmulator（或組譯器），不能交給 VMEmulator。

## 常見錯誤

- `Comparison failure`：`.asm` 行為與 `.cmp` 不符，請對照 `Xxx.out` 與
  `Xxx.cmp`，或先從 `test1.vm` 的最小範例開始除錯。
- `unknown instruction - @SP`：把 `.asm` 或 `.tst` 載入 VMEmulator；請改用
  `XxxVME.tst`，或改用 CPUEmulator 載入 `Xxx.tst`。
- `Xxx.asm doesn't exist`：尚未翻譯，先執行 `bash all2asm.sh`，並確認檔名
  與大小寫和 `load` 指令一致。
- `SimpleFunction`、`NestedCall` 的 `.asm` 開頭不是 bootstrap：這是正常的，
  它們是單檔翻譯，且測試腳本自行設定堆疊與 frame。
