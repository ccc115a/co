# VMWriter.py 程式說明

Jack 編譯器的 VM 程式碼產生器，將編譯結果輸出為符合 Hack VM 規範的指令。

## 概述

VMWriter.py 是 Parser 與輸出的橋樑。它抽象了 VM 檔案的開啟、關閉與各種指令的格式化，讓 Parser 只需要呼叫語意清楚的輔助方法（如 `push_const(5)`、`write_return()`），不必自行組字串。

## 架構總覽

### 呼叫關係

```
Parser.py → VMWriter.py
```

### 公開介面與產生的 VM 指令

| 方法 | 簽名 | 產生的 VM 指令 |
|------|------|--------------|
| `openout` | `self.openout(file)` | 開啟輸出檔（`.jack` 副檔名改為 `.vm`） |
| `closeout` | `self.closeout()` | 關閉輸出檔 |
| `write_push` | `write_push(segment, index)` | `push segment index` |
| `write_pop` | `write_pop(segment, index)` | `pop segment index` |
| `write_arithmetic` | `write_arithmetic(op)` | `op`（如 `add`、`sub`） |
| `write_label` | `write_label(label)` | `label label` |
| `write_goto` | `write_goto(label)` | `goto label` |
| `write_if` | `write_if(label)` | `if-goto label` |
| `write_call` | `write_call(name, num_args)` | `call name num_args` |
| `write_function` | `write_function(name, num_locals)` | `function name num_locals` |
| `write_return` | `write_return()` | `return` |
| `write_vm_cmd` | `write_vm_cmd(cmd, arg1='', arg2='')` | `cmd arg1 arg2`（通用輸出） |

### 輔助方法（讓 Parser 更易讀）

| 方法 | 等價於 |
|------|--------|
| `push_const(val)` | `write_push('constant', val)` |
| `push_arg(arg_num)` | `write_push('argument', arg_num)` |
| `push_this_ptr()` | `write_push('pointer', 0)` |
| `pop_this_ptr()` | `write_pop('pointer', 0)` |
| `pop_that_ptr()` | `write_pop('pointer', 1)` |
| `push_that()` | `write_push('that', 0)` |
| `pop_that()` | `write_pop('that', 0)` |
| `push_temp(temp_num)` | `write_push('temp', temp_num)` |
| `pop_temp(temp_num)` | `write_pop('temp', temp_num)` |

## 原理

Hack VM 指令分為四類，本模組即依此設計：

| 類別 | 指令格式 | 對應方法 |
|------|---------|---------|
| 記憶體存取 | `push segment index` / `pop segment index` | `write_push` / `write_pop` |
| 算術/邏輯 | `add` `sub` `neg` `eq` `not` … | `write_arithmetic` |
| 流程控制 | `label` `goto` `if-goto` | `write_label` / `write_goto` / `write_if` |
| 函式呼叫 | `call` / `function` / `return` | `write_call` / `write_function` / `write_return` |

`pointer 0` 是 Hack VM 的 THIS 暫存器，`pointer 1` 是 THAT 暫存器；`temp` 段則為通用的 8 個暫存器。這些輔助方法將語意清晰化，避免在 Parser 中寫死段名與索引。

## 實作細節

### 輸出格式

`write_vm_cmd` 統一以空格分隔參數輸出：

```python
def write_vm_cmd(self, cmd, arg1='', arg2=''):
    self._outfile.write(cmd+' '+str(arg1)+' '+str(arg2)+'\n')
```

指令、參數、參數2之間各有空格，即使 `arg2` 為空也會輸出尾端空格（如 `add '' ''` 實際寫為 `add  `），Hack VM 翻譯器可容忍行尾空白，因此不影響執行。

### 輸出檔命名

`openout` 將副檔名 `.jack` 替換為 `.vm`。Parser 負責在工作目錄下建立 `output/` 子目錄，此模組只負責開啟檔案。

### 與 C 版的對照

| 功能 | VMWriter.py | jack2vm.c |
|------|-------------|-----------|
| 記憶體存取 | `write_push` / `write_pop` | `vm_writer_write_push` / `vm_writer_write_pop` |
| 函式呼叫 | `write_call` / `write_function` / `write_return` | 同名 C 函式加上 `vm_writer_` 前綴 |
| 輔助方法 | `push_const` 等 9 個方法 | 僅有 `vm_push_variable` / `vm_pop_variable` 兩個輔助，其餘在 Parser 中直接寫段名 |

## 測試與驗證

可在 Python 互動環境中單獨測試：

```python
from VMWriter import VMWriter
vm = VMWriter()
vm.openout('test.jack')   # 建立 test.vm
vm.push_const(7)
vm.push_const(2)
vm.write_arithmetic('add')
vm.write_input...         # 其餘指令
vm.closeout()
```

開啟 `test.vm` 可在 VM Emulator 中執行驗證。

## 延伸討論

VMWriter 刻意保持「無狀態」設計——除了輸出檔外不記錄任何編譯狀態，所有決策（段名、索引、標籤）都由 Parser 決定。這種分層使得測試容易：對 VMWriter 做單元測試時只需檢查輸出的字串格式正確。