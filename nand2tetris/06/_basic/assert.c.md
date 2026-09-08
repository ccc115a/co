# assert.c 程式說明

用 `<assert.h>` 的 `assert` 宏做「程式碼檢查」的最小範例：故意寫一個恆假的斷言，
示範當程式邏輯錯誤時，執行會在那一行立刻中止並印出診斷訊息。

## 概述

- 目的：教學用的斷言示範——`x` 算出 5，卻斷言它等於 4，必然失敗。
- 地位：處在 06 目錄的 `_basic`（C/C++ 基礎）練習區。第六章程式（如 `dasm.c`）
  大量使用 `<assert.h>` 審查「這段理論上不可能錯」的地方，此檔是那寫法的最短樣本。

## 逐行分析

```c
#include <assert.h>

int main() {
  int x=3+2;
  assert(x==4);
}
```

- `int x=3+2`：`x = 5`。
- `assert(x==4)`：判斷 `5==4` 為假 → 連線 `abort()`，印出類似
  `Assertion failed: (x==4), function main, file assert.c, line 5` 的訊息並退出（非零程式碼）。

`assert` 是**前置條件/不變量的檢查工具**：拿來檢查「不該發生的事」。
程式設計者說「這裡一定是對的」，如果錯，表示該處有 bug——與其讓它帶病繼續算下去，
不如當場爆炸。

## 測試與驗證

```
gcc -std=c99 assert.c -o assert
./assert; echo "exit code: $?"   # 期望：assertion failed，exit code 非 0
```

（可用 `-DNDEBUG` 編譯關閉所有 assert。）

## 延伸討論

- 真實專案中 `assert` 是除錯幫手而非錯誤處理：release 版本通常以 `NDEBUG` 移除。
- 第六章後續（`dasm.c`、`vm.c`）用 `assert(0)` 表示「執行到不可能的狀態」，
  那就是把本範例從「檢查資料」延伸成「檢查程式控制流」的用法。