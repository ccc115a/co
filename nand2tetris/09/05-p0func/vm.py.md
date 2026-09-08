# vm.py 程式說明：p0 中間碼的虛擬機（直譯器）

`vm.py` 是 `09/05-p0func/compiler.py` 的配對程式：讀取編譯器產出的四元組 IR 檔，
用一個直譯器（interpreter）逐條執行。兩者合起來就是「編譯 → 執行」的迷你工具鏈，
也是 Nand2Tetris 第 8 章「VM 重點跑在 Hack 硬體上」的 Python 版示範——此處的
「硬體」換成 Python，四元組就是「機器指令」。

## 概述

工具鏈的用法：

```bash
python compiler.py p0/test1.p0 > p0/test1.ir   # 編譯：原始碼 → IR
python vm.py p0/test1.ir                       # 執行：IR → 輸出結果
```

`vm.py` 要處理的三類指令：

| 類別 | 四元組 op |
|------|-----------|
| 算術／邏輯 | `+ - * / <= ==` |
| 控制流 | `label goto if_false func_entry` |
| 函式呼叫 | `param call recv return` |
| 其他 | `=`（賦值）、`print`（輸出）|

它需要正確實作三件事：**變數環境查找**、**跳轉**、以及**函式呼叫的堆疊行為**。

## 架構總覽

`VirtualMachine` 的所有狀態都由建構時初始化：

| 欄位 | 角色 |
|------|------|
| `code` | 四元組清單（整份程式）|
| `ip` | 指令指標（Instruction Pointer）：下一條要執行的指令索引 |
| `environment` | **環境堆疊**：一串字典，每個字典是一個函式（或全域）的區域變數集合 |
| `ret_stack` | **回傳堆疊**：記錄「回到哪一行、回傳值存進哪個變數」|
| `args_buffer` | 參數緩衝區：`param` 暫存、`recv` 取用（FIFO）|
| `labels` | 標籤查找表：`label`/`func_entry` 名稱 → 指令索引 |

頂層函式 `load_ir_from_file(filename)` 負責把純文字的 IR 檔讀成四元組，主程式則以
命令列參數執行 VM。兩者都是教科書式的「讀檔 → 載入 → 迴圈取指執行」。

## 原理

### 環境堆疊：scope 的實作

`environment = [{}]` 一開始只有一個全域環境（第 0 層）。每一個 `call` 都
`environment.append({})` 開一個新層，每一個 `return` 都 `environment.pop()` 銷毀
這層。變數查找固定從**當前頂端**（`environment[-1]`）開始：

```python
def _get_val(self, arg):
    try:    return int(arg)              # 純數字字串 → 直接轉成 int
    except ValueError:                   # 否則當變數名，從當前環境找
        env = self.environment[-1]
        if arg in env: return env[arg]
        else: raise ValueError(...)
```

這套「字典堆疊」正是「區域變數遮蔽全域變數、函式結束自動還原」的簡潔模型，本質上就是
第 8 章 VM 的「區域段 local/argument 由各函式的堆疊框架（call frame）提供」。

### `call`/`return` 的協定（對應 compiler 產出的 IR）

```
呼叫端：                    被呼叫的函式：
  param 10                    func_entry add
  param 20                    recv a
  call  add 2 t1              recv b
                              + a b t0
                              return t0
                              return - - -      ← 隱含 return
```

VM 端 `call` 的執行步驟：

1. 把 **(下一條指令的 ip, 接收變數 t1)** 推進 `ret_stack`。
2. `environment.append({})` 開一個全新的區域環境。
3. `ip = labels[func_name]` 跳到函式入口。

`return` 的執行步驟：

1. 算出回傳值（`arg1` 為 `'-'` 表示無值）；`_get_val` 會代回空值 None。
2. `environment.pop()` 銷毀目前的區域環境。
3. 從 `ret_stack` 取出 `(ret_ip, target_var)`，把 ip 設回 ret_ip；
   若 `target_var != '-'` 就把回傳值寫進**還原後**的目前環境（回到呼叫端那一層）。
4. 若 `ret_stack` 已空，代表是主程式的 `return`，直接 `break` 結束執行。

關鍵細節：回傳值要在 `environment.pop()` **之後**才寫入 `target_var`，否則會寫進
已經要銷毀的區域層。`ret_stack` 因此同時扮演「呼叫歷史」與「控制權返還」的角色，
對應到第 8 章 VM 中保存 return-address 的呼叫框架。

### IP 機器：每條指令就是一個「狀態轉移」

主迴圈：

```python
while self.ip < len(self.code):
    op, arg1, arg2, result = self.code[self.ip]
    ...
```

依 `op` 分派，多數指令執行後 `self.ip += 1`（順序執行），只有 `goto`/`if_false`/
`call`/`return` 會把 ip 設成「非下一條」，實現跳轉。這種「取指（fetch）→ 解碼
（decode）→ 執行（execute）→ 更新 ip」正是所有電腦與 VM 的共通骨架，連 Nand2Tetris
第 5 章的 CPU 也是同一節奏。

## 實作細節

### 算術與邏輯指令

```python
ops = {
    '+': operator.add, '-': operator.sub,
    '*': operator.mul, '/': operator.floordiv,   # 假設整數除法
    '<=': operator.le, '==': operator.eq,
}
```

- `operator` 模組讓「字串運算子 → 函式」的對照一目瞭然，也不需一堆 if/elif。
- `/` 用 `floordiv`：p0 語言刻意做**整數除法**，與 Nand2Tetris 的 VM（整數）一致；
  同時避免浮點數在 bool 判斷上的麻煩。
- `<=`/`==` 的結果是 `bool`，直接存進變數會是 `True/False`，這裡統一轉成 `1/0`
  （Nand2Tetris VM 的 `-1` 也是「真」的慣例則略有不同，見延伸討論），讓 `if_false`
  能單純用「`cond == 0`」判斷。

### 控制流指令

| 指令 | 動作 |
|------|------|
| `goto L` | `self.ip = self.labels[L]` |
| `if_false c L` | `c == 0` 就跳；否則 ip+1 |
| `label` / `func_entry` | 無操作（from `_scan_labels` 預先算好的位置），ip+1 |

`_scan_labels` 在**執行前**先掃一遍所有 `label`/`func_entry`，建立「名稱 → 索引」表。
這是組合器 pass 1 收集符號（symbol table）的直接對應。跳轉只要查表一次，執行迴圈裡
的 `goto` 就是 O(1)。

### 參數傳遞：`param`/`recv` 與緩衝區

```python
elif op == 'param':
    val = self._get_val(arg1)
    self.args_buffer.append(val)
    self.ip += 1

elif op == 'recv':
    val = self.args_buffer.pop(0)   # FIFO：先 param 的先 recv
    self._set_val(arg1, val)
    self.ip += 1
```

`list.pop(0)` 取出並移除第一個元素，實作 FIFO。既 `param` 依呼叫順序推入，`recv` 依
函式定義順序取出，參數序與名稱的對應自然正確。`call` 指令的 `arg2`（參數個數）目前
屬於書面上的記錄，實際執行並未拿來驗證緩衝區長度——這是刻意簡化。

### IR 檔案載入（`load_ir_from_file`）

```python
parts = line.split()          # 以空白切分（自動處理多個連續空白）
if len(parts) != 4:
    print(f"[警告] 第 {line_num} 行格式錯誤 …"); continue
ir_code.append(tuple(parts))
```

- 跳過空行與 `#` 開頭的註解行，讓 IR 檔可以寫備註。
- `split()` 不帶參數會把「任意連續空白」當單一分隔，剛好對應編譯器輸出
  `print(f"{op:<12} {a1:<10} …")` 的對齊格式。
- 欄位數不為 4 時**警告後跳過**而不是崩潰，是刻意選的「寬容」策略。

## 測試與驗證

```bash
cd 09/05-p0func
./test.sh        # 內部等同執行以下指令
python compiler.py p0/test1.p0 > p0/test1.ir && python vm.py p0/test1.ir
python compiler.py p0/test2.p0 > p0/test2.ir && python vm.py p0/test2.ir
```

`test1.p0`（`fn add(a,b){ return a+b; } let sum=add(10,20); print sum;`）預期輸出：

```
===========Executing IR============
>> OUTPUT: 30
==========Execution Finished========
```

`test2.p0`（while 迴圈內以 `add(sum,i)`、`add(i,1)` 累加）預期輸出 `>> OUTPUT: 15`。
若把 `run()` 裡 debug 敘述前的註解打開，可看到每一步的 `IP | 指令 | 目前環境`，適合
拿來一步一步追蹤 call/return 的環境開闢與銷毀。

也可以手寫一個內聯的 IR 檔測試跳轉，例如交錯 `label` 與 `goto` 的無限迴圈只會反覆
執行到打印，驗證 `_scan_labels` 與 `goto` 是否正確。

## 延伸討論

- **環境堆疊 vs. 第 8 章呼叫框架**：`environment`（字典堆疊）+ `ret_stack` +
  `args_buffer` 三者，其實就是 VM 語言中「每一層呼叫框架該有的資料」的拆解版。正式
  VM 把 return address、ARG/LCL 基底指標與參數、區域變數一起打包成一個 stack frame；
  這裡為了教學，用三個 Python 資料結構分開管理，原理百分之百相同。
- **bool 的 1/0 vs. Hack 的 -1**：Hack/VM 用 `-1`（全 1）代表真，本 VM 用 `1`
  代表真，純粹是選擇問題。未來續寫翻譯器時要注意「真值表示法」是平台慣例，不是普世
  常數。
- **已知缺陷能當教材**：`load_ir_from_file` 的 `FileNotFoundError`/`except` 分支呼叫
  `sys.exit(1)`，但 `import sys` 只寫在 `__main__` 區塊內——若把 `load_ir_from_file`
  當成模組函式被外部 import 後呼叫，這裡會拋 `NameError`。修法是把 `import sys` 移到
  檔案頂端。此外 `environment` 是「share-by-reference」，若區域層修改了全域字典本身
  的結構，會比預期更早外洩；執行機制的健壯性也還有強化空間。
- **延伸成彙編**：把 `run()` 裡的算術/跳轉「解釋」換成「輸出 Hack 組合語言」，
  就是第 8 章的 VM 翻譯器（VMTranslator）；把「環境堆疊」換成暫存器與記憶體位址的
  配置，就是一個真正的後端。學生可以由此親眼見識「直譯器」與「編譯器後端」是同一個
  問題的兩個解。