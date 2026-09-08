# map1.cpp 程式說明

C++ 標準函式庫 `std::map<string,string>` 的基本示範：用「助憶碼 → 位元串」的 dMap 查表，
正是第六章組譯器 `asm.cpp` 中 `dMap` 的原型。

## 概述

- 目的：示範 `map` 的宣告、初始化列表與 `[]` 查表，並印出 `AD` 對應的值。
- 地位：`_basic` 教學系列之一。`asm.cpp` 的三張編碼表（dMap/cMap/jMap）
  與此檔寫法完全同款——看懂這個 13 行的例子，就懂整份組譯器的查表結構。

## 逐行分析

```cpp
#include <iostream>
#include <map>
using namespace std;

map<string, string> dMap {
  {"", "000"}, {"M", "001"}, {"D", "010"}, {"MD", "011"},
  {"A","100"}, {"AM","101"}, {"AD","110"}, {"AMD","111"}
};

int main() {
  cout << "AD=" << dMap["AD"];
}
```

```cpp
map<string, string> dMap { {...}, {...}, ... };
```

- `std::map<K,V>`：鍵值對（key-value）容器，鍵與值都是 `std::string`。
  內部是平衡二元樹（紅黑樹），鍵按字典序排列，查詢 $O(\log n)$。
- **Initializer list（C++11）**：用在大括號 `{}` 列出 8 個鍵值對，是 C++11 才有的語法，
  編譯時須 `-std=c++11`（`_basic/README.md` 即是如此編譯）。
- `dMap["AD"]`：`operator[]` 以鍵查值，回傳 `"110"`。若鍵不存在，
  會「默默建立」一個空字串項目再回傳（這點常是 bug 來源）。

輸出：

```
AD=110
```

`AD` 正是 dest 助憶碼對應的 3 位元（寫入 A 與 D 暫存器）。

## 測試與驗證

```
g++ -std=c++11 map1.cpp -o map1
./map1            # AD=110
```

可自行改鍵（如 `dMap["AMD"]`）驗證其他對應值。

## 延伸討論

- 為什麼用 `map<string,string>` 而非陣列？因為鍵是任意字串（`"D+A"`、`""`），
  無法用整數索引，需靠字串查表——組譯器編碼表正是典型應用。
- 對照 `py/code.py`：Python 版用字典字面值 `{'': '000', ...}`，思維一模一樣，
  只是 C++ 需要明確宣告型別。這是「同一張表、兩種語言」的最佳對照教材。