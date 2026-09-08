# exp.py 程式說明：以 EBNF 文法隨機生成運算式

這個程式用遞迴隨機生成「合法的數學運算式」字串，例如 `x + y * 2` 或 `(a - b) / 3`。
它把文法規則寫成程式的控制結構，是從「文法理論」通往「語法分析」的橋樑。

## 概述

上一章的 `anbn.py` 用兩條規則生成了最簡單的一類字串；本章把文法擴大成「算術運算式」，
並用正規表示法的簡寫──**EBNF**（Extended Backus-Naur Form）──描述它：

```
exp    → term (('+' | '-') term)*     ← 本程式用的是二元版，見下
factor → number | variable            ← 最基本的單元
```

`exp.py` 採用的等效版本（程式內以隨機分支實作）是：

```
exp → exp op exp   |   ( exp )   |   factor
op  → + | - | * | /
factor → number | variable
```

程式逐一閱讀文法規則，把它們變成「以隨機選擇驅動的遞迴函式」。每次執行輸出都不一
樣，但保證是文法合法的運算式。學生可以藉此體會：**有一個文法在手，生成合法字串就
只是照規則填空**。

## 架構總覽

整個程式只有一個函式加上範例主程式：

| 元素 | 角色 |
|------|------|
| `generate_expression(current_depth, max_depth)` | 隨機生成一個運算式字串 |
| 區域變數 `variables`（`x,y,z,a,b`）| 可能出現的變數名稱（終結符）|
| 區域變數 `operators`（`+ - * /`）| 可能的二元運算子（終結符）|
| 主程式 | 以不同 `max_depth` 各印出幾筆結果 |

參數 `current_depth` 記錄目前已幾層、`max_depth` 設定允許的最大層數，兩者搭配控制
「運算式可以長到多複雜」。

## 原理

### 用深度控制終止

無限套用 `exp → exp op exp` 會讓字串永無止境，所以生成器需要**終止條件**。這裡用
兩個條件：

1. `current_depth >= max_depth`：已經到達最大深度，必須停止。
2. `random.random() < 0.4`：即使還沒到最深，仍有 40% 機率提前終止。

這兩個條件確保遞迴一定結束，同時讓生成的運算式大小有變化（不會每次都長得一樣）。有
任何一個成立，就落到基底情況，產生一個最簡單的單元（factor）。

### 選擇：往深處長，還是只包括號？

未到終止條件時，程式隨機二選一：

- `binary`：`E op E`，遞迴生成左右兩個子運算式，中間夾一個運算子。
- `parentheses`：`(E)`，只生成一個被括號包住的內部運算式。

`binary` 讓運算式擴張得又快又寬（一次長兩個子樹），`parentheses` 只加一層殼，用來
示範「括號是可合法穿插的結構」。兩者都是文法允許的規則，只是生成時的情境不同。

## 實作細節

### 基底情況（depth 檢查）

```python
if current_depth >= max_depth or random.random() < 0.4:
    if random.random() < 0.6:      # 60% 抽到數字
        return str(random.randint(1, 100))
    else:                          # 40% 抽到變數
        return random.choice(variables)
```

先用 `or` 合併「不得再深」與「隨機喊停」兩個條件；一旦進到基底，再以 60/40 的機率在
數字與變數之間挑一個當作 factor。注意回傳的是**字串**，這樣最後拼接時才能直接當成
運算式文字。

### 遞迴步驟（binary 與 parentheses）

```python
if choice == 'binary':
    op = random.choice(operators)
    left_expr  = generate_expression(current_depth + 1, max_depth)
    right_expr = generate_expression(current_depth + 1, max_depth)
    return f"{left_expr} {op} {right_expr}"

elif choice == 'parentheses':
    inner_expr = generate_expression(current_depth + 1, max_depth)
    return f"({inner_expr})"
```

重點：

- `current_depth + 1` 傳給子呼叫：表示下一層的深度比現在多 1，這是讓 `max_depth` 能
  發揮作用的關鍵。
- `binary` 分支對左右子樹**各自**遞迴，恰好對應文法中 `exp op exp` 的兩個 `exp`。
- 括號分支不引入運算子，只是在結果外面套一圈 `(`……`)`。
- 因為回傳的都是字串，外層用 f-string 直接拼，並在運算子兩側留空白，讓輸出易讀。

## 測試與驗證

直接執行：

```bash
python exp.py
```

會先印出 5 個 `max_depth=3` 的運算式，再印出 3 個 `max_depth=5` 的運算式。由於隨機
性，每次結果都不同，例如可能出現：

```
--- 隨機生成複雜度 <= 3 的運算式 ---
運算式 1: a - 20 * x
運算式 2: (z / b)
運算式 3: (42) * (25 / y)
...
```

「驗證」的意義在於：所有輸出都必須能被第 3 章的 `expParser.py` 成功解析。可以試著
手動檢查每個運算式的括號是否成對、運算子是否都夾在兩個 operand 之間。

## 延伸討論

- **EBNF vs. 背後的巢狀結構**：二元運算式用 `exp op exp` 描述時，自然會長成「樹」。
  若把它改成 EBNF 的 `term (('+'|'-') term)*`，文法會更貼近「左結合」的實際計算順序
  （見 03-expParser 的解說）。
- **為什麼要刻意留下 40%／60% 的隨機比例？** 這純粹是「糖」——讓生成結果多樣化，
  避免每次都長到最滿。真實的編譯器生成程式（如測試資料產生器）也會用類似的手法控制
  深度與分支機率。
- **和 anbn.py 的關聯**：anbn 的 `S → a S b` 是一支「單一類型的遞迴」，這裡的
  `exp → exp op exp` 則一次長出兩個子樹。樹的形狀從「鏈狀」變成「分叉」，這正是未來
  語法樹（parse tree）的形狀，也是下一章解析器的直覺來源。