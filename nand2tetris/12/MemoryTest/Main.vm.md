# MemoryTest/Main.vm 程式說明

`Main.vm` 是 `MemoryTest/Main.jack` 編譯出的 VM 碼（126 行）。它演示了「直接記憶體存取 API（`peek/poke`）」與「物件化陣列 API（`Array.new/dispose`）」在 VM 層的長相。

## 概述

- 進入點：`function Main.main 4`（`temp、a、b、c` 四個 local）。
- 結構：`call Memory.poke 2`、`call Memory.peek 1`、`call Array.new 1`／`Array.dispose 1`、以及陣列元素存取的 `pointer`/`that` 搬移。
- 對 VM 翻譯器來說，這是「呼叫 OS 服務 + 指標算術」的綜合測試。

## 架構總覽

核心幾段：

```
push constant 8000; push constant 333
call Memory.poke 2; pop temp 0        ; Memory.poke(8000, 333)
push constant 8000
call Memory.peek 1; pop local 0        ; temp = Memory.peek(8000)
push constant 8001; push local 0; push constant 1; add
call Memory.poke 2; pop temp 0         ; poke(8001, temp+1)
```

陣列段則與 `ArrayTest/Main.vm` 相同：`a = Array.new(3)` →
`push constant 3; call Array.new 1; pop local 1`；`a[2] = 222` 的 `that` 模式；但送往 RAM 時改用 `call Memory.poke` 而非直接 `pop that 0`。

## 原理

- **peek 的返回值**：`Memory.peek` 以 `that 0` 取 `memory[address]` 後回傳，`call` 的返回值停在堆疊頂端，`pop local 0` 收進 `temp`。
- **poke 的參數順序**：`push 8000; push 333; call Memory.poke 2`——`argument 0` 是位址、`argument 1` 是值，與 `Memory.jack` 的 `poke(address, value)` 對齊。
- **temp+1**：`push local 0; push constant 1; add` 把暫存值加 1 再當第二參數。

## 實作細節

| Jack | VM |
|------|----|
| `do Memory.poke(8000, 333)` | `push constant 8000; push constant 333; call Memory.poke 2; pop temp 0` |
| `let temp = Memory.peek(8000)` | `push constant 8000; call Memory.peek 1; pop local 0` |
| `let a = Array.new(3)` | `push constant 3; call Array.new 1; pop local 1` |
| `a[2] = 222` | `push constant 2; push local 1; add; push constant 222; pop temp 0; pop pointer 1; push temp 0; pop that 0` |
| `do Memory.poke(8002, a[2])` | 先讀 `a[2]`（`that 0`）作為值，再 `push constant 8002 … call Memory.poke 2` |
| `do a.dispose()` | `push local 1; call Array.dispose 1; pop temp 0` |

## 測試與驗證

`MemoryTest.tst` 執行一百萬個 `vmstep` 後比較 RAM[8000..8005] 與 `MemoryTest.cmp`（333 334 222 122 100 10）。載入方式：先編譯自己的 `Memory.jack → Memory.vm` 與 `Array.jack → Array.vm`，與 `Main.vm` 同夾載入，再開 `.tst`。

## 延伸討論

`MemoryTest` 與 `ArrayTest` 的 `Main.vm` 幾乎只差在「結果寫法：直接 `pop that 0` vs `call Memory.poke`」。這恰好對照 OS 設計的兩條思路：`peek/poke` 是「給所有程式看的裸記憶體」介面，`Array` 則把同一片記憶體「物件化」。VM 層的差別就只有一次 `call` 與 `pop temp 0`，顯示物件導向只是語法糖衣、底層全是位址。練習時可試著──把 `ArrayTest/Main.vm` 的 `pop that 0` 全換成 `call Memory.poke`──它就會變成跟 `MemoryTest/Main.vm` 幾乎同構的程式。