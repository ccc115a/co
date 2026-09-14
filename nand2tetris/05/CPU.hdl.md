# CPU 晶片說明（Hack 中央處理器）

這個電路把 ALU、A/D 兩個暫存器與程式計數器 PC 組合起來，執行第 4 章定義的 Hack 機器語言：
每條 16 位元指令進來，先解碼出控制位元，再據以決定 A 暫存器與 D 暫存器存什麼、ALU 算什麼、
要不要寫入記憶體、PC 要 +1 還是跳去別的地方。

## 概述

- 在第五章「電腦架構」中，CPU 是 Computer 的核心運算單元，另外兩個零件是 ROM32K（存放程式）
  與 Memory（資料記憶體）。CPU 只負責「取指令 → 解碼 → 執行」，不含程式存放。
- 由更小的元件組成：`ALU`（第 2 章）、`ARegister`、`DRegister`、`PC`（第 3 章）、若干 `Mux16`、
  `And`、`Or`、`Not`（第 1 章）。
- 被誰使用：`Computer.hdl`。它的 13 個接腳中，`inM` 由 Memory 送來、`outM/writeM/addressM`
  送回 Memory、`instruction` 來自 ROM32K、`pc` 送回 ROM32K。

## 介面與規格

```
IN  inM[16],        // M 的值（M = RAM[A] 的內容），由外部的 Memory 提供
    instruction[16],// 要執行的指令
    reset;          // reset=1 時，下一個時間步 PC 歸零（程式從位址 0 重跑）
OUT outM[16],       // 要寫入 M 的值
    writeM,         // 1 = 本指令要寫入 M
    addressM[15],   // 資料記憶體位址（M 的位址）
    pc[15];         // 下一條指令的位址
```

| 輸出 | 型態 | 語意 |
| --- | --- | --- |
| `outM`, `writeM` | **組合邏輯** | 執行目前指令的當下就立刻出現 |
| `addressM`, `pc` | **時序邏輯** | 受目前指令影響，但要到下一個時間步才提交新值 |

`reset=1` 的優先權高於一切跳轉判斷：即使本指令要跳轉，PC 也是歸零而不是跳到目標。

## 原理

### 指令格式

Hack 有兩種 16 位元指令（第 4 章）：

| 型態 | 格式 | 意義 |
| --- | --- | --- |
| A 指令 | `0xxxxxxxxxxxxxxx` | 把 15 位元的 `x` 載入 A 暫存器（當資料或記憶體位址） |
| C 指令 | `111 a c1..c6 d1 d2 d3 j1 j2 j3` | 運算 + 存去哪 + 是否跳轉 |

C 指令的 13 個控制位元是整個 CPU 的「控制字」，解碼如下：

| 位元 | 名稱 | 控制對象 |
| --- | --- | --- |
| bit 15–13 | `111` | C 指令前綴 |
| bit 12 | `a` | ALU 的 y 輸入：0 → A，1 → M（inM） |
| bit 11–6 | `c1..c6` | 依序是 ALU 的 `zx nx zy ny f no` 六個控制位元 |
| bit 5 | `d1` | 目的地含 A（ALU 結果寫入 A） |
| bit 4 | `d2` | 目的地含 D |
| bit 3 | `d3` | 目的地含 M（啟動 writeM，寫入記憶體） |
| bit 2–0 | `j1 j2 j3` | 跳轉條件：j1=跳若 <0、j2=跳若 =0、j3=跳若 >0 |

### 控制信號的布林式

整顆 CPU 的「神經」就是這幾個布林式：

| 信號 | 布林式 | 意義 |
| --- | --- | --- |
| `isC` | `instruction[15]` | 是不是 C 指令 |
| `isA` | `¬isC` | 是不是 A 指令 |
| `Aload` | `isA ∨ (isC ∧ d1)` | A 暫存器何時允許載入 |
| `Dload` | `isC ∧ d2` | D 暫存器何時允許載入 |
| `writeM` | `isC ∧ d3` | 何時對記憶體寫入 |
| `gt` | `¬(ng ∨ zr)` | ALU 輸出 > 0 |
| `PCload` | `isC ∧ ((ng∧j1) ∨ (zr∧j2) ∨ (gt∧j3))` | PC 何時跳轉 |

### 跳轉條件真值表

| ALU 輸出狀況 | `ng` | `zr` | `gt` | 會跳的欄位 |
| --- | :--: | :--: | :--: | :-- |
| out < 0 | 1 | 0 | 0 | `j1` |
| out = 0 | 0 | 1 | 0 | `j2` |
| out > 0 | 0 | 0 | 1 | `j3` |

## 實作細節

自上而下分成五個區塊：指令解碼、A 暫存器、D 暫存器、ALU、跳轉與 PC。

### 1. 指令解碼（Decoder）

```
Or16(a=false, b=instruction, out[15]=isC,
     out[12]=a, out[11]=c1, out[10]=c2, out[9]=c3,
     out[8]=c4, out[7]=c5, out[6]=c6,
     out[5]=d1, out[4]=d2, out[3]=d3,
     out[2]=j1, out[1]=j2, out[0]=j3);
```

`Or16(a=false, b=instruction)` 把 16 位元指令原封不動地「通過」出去（`0 ∨ x = x`），用意只是借用
它能替每個輸出位元命名（bus slicing）的能力，把 `instruction[15]` 取名 `isC`、`instruction[12]`
取名 `a`…。`false` 到 `Or16` 之外，這個區域不需要任何邏輯閘——控制位元早已在位元裡。

### 2. A 暫存器（同時是資料暫存器與記憶體位址暫存器）

```
Not(in=isC, out=isA);              // isA = ¬isC = ¬I15
And(a=isC, b=d1, out=AluToA);      // AluToA = isC ∧ d1
Or(a=isA, b=AluToA, out=Aload);

Mux16(a=instruction, b=ALUout, sel=isC, out=Ain);
ARegister(in=Ain, load=Aload, out=Aout, out[0..14]=addressM);
```

**「Mux16(a=instruction, b=ALUout, sel=isC, out=Ain)」是全電路最關鍵的一行，它在問：
「A 暫存器此刻的輸入，該拿指令自己，還是拿 ALU 的運算結果？」**

- **A 指令時（isC=0）**：`sel=0`，所以 `Ain = instruction`（整條 16 位元指令）。A 指令的格式是
  `0xxxxxxxxxxxxxxx`，第 15 位為 0，因此整條指令的低 15 位元就是「立即值 x」。此時 `Aload=isA=1`
  必定載入——所以 `@12345` 就把 A 設成 12345。這就是「A 指令載入立即數」。
- **C 指令時（isC=1）**：`sel=1`，所以 `Ain = ALUout`（這個週期 ALU 算出來的值）。但**是否真的
  寫入**還要看 `Aload = isC ∧ d1`：只有當目的地欄位含 A（`d1=1`，例如 `A=A+1`、`AD=D-1`）時 A 才
  更新；若 `d1=0`（例如 `M=D`、`D=D+M`），A 保持原值——這正是需要的行為，因為此時 A 要繼續當
  記憶體位址暫存器。這就是「C 指令載入 ALU 結果」且「只被 `d1` 決定性寫」的兩個層次。

A 的雙重角色：`addressM = Aout[0..14]`，也就是 A 的低 15 位元**永遠**輸出成記憶體位址。執行
`@1000` 之後，下一條指令只要 `M=D`，CPU 就自動把資料寫到位址 1000；而 `A=A+1` 這種式子 CPU 也
把它當「資料暫存器」用。硬體上兩者共用同一顆暫存器，省掉一組位址暫存器。

### 3. D 暫存器

```
And(a=isC, b=d2, out=Dload);
DRegister(in=ALUout, load=Dload, out=Dout);
```

比 A 簡單：D 只有「當資料暫存器」一種用途，A 指令不會動它，C 指令也只有 `d2=1`（目的地含 D）時
才把 ALU 結果寫進去。

### 4. ALU

```
Mux16(a=Aout, b=inM, sel=a, out=AorM);
ALU(x=Dout, y=AorM, zx=c1, nx=c2, zy=c3, ny=c4, f=c5, no=c6,
    out=ALUout, out=outM, zr=zr, ng=ng);
```

- **x 輸入固定是 D**（`Dout`），**y 輸入由 `a` 位元選擇**（`sel=a`）：`a=0` 取 A 暫存器值，`a=1`
  取 `inM`（M = RAM[A]）。例如 `D=A` 時 `a=0`、`D=M` 時 `a=1`。
- 六個控制位元 `c1..c6` 依序對到 ALU 的 `zx, nx, zy, ny, f, no`，因此第 2 章的 ALU 表格直接適用
  （`zy=1,ny=1` 把 y 變成 −1，`f=0` 做 AND，`f=1` 做加法，`no` 決定要不要取反…）。組合語言層的
  `comp` 欄位對照表就等於這六個位元。
- ALU 的 `out` 同時導出兩處：內部當 `ALUout` 用（喂給 Ain/Din/PC 判斷），外部當 `outM` 用（要寫
  給記憶體的值）。`zr/ng` 兩個旗標則供跳轉電路判斷。
- ALU 是純組合邏輯，所以 `outM` 在「執行當下」立刻出現（見下方測試）。

### 5. 跳轉與 PC

```
Or(a=ng, b=zr, out=ngzr);     // ngzr = ng ∨ zr
Not(in=ngzr, out=gt);         // gt   = ¬(ng ∨ zr) → 輸出 > 0
And(a=ng, b=j1, out=passLT);  // passLT = ng ∧ j1
And(a=zr, b=j2, out=passEQ);  // passEQ = zr ∧ j2
And(a=gt, b=j3, out=passGT);  // passGT = gt ∧ j3
Or(a=passLT, b=passEQ, out=passLE);
Or(a=passLE, b=passGT, out=pass);
And(a=isC, b=pass, out=PCload);
PC(in=Aout, load=PCload, inc=true, reset=reset, out[0..14]=pc);
```

- ALU 的三個旗標只有 `ng`、`zr` 直接可用，`gt` 需要自己兜：`gt = ¬(ng ∨ zr)`（不負、不等於零，
  那就是正）。再分別跟 `j1/j2/j3` 相 AND，三個條件「任一成立」（OR）就是本指令的跳轉結果 `pass`。
- `PCload = isC ∧ pass`：只有 C 指令才可能跳，A 指令一律順延。
- PC 的接法：`in=Aout`（跳轉目標 = A 暫存器裡存的位址）、`load=PCload`、`inc=true`（不跳時自動
  `+1`）、`reset=reset`。四種行為一表：

| 狀況 | PC 動作 |
| --- | --- |
| `reset=1` | 下一個時間步 PC=0（優先） |
| 跳轉條件成立（`PCload=1`） | PC = Aout |
| 不跳也不 reset | PC = PC+1 |

### 整體時序（重要）

執行一條指令時，「目前的指令」決定 `outM/writeM`（組合、立即），而未來的狀態——`addressM`、
`pc`、A/D 的新值——在時脈邊緣被暫存，下一個時間步穩定生效。所以真正把「下一條指令位址」交出去
的是 `pc` 的提交，而真正的「資料寫入」要等 `writeM` 與 `outM` 都穩定、且 Memory 收到後的下一個
時間步。整個 fetch→execute 迴圈在 `Computer.hdl` 中閉合（見其說明）。

## 測試與驗證

用第 5 章目錄下的 `CPU.tst`（對照 `CPU.cmp`）在 Hardware Simulator 中逐條喂指令、每個指令
`tick, output, tock, output` 推進一個時脈週期。`CPU-external.tst` 是同一份序列但不印 D 暫存器、
`inM` 固定不變。挑重點走查（值均出自 `CPU.cmp`）：

| 指令（組合語言） | 動作 | `.cmp` 觀察到的結果 |
| --- | --- | --- |
| `@12345` | A 載入立即數 | 一個週期後 `addressM=12345`、`pc=1` |
| `D=A` | D ← A | `DRegister=12345`、`pc=2` |
| `@23456` | A ← 23456 | `addressM=23456` |
| `D=A-D` | D ← A−D | `DRegister=11111`（23456−12345） |
| `@1000` | A ← 1000 | `addressM=1000` |
| `M=D` | RAM[1000] ← D | **tick 當下就出現 `outM=11111`、`writeM=1`**（組合輸出） |
| `@1001` | A ← 1001 | 準備下一個 M 位址 |
| `MD=D-1` | D、M ← D−1 | D=11110；tock 後 `outM=11109`（D 已更新再算一次） |
| `D=D-M`（外設 inM=11111） | D ← D−M | `DRegister=-1` |
| `@14` | A ← 14 | 跳轉目標備妥 |
| `D;JLT` | 若 D<0 跳 14 | `pc` 從 11 跳到 **14** |
| `A=A+1` | A 逐一遞增 | `addressM` 由 999 變 1000 |
| `D+1;JEQ` | 若 D+1=0 跳 21 | D=−1 ⇒ `pc` 跳到 **21** |
| `D=-1` | 把 D 設成 −1 | 準備測跳轉 |
| `D;JGT/JEQ/JGE/…` 兩組七種 | 全面測跳轉 | D 為 −1、0、1 時，只有符合 `ng/zr/gt` 的條件會跳 |
| `reset=1` | 重設 | 一個週期後 `pc=0` |
| `@32767` | 最大位址 | `addressM=32767`、`pc=1` |

觀察重點：CPU 不需要時脈以外的「其他輸入」，僅靠 `instruction` 的位元與 `inM` 就能算出下一個
`pc`。這正是「硬體控制電路」的最小範例。

## 延伸討論

- **指令即控制字（hardwired control）**：每位元的位元圖樣，從 `instruction` 直接當成布林控制信號
  驱动 A/D/ALU/PC。真實 CPU 的「微指令」與「控制單元」走的正是同一條路，差別只在動作更多、有
  微程式 ROM。
- **與真實處理器的對照**：這裡沒有管線、沒有指令快取、位址與資料共用同一顆 A 暫存器，是約 1960
  年代單累加器機器（如 PDP-8）的風格；邊緣觸發、`writeM` 式的記憶體握手則是所有現代 CPU 共通的。
- **可改進處**：A 暫存器同時當位址與資料，讓「M」的讀寫都要先 `@位址`，這是 Hack 刻意簡化；
  進階處理器會把 PC、ALU、記憶體路徑分開以提升吞吐量。