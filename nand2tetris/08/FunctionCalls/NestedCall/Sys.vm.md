# Sys.vm 程式說明（NestedCall 測試）

這是 NestedCall 測試集的核心檔案 `Sys.vm`，包含三個函式：`Sys.init`、
`Sys.main`、`Sys.add12`。它設計用來測試「call 中再 call」：呼叫者推框架、
被呼叫者消耗參數再回傳，層層嵌套，並驗證 local 變數不會被巢狀呼叫「弄壞」。

## 概述

- 目的：完整測試第 8 章的 call/return 堆疊框架協定：
  1. `Sys.init` → call `Sys.main`（第一次嵌套）。
  2. `Sys.main` → call `Sys.add12`（第二次嵌套）。
  3. 驗證 `function` 會把 local 初始化成 0（測試腳本先把 local0、local4
     設為 -1，本程式刻意不去動它們，以確認 function 指令覆寫為 0）。
  4. 驗證 THIS/THAT 不被呼叫干擾（三個函式各自設定不同的 THIS/THAT）。
- 三個函式的 C 語言對應：

```c
void Sys_init(){                 // 不 return，無窮迴圈
    THIS=4000; THAT=5000;
    temp1 = Sys_main();          // 回傳 456 → temp 1
    while(1);
}
int Sys_main(){                  // 5 個 local
    THIS=4001; THAT=5001;
    local1=200; local2=40; local3=6;
    temp0 = Sys_add12(123);      // 135 → temp 0
    return local0+local1+local2+local3+local4;
}                                // = 0 + 200 + 40 + 6 + 0 = 456
int Sys_add12(int x){
    THIS=4002; THAT=5002;
    return x + 12;               // 135
}
```

## 原理：巢狀框架如何保護狀態

每做一次 `call`，翻譯器把「retAddr、LCL、ARG、THIS、THAT」五個值壓上堆疊，
設新 ARG/LCL 後跳到被呼叫者；被呼叫者的 return 再依序反推。

於是當 `Sys.main` 呼叫 `Sys.add12` 時，`add12` 的框架疊在 `main` 的框架
上面：`add12` 的 local/argument 是一塊全新的堆疊區，它任何 push/pop 都不
會碰到 `main` 的 local（因為那些在更低的位址、以 main 自己的 LCL 定址）。
`return` 時把 `main` 的 LCL/ARG/THIS/THAT 復原，main 繼續執行。

**THIS/THAT 測試點**：三個函式各把 THIS/THAT 設成不同值（4000/5000、
4001/5001、4002/5002）。若 return 忘了保存 THIS/THAT，函式呼叫回來後這些
暫存器會被 `add12` 的 4002/5002 汙染；此測試檢查 call 前後暫存器都被正確
保存，即是驗證框架的「保存環境」功能。

**local 0 測試點**：測試腳本先往 local0、local4 塞 -1，才開始執行；
`function Sys.main 5` 會把 5 個 local 全部重設為 0，所以最後
`local0+...+local4 = 0+200+40+6+0 = 456`。（若是連 local0 都是 -1，
就代表 function 沒把 local 初始化。）

## 實作細節（逐段解說）

### Sys.init（第 7–15 行）

```
function Sys.init 0
push constant 4000
pop pointer 0         // THIS = 4000
push constant 5000
pop pointer 1         // THAT = 5000
call Sys.main 0       // 呼叫巢狀主角
pop temp 1            // 回傳值 456 → temp1（RAM 6，即 5+1）
label LOOP
goto LOOP             // 無窮迴圈，永不 return
```

### Sys.main（第 23–46 行）

```
function Sys.main 5   // 推 5 個 0，建 local0..4
push constant 4001 → pop pointer 0
push constant 5001 → pop pointer 1
push 200 → pop local 1
push 40  → pop local 2
push 6   → pop local 3
push constant 123
call Sys.add12 1      // 傳 1 個參數
pop temp 0            // 135 → RAM 5
push local 0..4（五個）
add × 4               // 0+200+40+6+0 = 456
return
```

### Sys.add12（第 49–57 行）

```
function Sys.add12 0
push constant 4002 → pop pointer 0
push constant 5002 → pop pointer 1
push argument 0      // 123
push constant 12
add                  // 135
return
```

## 測試與驗證

1. 三檔合一翻譯：`./vm2asm NestedCall.asm Sys.vm`（此測試只需 Sys.vm 當輸入）。
2. VM Emulator 執行；或分段觀察每一層 return 後的堆疊與暫存器。
3. 檢查要點：
   - `call` 後到 return 前，`RAM[LCL]`、`RAM[ARG]` 各自是有效的新框架。
   - `Sys.main` 的 5 個 local 都是 0/200/40/6/0。
   - `Sys.main` return 回傳 456；`Sys.init` 把它 pop 到 temp1。
4. 對照官方 `NestedCall.cmp`（tst 檔另會設定 first call 前環境）。

## 延伸討論

- 「call 中 call」之所以能成立，全靠堆疊這條「LIFO」線：較晚的框架位址
  較高，較早的框架位址較低，`return` 逆序復原。堆疊就是呼叫鏈（call stack）
  的實體。
- THIS/THAT 的保存說明框架協定為何要推 5 個值：如果不保存，函式呼叫會像
  銹帶一樣把全域狀態一個接一個汙染掉。真實 CPU（x86 等）也有相同的
  「被呼叫者保存/呼叫者保存」約定，只是劃分方式不同。