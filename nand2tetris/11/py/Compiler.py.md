# Compiler.py 程式說明

Python 版 Jack 編譯器的主程式，負責接收命令列參數、收集待編譯的 `.jack` 檔案，並啟動 Parser 進行編譯。

## 概述

Compiler.py 是整個 Python 版 Jack 編譯器的進入點，也是六個模組中最精簡的一個（僅 24 行）。它的職責是：

1. 解析命令列參數（單一 `.jack` 檔案或目錄）
2. 收集所有待編譯的檔案
3. 依序對每個檔案呼叫 `Parser(infile)` 完成編譯

## 架構總覽

### 呼叫關係

```
Compiler.py → Parser.py
                  ├→ Lex.py
                  ├→ SymbolTable.py
                  ├→ VMWriter.py
                  └→ JackConstant.py
```

此模組是呼叫鏈的頂端。

### 函式結構

| 函式 | 簽名 | 職責 |
|------|------|------|
| `main` | `main()` | 檢查參數個數、收集檔案、逐檔編譯 |
| `get_files` | `get_files(file_or_dir)` | 依輸入型別回傳 `.jack` 檔案清單 |
| `analyze` | `analyze(infiles)` | 對每個檔案印出訊息並建立 Parser |

## 原理

### 命令列使用方式

```bash
./Compiler.py MyFile.jack     # 編譯單一檔案
./Compiler.py ./SomeDir/      # 編譯目錄下所有 .jack 檔案
```

`get_files` 根據輸入是否以 `.jack` 結尾做分流：

| 輸入 | 處理方式 |
|------|---------|
| `foo.jack` | 直接回傳 `['foo.jack']` |
| 其他（視為目錄） | `glob.glob(dir+'/*.jack')` 收集目錄下所有 `.jack` 檔案 |

### 與教材的對應

Nand2Tetris 教材第 11 章的 JackAnalyzer 同樣接受「檔案或目錄」兩種輸入。本版本的 `main()` 相當於教材的 `JackAnalyzer`，但省略了 XML token 輸出功能，專注於直接產生 VM 程式碼。

## 實作細節

### 編譯流程

```python
def analyze(infiles):
    for infile in infiles:
        print("Analyzing", infile)
        Parser(infile)
```

因為 `Parser.__init__` 在建立物件時即完成整個類別的編譯（含開啟與關閉輸出檔），所以此處不需要其他呼叫。每次迴圈建立一個暫時的 Parser 物件，編譯完即被回收。

### 輸出路徑

Parser 會將 `.vm` 輸出到與輸入檔同目錄下的 `output/` 子目錄。例如編譯 `prog/Main.jack` 會產生 `prog/output/Main.vm`。這個輸出目錄的建立邏輯在 `Parser.openout`（見 Parser.py.md）。

## 測試與驗證

```bash
# 進入單元測試目錄
./Compiler.py ../../projects/11/Seven        # 編譯專案目錄
./Compiler.py ../../projects/11/ConvertToBin/ConvertToBin.jack  # 單一檔案
```

產生的 `.vm` 檔案可用 nand2tetris 軟體的 VM Emulator 載入執行，以驗證編譯結果正確。

## 延伸討論

- 此版本是教學用精簡實作，目的在示範模組化架構：Lex（詞法）→ Parser（語法+語譯）→ VMWriter（輸出）。實際作業（projects/11）的編譯器需要正確處理上述全部功能後，才能通過官方測試。
- `main()` 直接呼叫而非以 `if __name__ == '__main__':` 包住，因此 import 此模組時便會執行編譯；這在教學範例中可接受，但正式的 Python 程式建議使用標準寫法。