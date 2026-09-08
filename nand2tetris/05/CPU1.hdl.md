# CPU1 晶片說明（CPU 的另一種實作）

這個電路與 `CPU.hdl` **功能完全等價**：同樣的 13 個接腳、同樣的指令週期、同樣的布林式，
只是用了不同的寫法——不靠 `Or16` 匯流排幫位元取名，而是直接用 `instruction[12]`、
`instruction[5]` 這類「單一位元切片」接上邏輯閘。把它當成「殊途同歸」的範例：一份規格允許多種
電路實作，驗證標準是對外的 IN/OUT 行為一致。

## 概述

- 在第五章教材中，CPU1 通常是 CPU 的替代或先期寫法。它處理的機器語言與行為完全同一份規格
  （其註解也直接引用與 CPU.hdl 相同的規格文字）。
- 元件組成完全相同：`ALU`、`ARegister`、`DRegister`、`PC`、`Mux16`、基本閘。
- 被誰使用：可直接替換 `CPU.hdl` 放進 `Computer.hdl`，或單獨拿來通過 `CPU.tst`。

## 介面與規格

與 `CPU.hdl` 一字不差：

```
IN  inM[16], instruction[16], reset;
OUT outM[16], writeM, addressM[15], pc[15];
```

- `outM`、`writeM`：組合邏輯，目前指令當下即有效。
- `addressM`、`pc`：時序邏輯，下一個時間步才提交新值。
- `reset=1`：下一個時間步 PC 歸零。

## 與 CPU.hdl 的差異對照

| 項目 | `CPU.hdl` | `CPU1.hdl` | 效果 |
| --- | --- | --- | --- |
| 控制位元解碼 | `Or16` 匯流排切片：`out[12]=a, out[11]=c1 …` | 直接抓 `instruction[12]`、`instruction[11]`… | 相同，解碼結果一致 |
| `isC` 來源 | 由 `Or16` 的 `out[15]` 取名 | 由 `¬isA` 得來（`isA=¬I15`，再 `Not` 一次） | 相同（`isC = I15`） |
| `a` 位元用法 | 取到信號 `a` 再餵 `Mux16(sel=a)` | 直接 `Mux16(sel=instruction[12])` | 相同 |
| ALU y 選擇 | `Mux16(a=Aout, b=inM, sel=a, out=AorM)` | 同構（`sel=instruction[12]`） | 相同 |
| `addressM` | 直接從 `ARegister` 切片 `out[0..14]=addressM` | `And16(a=Aout, b=Aout, out[0..14]=addressM)` | 相同 |
| `outM` | ALU 輸出並行接 `out=outM` | `And16(a=ALUout, b=ALUout, out=outM)` | 相同 |
| 跳轉正數旗標 | 取名 `gt` | 取名 `g` | 相同（命名不同而已） |

## 實作細節

兩者控制信號的布林式完全一模一樣，只是「食材」的取得方式不同：

```
// CPU1 的解碼：直接用位元切片
Not(in=instruction[15], out=isA);         // isA  = ¬I15
Not(in=isA, out=isC);                     // isC  = I15
And(a=isC, b=instruction[5], out=AluToA); // AluToA = isC ∧ d1
Or(a=isA, b=AluToA, out=Aload);           // Aload = isA ∨ (isC ∧ d1)

Mux16(a=instruction, b=ALUout, sel=isC, out=Ain);
ARegister(in=Ain, load=Aload, out=Aout);

And(a=isC, b=instruction[4], out=Dload);  // Dload = isC ∧ d2
DRegister(in=ALUout, load=Dload, out=Dout);

Mux16(a=Aout, b=inM, sel=instruction[12], out=AorM);
ALU(x=Dout, y=AorM, zx=instruction[11], nx=instruction[10],
    zy=instruction[9], ny=instruction[8], f=instruction[7], no=instruction[6],
    out=ALUout, zr=zr, ng=ng);
```

與 `CPU.hdl` 相同的道理在此依然成立：

- `Mux16(a=instruction, b=ALUout, sel=isC)`——A 指令把「指令本身（立即值）」載入 A；C 指令改拿
  ALU 結果，且只有 `d1=1`（`AluToA=1`）時才真的寫。
- `Aload` 的 `isA` 分支保證 `@x` 一定載入；`addressM` 始終是 A 的低 15 位元（位址暫存器角色）。
- 跳轉電路同一套路：`ng/zr` 由 ALU 給，`g = ¬(ng∨zr)` 自產，`pass = (ng∧j1)∨(zr∧j2)∨(g∧j3)`，
  `PCload = isC ∧ pass`，PC 以 `in=Aout, inc=true, reset=reset` 接線。

以下三處是 CPU1 特別的寫法：

- **雙重 Not 製造 `isC`**：先 `Not(I15)` 得 `isA`，再 `Not(isA)` 得 `isC = I15`。純粹是較早版本的
  習慣，因為邏輯上「A 指令才有即時值、C 指令才動作」用 `isA` 表示比較直覺。等價於 `isC`。
- **`And16(a=Aout, b=Aout, out[0..14]=addressM)`**：`x ∧ x = x`，所以這塊 `And16` 是「恆等
  複製器」——不加任何邏輯，只是把 16 位元匯流排 Aout 導出並裁出低 15 位元當 `addressM`。HDL
  語法規定每個匯流排必須有唯一名稱，這是兩條『指名』常見的偷吃步。
- **`And16(a=ALUout, b=ALUout, out=outM)`**：同上，把 ALU 結果複製一份接到 `outM` 輸出。

## 測試與驗證

CPU1 應能原封不動通過 `CPU.tst` ／ `CPU-external.tst`（連同各自的 `.cmp`）；因為它在可見接腳
（`inM/instruction/reset` → `outM/writeM/addressM/pc`）的行為與 `CPU.hdl` 逐時脈步一致。
測試重點與 `CPU.hdl.md` 所列完全相同：A 指令載入立即數、`D=A`、`D=A-D`、`M=D` 的組合寫入、
`D;JLT` 等跳轉條件、以及 reset 歸零。

## 延伸討論

- **HDL 的「規格－實作」分離**：只要 IN/OUT 規格不變，閘級電路可以任意變形。CPU1 證明同一顆
  邏輯可以用匯流排切片命名（CPU.hdl 作法）或逐位元接線（CPU1 作法）達成，兩者該一起通過相同的
  測試檔，這是驗證等價性的實務方法。
- **設計品味**：CPU.hdl 的 `Or16` 切片版本集中管理「位元命名對照」，日後要改控制位元分工較不
  容易眼花；CPU1 的寫法直接、省一層命名，缺點是位址 12、11、10… 散落在各處，可讀性稍差。
  兩者都是教學上的合法風格。