# hello.cpp 程式說明

C++ 標準輸出串流（`std::cout`）的「Hello World」教科書第一支程式，
示範 C++ 的基本程式骨架與命名空間用法。

## 概述

- 目的：在螢幕印出 `Hello World!`；教具用途大於功能用途，是所有 C++ 課程的起點。
- 地位：`_basic` 系列第一檔，確認開發環境（編譯器、編譯指令）能正常運作。

## 逐行分析

```cpp
#include <iostream>     // 引入輸出串流函式庫（含 std::cout）
using namespace std;    // 省略 std:: 前綴

int main() {
    cout << "Hello World!";
    return 0;
}
```

- `#include <iostream>`：提供 `std::cout`。C 版本相對應的是 `#include <stdio.h>` 的 `printf`。
- `using namespace std;`：讓 `cout` 直接可用，不必寫 `std::cout`。
  方便但會「汙染」名稱空間，大型專案常為此省略不用。
- `cout << "Hello World!";`：`<<` 是**插入運算子**（insertion operator），
  把右手邊字串送到 `cout`（標準輸出）。可以連寫：`cout << "Hello" << 123;`。
- `return 0;`：回傳 0 給作業系統表示程式成功結束。

`cout` 對應 C 語言的 `printf`，好處是型別安全（不用寫 `%d`、`%s`），
`<<` 可以自動根據右邊型別決定輸出格式。

## 測試與驗證

```
g++ -std=c++11 hello.cpp -o hello
./hello            # 印出 Hello World!
```

## 延伸討論

- 第六章主程式 `asm.cpp` 也用 `cout << ...` 印符號表（`symDump`），
  同時用 `printf` 輸出格式化追蹤——C 與 C++ 的常見混用。
- 想印「換行」可把字串改成 `"Hello World!\n"` 或 `cout << "Hello World!" << endl;`。