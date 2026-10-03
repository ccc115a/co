# 30 Jack 編譯器（`lib/jack/jack2vm.js`）

## 用法

[`cli/jack2vm.js`](../cli/jack2vm.js) 吃單檔或整目錄，`.vm` 寫在來源旁 `output/`：

```
node cli/jack2vm.js gen/chain/Main.jack
# → gen/chain/output/Main.vm
```

## 完整範例

輸入 [`Main.jack`](../gen/chain/Main.jack)（`static x` 設成 5，然後空轉）：

```jack
class Main {
    static int x;

    function void init() {
        let x = 5;
    }

    function void loop() {
        while (true) {
        }
    }
}
```

輸出 [`Main.vm`](../gen/chain/vm/Main.vm) 全文（真實產物）：

```
function Main.init 0
push constant 5
pop static 0
function Main.loop 0
label WHILE_EXP0
push constant 0
not
not
if-goto WHILE_END1
goto WHILE_EXP0
label WHILE_END1
```

`let x = 5` 就是「推 5、彈給 static 0」——高階語言的賦值在 VM 層長這樣
（`static x` 是第 0 個 static）。`while (true) {}` 變成 `WHILE_EXP0`／
`WHILE_END1` 標號配 `not`＋`if-goto`＋`goto` 的無窮迴圈
（`true` 恆真，所以是 `0 → not → not` 再判斷，永遠跳不出去）。

## 原理：高階語言只是好寫的 VM 產生器

單遍編完一個 class，需要三樣東西：

1. **詞法**：切出關鍵字、符號、數字、字串、識別字（註解先整份拿掉；
   未知字元直接忽略）。
2. **符號表**：記住每個變數是第幾種、第幾個（`static`／`field`／`arg`／
   `var`，對應 VM 的 `static`／`this`／`argument`／`local`）。
   查表先找 subroutine 層再找 class 層。
3. **遞迴寫碼**：運算式左結合展開（注意：沒有運算子優先序，
   `a+b*c` 就是 `(a+b)*c`，跟參考實作一致）；語句翻成標號＋跳轉。

幾個規定背下來就行：`true`＝`push 0; not`（全 1）；
`do` 丟回傳值（`pop temp 0`）；無值 `return` 補 `push constant 0`。
三種呼叫：`obj.m()` 先把物件推上去（多一個隱含參數）；
`Class.f()` 直接叫；`m()` 補 `push pointer 0`（自己當 this）。
`method` 的 `this` 是隱含第 0 個參數；`constructor` 先 `Memory.alloc`
配 field 空間；陣列讀寫化成「base＋index → `pointer 1` → `that 0`」，
寫入先把右側值暫存 `temp 1`（算位址會弄亂堆疊）。

注意：它只管翻 VM，`Math.*`、`Output.*` 原樣保留，
是下一站（`vm2asm` 直接翻、`vm2riscv` 內聯，見 21／40 章）才處理的。
