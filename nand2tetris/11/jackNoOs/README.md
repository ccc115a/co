# jackNoOs — 不需要作業系統的 Jack 程式範例

這些程式**不依賴 `../12`（或 `../_eda/gen/os_src`）的作業系統**：
不呼叫 `Sys`、`Memory`、`Math`、`Output`、`Screen`、`String`、`Array`
等 OS 類別的服務，每個程式自備自己的 `Sys.jack`（提供開機進入點 `Sys.init`）。

## 為什麼要有這組範例

- 了解「Jack 程式 + OS」與「純 Jack 程式」之間的界線：
  `vm2asm` 的 bootstrap 開機碼會固定呼叫 `Sys.init`，所以**沒有 OS 的程式必須自備 `Sys.init`**。
- 沒有 OS 表示不能使用：
  - `*` / `/`（編譯器會把它們翻成 `Math.multiply` / `Math.divide` 呼叫）；
  - 字串字面值（會翻成 `String.new` / `String.appendChar`）；
  - `Array.new`、`Output.printInt`、`Keyboard.readInt` 等任何 OS 服務。
- 觀察結果的方式：hackemu headless 執行完會印出 `RAM[16] static`，
  各範例把「答案」存在 `Main` 的 static 變數（＝ `RAM[16]`），可直接當 oracle 驗證。

## 程式一覽

| 資料夾 | 計算內容 | 答案（RAM[16]） |
|---|---|---|
| `Sum` | 1＋2＋…＋100 | 5050 |
| `Factorial` | 5!（乘法用「連加法」自己實作，不呼叫 Math） | 120 |
| `Fib` | 費氏數列 F(20) | 6765 |
| `GCD` | 輾轉相除法 gcd(1386, 3213)（用減法，不用 `%`） | 63 |
| `PrimeUnder100` | 小於 100 的最大質數（試除法，`mod` 用連減） | 97 |

> `*` `%` 都會編成 OS 呼叫，因此 `Factorial` 的「乘法」與 `PrimeUnder100` 的
> 「取餘」都用**重複加／減**自製，這是本組範例的重點之一。

## 怎麼跑（工具鏈）

```bash
# 以 Sum 為例：Jack → VM → ASM → HACK → 執行
cd _eda

# jack2vm 以「目錄」為輸入
./target/debug/jack2vm -o /tmp/SumVm ../11/jackNoOs/Sum
# vm2asm 需明確列出 .vm 檔（OS 缺省時順序無所謂；自帶 Sys）＋產生 bootstrap
./target/debug/vm2asm /tmp/Sum.asm /tmp/SumVm/Sys.vm /tmp/SumVm/Main.vm
# hackasm → .hack 文字 + .bin 二進位
./target/debug/hackasm /tmp/Sum.asm /tmp/Sum.hack
./target/debug/hackasm /tmp/Sum.asm /tmp/Sum.bin --bin
# headless 執行 → 看 RAM[16] static
./target/debug/hackemu --headless /tmp/Sum.bin --max 1000000
# → RAM[16] static: 5050
```

更省事的做法：網頁版（`hackserve` 的 `jack.html`）已在「內建程式」下拉加入本資料夾
的五個案例（前端標「無 OS」、`needsOS=false`），選了直接跑；也可用 `jack-run`
自訂多檔貼上（不勾「含作業系統」）跑你自己的無 OS 程式。

## 語法限制（本編譯器）

- 二元運算子只有 `+ - * / & | < > =`（**沒有** `<=` `>=`），比較只能用嚴格形式組出。
- 一元運算子 `-`（neg）與 `~`（not）。
- `PrimeUnder100/GCD.mod` 的取餘是用 `while (r > d) … if (r = d)` 仿出 `%`。