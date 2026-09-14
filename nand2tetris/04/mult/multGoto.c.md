# multGoto.c 程式說明：用 goto 撰寫的重複加法乘法

`multGoto.c` 是把 `mult.c` 的 `while` 迴圈**手工改寫成 goto** 的教學版本。它直接把
組合語言的 label（`loop:` / `exit1:`）寫進 C 語法裡，每行後面甚至附上對應的 Hack
組合語言註解。這就是 `multGoto.asm` 的「原文」，兩檔幾乎逐行對照。

## 概述

- 角色：溝通 C 與組合語言的橋樑檔，也是 `doc/c2asm.md`「WHILE 改寫為 goto」一節的
  完整範例。
- 對照檔：`multGoto.asm`（組合語言版）、`mult.c`（正統 while 版）。
- 重點：`while(R0>0)` 等於「`loop:` 標籤 + `if(R0<=0) goto exit1;` + `goto loop;`」。

```c
int main() {
    int R0 = 3; // 測試程式會設，自己不要去設定
    int R1 = 5; // 測試程式會設，自己不要去設定
    int R2 = 0; // @2 M=0,

loop: // (loop)
    if (R0 <= 0) goto exit1; // @0 D=M @exit1 D;JLE
    R2 = R2 + R1;            // @1 D=M @2 M=D+M
    R0 = R0 - 1;             // @0 M=M-1
    printf(...);
    goto loop;               // @loop 0;JMP
exit1:
    printf(...);
}
```

## 原理：while 怎麼變成 goto

編譯器對迴圈的基本轉換是把「繼續條件」倒過來當成「離開條件」：

```
while (C) { body }          if (!C) goto exit;
                            loop:
                                body
                            goto loop;
                            exit:
```

兩個分支對照：

| C 版本的結構 | Goto 版 | 組合語言 |
|------|------|------|
| `while (R0 > 0)` | `if (R0 <= 0) goto exit1;` | `@0 D=M @exit1 D;JLE` |
| `{ R2=R2+R1; R0--; }` | `R2=R2+R1; R0=R0-1;` | `@1 D=M @2 M=D+M`、`@0 M=M-1` |
| `}`（回到條件） | `goto loop;` | `@loop 0;JMP` |
| 迴圈後 | `exit1:` 之後 | 落在 `(exit1)` 之後 |

注意條件被**反向**了：`while (R0>0)` 的「反面」是「R0≤0 就離開」，組合語言只有
「真就跳」的條件跳轉，所以要測反條件。

## 實作細節

- **`goto` 的 label 就是組合語言的 label**：`loop:` / `exit1:` 對應 `(loop)` /
  `(exit1)`。組合語言檔把 C 的「label 冒號」換成「括號 label」宣告，跳轉時 `@loop`
  載入該 label 的位址、`0;JMP` 跳過去。
- **組合語言註解與程式碼並排**：每行 C 後面附的 `@0 D=M`… 正是組合語言版抄下來的
  那一行，讀者可以一行一行把「C → 組合語言」對齊。
- **`// 自己不要去設定`**：R0、R1 由測試程式（`Mult.tst`）從外部寫入 RAM[0]、RAM[1]，
  組合語言的入口程式碼只做 `R2=0 @2 M=0`，不要再初始化 R0/R1，否則測試輸入被覆蓋。

## 執行追蹤（R0=3, R1=5）

| 到 loop 時 R0 | 方向 | 動作 | R2 |
|------|------|------|------|
| 3 | 3>0 → 進 body | R2=0+5, R0=2 | 5 |
| 2 | 2>0 → 進 body | R2=5+5, R0=1 | 10 |
| 1 | 1>0 → 進 body | R2=10+5, R0=0 | 15 |
| 0 | R0≤0 → goto exit1 | 結束 | 15 |

## 測試與驗證

編譯執行對答案：

```
$ cc multGoto.c -o multGoto && ./multGoto
R0=2 R1=5 R2=5
R0=1 R1=5 R2=10
R0=0 R1=5 R2=15
R2=15
```

再與 `multGoto.asm` 在 CPU Emulator 的執行結果（RAM[2]=15）比對。

## 延伸討論

- 實際的 C 編譯器不會真的留 `goto`，而是直接產出條件跳轉機器碼；本範例是
  「人工模擬編譯流程」的教材。
- `mult.c` ↔ `multGoto.c` ↔ `multGoto.asm` 三檔形成教學鏈：高階迴圈 → 低階控制流 →
  真正機器碼。看懂這條鏈，就掌握了本書「寫程式 = 處理資料 + 控制流程」的核心。