# py/asm.py Python 組譯器說明

Python 寫的精簡版組譯器：把一段串列的 Hack 組合語言（a list of strings）逐行翻譯成
16 位元機器碼字串。它刻意只做「字面翻譯」，沒有符號表、沒有 label、沒有變數位址配置，
目的是以最少程式碼展示 A/C 指令的編碼構造，方便與 `asm.cpp` 對照。

## 概述

- 輸入：Python 函式 `assemble(assembly_code)`，接收 list-of-str 的組合語言。
- 輸出：list-of-str 的 16 位元機器碼（如 `"1110110000010000"`）。
- 依賴 `py/code.py` 的 `Code` 類別：查表工作全部交給 `Code.dest/comp/jump`。
- 地位：第六章的「教學版」組譯器。相較 `asm.cpp` 少了 `parse()`（註解/空白處理）、
  `symMap`（符號表）、兩趟掃描，結構因此清爽很多。

## 架構總覽

| 函式 | 職責 |
|------|------|
| `parse_c_instruction()` | 把 `dest=comp;jump` 拆成三塊（缺的補空字串） |
| `translate_a_instruction()` | `@n` → `'0' + 15 位元` |
| `translate_c_instruction()` | 組合 `'111' + comp + dest + jump` |
| `assemble()` | 主迴圈：過濾空行與註解，分派 A/C 指令 |
| 檔尾主程式 | 範例：組譯 `RAM[0]=2+3` 並印出 原始與機器碼 的對照 |

全域變數 `code = Code()` 一旦建立，`translate_c_instruction` 內 `global code` 只是
明確宣告讀取（Python 慣例），好處是查表物件重複使用。

## 原理

C 指令的唯一構造難點是**三欄位不必然同時齊全**：`D=A` 沒有 jump、`0;JMP` 沒有 dest、
`D=D+A` 兩者皆無。`parse_c_instruction` 用兩個 if 分兩次切，把「沒有的欄位」留空字串：

```python
def parse_c_instruction(instruction):
    comp = dest = jump = ''
    if '=' in instruction:          # dest=comp
        dest, comp = instruction.split('=')
    else:
        comp = instruction
    if ';' in comp:                 # 再拆 comp;jump
        comp, jump = comp.split(';')
    return dest, comp, jump
```

注意 `comp` 是**接著再被分**的：`D=A;JGT` 會先拆成 `dest='D'`、`comp='A;JGT'`，
第二個 if 再拆出 `comp='A'`、`jump='JGT'`——一次處理兩種文法，三欄一次到位。

A 指令用 `format` 補零：

```python
binary_address = format(address, '015b')   # 15 位元二進位，前面補 0
return '0' + binary_address                # 再補 C/A 區別位元
```

`format(2,'015b')->'000000000000010'`，開頭加上 `'0'` 變成完整的 16 位元。

## 實作細節

`assemble()` 主迴圈注意「先 strip 再判斷」：

```python
for line in assembly_code:
    line = line.strip()
    if not line or line.startswith('//'):
        continue              # 空行或註解行：跳過
    if line.startswith('@'):
        machine_code.append(translate_a_instruction(line))
    else:
        machine_code.append(translate_c_instruction(line))
```

以 `@` 開頭 → A 指令；否則 → C 指令。`translate_c_instruction` 把三塊查表結果
依書上編排順序一次接好：

```python
comp_binary = '111' + code.comp(comp) + code.dest(dest) + code.jump(jump)
```

這個 `'111' + comp(7) + dest(3) + jump(3)` 就是第 4 章 C 指令的位元佈局。

檔尾的範例 `assembly_code`：`@2 / D=A / @3 / D=D+A / @0 / M=D`，
正是 `add.asm`（`RAM[0]=2+3`）去掉註解後的內容。執行結果：

```
1110110000010000	D=A     （0xec10）
1110000010010000	D=D+A   （0xe090）
1110110000010000	...
```

與 `asm.cpp` 對 `add.asm` 的輸出逐字一致——兩個語言實現同一份編碼表，交叉驗證了正確性。

## 測試與驗證

```
cd 06/py
python3 code.py     # 印出 Code 類別的各項查表結果
python3 asm.py      # 印出 add 程式的組譯對照表
```

`asm.py` 只處理**常數 A 指令**（`@2` 直接 int）。若餵入 `@i` 這種符號，`int()` 會丟
`ValueError`——這正是教學取捨：符號表那段留給 C 版與教科書作業練習。

## 延伸討論

- **與 asm.cpp 對照**：Python 版把「查表」抽成 `Code` 類別（等同 C 版的 dMap/cMap/jMap）、
  把「拆解文法」寫成 `parse_c_instruction`（等同 C 版兩個 `sscanf`）、
  把「組字串」寫成一列三跳接（等同 C 版 `sprintf("111%s%s000")`）。
  差異在 Python 版沒有兩趟掃描與符號表——改成 `asm.py` 的練習方向之一：
  加上 `symbol` 字典與 pass1/pass2，就變成完整組譯器。
- **擴充方向**：支援 multi-file 組譯、加上 label 追蹤、輸出 `.hack` 文字檔，
  甚至改用 `Code` 類別加入 `A_X`/`M_X` 全表（見 code.py 的討論），都可對齊 `asm.cpp`。