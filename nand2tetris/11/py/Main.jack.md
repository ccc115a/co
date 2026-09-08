# Main.jack 程式說明

一個最簡的 Jack 主程式，示範編譯器的基本輸出：定義一個 `Main` 類別與 `main()` 函式，在其中呼叫一次 `Memory.poke`。

## 概述

`Main.jack` 是 Python 版 Jack 編譯器目錄下的微型測試程式，用來驗證編譯器能否正確編譯「類別宣告、function 宣告、do 陳述句、記憶體寫入呼叫」這幾個基本語法結構。整個程式只有 8 行。

完整內容如下：

```jack
class Main {
    function void main() {

        do Memory.poke(8000,5);

    	return;
    }
}
```

## 類別設計

這個程式展示了 Jack 語言最基本的骨架：

| 元素 | 內容 | 說明 |
|------|------|------|
| 類別 | `class Main` | 標準的主程式類別（與作業規定的 `Main.jack` 命名一致） |
| 子程式 | `function void main()` | `void` 型別的 `function`（非 method），由作業系統直接呼叫 |
| 陳述句 | `do Memory.poke(8000,5);` | 呼叫 OS 常式的 `do` 陳述句 |
| 回傳 | `return;` | 無回傳值的 `return` |

`main()` 之所以是 `function` 而不是 `method`，是因為它是程式的進入點，並非依附在某個物件上呼叫。

## 演算法重點

### Memory.poke 的用途

`Memory.poke(address, value)` 是 Jack OS（第 12 章實作的作業系統）提供的記憶體寫入函式：將 `value` 寫入 RAM 的 `address` 位置。此程式的動作是將 `8000` 這個位址寫入數值 `5`，常用於測試目的——

1. 驗證編譯器的 `do` 陳述句與子程式呼叫正確（`call Memory.poke 2`）
2. 執行後在 VM Emulator 中檢查 RAM[8000] 是否被寫入 5，以確認執行結果

## 編譯器如何處理此程式

以教育版的編譯器（Python 或 C 版）為例，編譯過程如下：

### 1. 語法分析（token 序列）

```
class(T_KEYWORD) Main(T_ID) {        → compile_class()
function(T_KEYWORD) void(T_KEYWORD) main(T_ID) ( )  → compile_subroutine()
{                                    → subroutine body 開始
do(T_KEYWORD) Memory(T_ID) . poke(T_ID) ( 8000(T_NUM) , 5(T_NUM) ) ;
                                     → compile_do() → compile_subroutine_call()
return(T_KEYWORD) ;                  → compile_return()
}                                    → subroutine body 結束
}                                    → class 結束
```

### 2. 符號表操作

- `main` 是 `function`，因此**不會**像 `method` 那樣將 `this` 加入符號表
- `Memory`、`poke` 是類別名稱與函式名稱的識別碼，不需進入符號表
- 無 local 變數，故 `var_count(SK_VAR) = 0`

### 3. 產生的 VM 程式碼

```
function Main.main 0        // 0 個 local 變數
push constant 8000          // 第一個引數：位址
push constant 5             // 第二個引數：值
call Memory.poke 2          // 呼叫（2 個引數）
pop temp 0                  // do：丟棄回傳值
push constant 0             // void return 依慣例回傳 0
return
```

### 4. 執行結果

執行此 VM 後，RAM[8000] 的值應為 5。

## 測試與驗證

```bash
./Compiler.py Main.jack      # 或手動輸入編譯
```

預期產生 `output/Main.vm`，內容如上節所示。開啟 VM Emulator 執行，結束後檢查 RAM[8000] 是否為 5、程式正常終止（stack 不溢出、無無窮迴圈）。

## 延伸討論

此檔案雖極簡，卻涵蓋了 Jack 編譯器最核心的幾個功能：類別宣告（`compile_class`）、function 子程式（`compile_subroutine`）、do 陳述句（`compile_do`）、帶引數的子程式呼叫（`compile_subroutine_call`）、以及無值 return。配合 `Memory.poke` 的可觀察副作用，是驗證編譯器端到端正確性的理想起點。更完整的測試通常會以 nand2tetris 官方 projects/11 的 Square 等專案進行。