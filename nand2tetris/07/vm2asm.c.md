# vm2asm.c 程式說明

這是作者自行實現的 VM → Hack 組合語言翻譯器（VM Translator），對應 Nand2Tetris 第 7 章的專案。「從 Nand 到 Tetris」整條工具鏈中，它扮演「把高階語言編譯出的 VM 中間碼，降級翻譯成 Hack Computer 的組合語言」的角色。它是一個 Linux/macOS 命令列程式，接受一個輸出檔名與一個或多個 .vm 檔，輸出可供 Hack Assembler（第 6 章）組譯成 .hack 的組合語言原始碼。

## 概述

- **輸入**：一或多個 .vm 檔，內容為 VM 指令（push、pop、add、sub、eq、function、call、return……）。
- **輸出**：一個 .asm 檔，含別名為 `SP`、`LCL`、`ARG`、`THIS`、`THAT`、`R13`、`R14` 的 Hack 組合語言指令。
- **地位**：第 7 章只要求翻譯「堆疊算術與記憶體存取」兩類指令；本程式更進一步把第 8 章的 `function`/`call`/`return`/`label`/`goto`/`if-goto` 也全部實作了，等於是第 7、8 章合併的翻譯器。
- **被誰使用**：後續章節（Jack 編譯器）產生的 .vm 檔，就是用這種翻譯器轉成 Hack 組合語言的。

翻譯原理可濃縮成一句話：**VM 機器的「虛擬堆疊」與「可命名記憶體段」，全部被對映到 Hack 電腦的真實 RAM 上**——堆疊靠指標 `SP`（RAM[0]）管理，各記憶體段靠基準暫存器 `LCL`/`ARG`/`THIS`/`THAT` 加上偏移量定址。

## 架構總覽

程式由以下部分組成：

| 函式 | 角色 |
|------|------|
| `trim` / `remove_comment` | 清理輸入行：去註解、去前後空白 |
| `write_arithmetic` | 處理 9 種算術/邏輯/比較指令 |
| `write_push` / `write_pop` | 處理 push/pop，依 segment 分支 |
| `write_label` / `write_goto` / `write_if_goto` | 處理程式流程指令 |
| `write_function` / `write_call` / `write_return` | 處理函式呼叫與返回 |
| `write_bootstrap` | 輸出開機程式碼（SP 初始化 + 呼叫 Sys.init） |
| `translate_file` | 逐行讀取一個 .vm 檔並翻譯 |
| `process_command` | 依第一個 token 分派給上述函式 |
| `main` | 解析命令列、開檔、依檔案數決定是否寫 bootstrap |

全域變數只有三個：

```c
static int label_count = 0;      // 比較指令的獨特 label 編號
static int return_count = 0;     // call 的 return label 編號
static char current_file[MAX_LABEL] = "";  // 目前翻譯的檔名（static 段命名用）
```

主流程很簡單：`main` 開輸出檔 → 若輸入多於一個檔則先 `write_bootstrap` → 逐檔呼叫 `translate_file` → 關檔、印出「轉換完成」。

### SP 堆疊指標模型

VM 堆疊在 RAM 中實作的方式，是整個翻譯器的核心概念：

- `SP`（Stack Pointer）指向**堆疊頂端的下一個空位**，即「最後一個已放入值的位置 + 1」。程式啟動時 `SP = 256`。
- `push x`＝把 x 放到 `RAM[SP]`，然後 `SP ← SP+1`。
- `pop`＝先把 `SP ← SP-1`，再取出 `RAM[SP]`。
- 因此**恆等式**：`A=M`（把 SP 的內容當位址）等於「堆疊頂端」，而 `A=M-1` 或 `A=A-1` 等於「堆疊的第二個元素位置」。

### 記憶體段的對應

VM 的 8 種 segment 被對映到固定 RAM 位址或指標暫存器：

| segment | 基底位址 | 定址方式 |
|---------|----------|----------|
| constant | 無（立即值） | 直接取常數 |
| local | `LCL`（R1） | `LCL + index` |
| argument | `ARG`（R2） | `ARG + index` |
| this | `THIS`（R3） | `THIS + index` |
| that | `THAT`（R4） | `THAT + index` |
| temp | `5 + index` | 直接位址（RAM[5..12]） |
| pointer | index 0→`THIS`、1→`THAT` | 直接存取暫存器 |
| static | `檔案名.index` 符號 | 由組譯器配置到 RAM[16] 起 |

## 實作細節

### 輸入處理（trim / remove_comment）

`remove_comment` 用 `strstr(line, "//")` 找到第一處 `//` 直接截斷；`trim` 把行首行尾的空白去掉。`translate_file` 對每一行做「去註解 → 去空白 → 留下空白行則跳過，否則先輸出 `// 指令` 當註解，再呼叫 `process_command`」。這讓輸出的 .asm 每一段都帶有原本的 VM 指令當註解，方便除錯與對照。

### write_arithmetic：算術與邏輯指令

兩個運算元的二元運算（add/sub/and/or）都共用同一個「先 pop 出 y、再就地與 x 運算」的骨架：

```asm
@SP       // 取 y
AM=M-1    // SP--，同時 A=SP 指向 y
D=M       // D = y
A=A-1     // A 指向 x
M=...     // 把結果寫回 x 的位置
```

以 `add` 為例，`M=D+M` 產生 `RAM[A] = x + y`，原本的 y 位置變成「死值」，SP 已經減過，等於自然完成「一次 pop」：

| VM | Hack 組合語言 | 意義 |
|----|---------------|------|
| add | `@SP AM=M-1 D=M A=A-1 M=D+M` | x+y |
| sub | `@SP AM=M-1 D=M A=A-1 M=M-D` | x−y |
| and | `@SP AM=M-1 D=M A=A-1 M=D&M` | x AND y |
| or  | `@SP AM=M-1 D=M A=A-1 M=D\|M` | x OR y |
| neg | `@SP A=M-1 M=-M` | 堆疊頂取負 |
| not | `@SP A=M-1 M=!M` | 堆疊頂取反 |

一元指令（neg/not）只動頂端：`A=M-1` 指向 x，直接改值即可，不加不減 SP。

### 比較指令 eq/gt/lt 與 label_count

比較指令要產生「-1（真）或 0（假）」，需要跳轉，跳轉的目標必須用獨特的 label。程式用全域 `label_count` 遞增產生 `TRUE_N` 與 `END_N`，避免多次比較時 label 衝突。以 `eq` 為例：

```asm
@SP
AM=M-1
D=M
A=A-1
D=M-D        // D = x - y
@TRUE_0
D;JEQ        // x==y 則跳轉
@SP
A=M-1
M=0          // 假：寫 0
@END_0
0;JMP
(TRUE_0)
@SP
A=M-1
M=-1         // 真：寫 -1
(END_0)
```

`gt` 用 `D;JGT`、`lt` 用 `D;JLT`，其餘結構完全相同。三個指令的 Hack 序列只差在跳轉條件這一行。運算順序上是「先 pop y，再算 x−y」，所以 `lt` 迴避了方向混淆：VM 的 `x lt y` 翻譯為 `x−y < 0`。

### write_push

依 segment 分成八種序列：

- **constant**：`@N D=A`，把立即值當資料，寫入堆疊後 SP+1。
- **local/argument/this/that**：`@N D=A` + `@LCL A=D+M`，先算出 `base+index` 放進 A，再 `D=M` 取值。這是「base+offset 間接定址」的標準寫法。
- **temp**：`@(5+index) D=M`，直接把 RAM[5+index] 的內容入堆疊。注意這與其他段不同——temp 的基底 `5` **直接寫死**在 `fprintf(out, "@%d\nD=M\n...", 5 + index)`，所以 `push temp 6` 翻譯成 `@11`。
- **pointer**：`(index==0) ? "THIS" : "THAT"`，直接讀 THIS 或 THAT 暫存器的值入堆疊。
- **static**：`@檔案名.index D=M`，符號 `StaticTest.8` 這類，由組譯器配置給 RAM[16] 之後的位置。

四種 `base+index` 段的序列相同，差別只在基底符號：

```asm
@5         // index
D=A
@THAT      // base
A=D+M      // A = THAT + 5
D=M        // 取值
@SP
A=M
M=D        // 寫入堆疊頂端
@SP
M=M+1
```

### write_pop

pop 是 push 的逆操作，但有一個陷阱：**先把資料從堆疊頂端取出後，若直接 `@LCL A=D+M`，會把算好的目標位址弄丟**。程式用暫存器 `R13`（RAM[13]）暫存目標位址：

```asm
@0
D=A
@LCL
D=D+M
@R13      // R13 = LCL + index（目標位址先行備份）
M=D
@SP
AM=M-1    // 取出堆疊頂端
D=M
@R13
A=M
M=D       // 寫回目標位址
```

- **temp** 的 pop 更簡單：資料直接寫入 `@(5+index)`。
- **pointer** 的 pop：寫回 `@THIS` 或 `@THAT`，這正是 PointerTest 讓 THIS/THAT 指向任意位址的機制。
- **static** 的 pop：寫回 `@檔案名.index`。
- constant 沒有 pop（語法層次就被禁止）。

### write_label / write_goto / write_if_goto

- `label` → `(label)`（Hack 的 label 定義）。
- `goto` → `@label` + `0;JMP`（無條件跳轉）。
- `if-goto` → 先 pop 堆疊頂端，非零才跳：`@SP AM=M-1 D=M` + `@label D;JNE`。

### write_function

在輸出檔定義 label `(func_name)`，接著初始化 n 個 local 變數為 0。每個 0 使用與 push constant 0 相同的三行序列（`@SP A=M M=0 @SP M=M+1`）。

### write_call

`call f n` 的堆疊框架協定，是第 8 章最關鍵的機制。程式依序輸出：

1. **Push return address**：`@f$ret.N`，跳轉後執行的回程位址。return label 名稱用 `函式名$ret.遞增序號`，`return_count` 保證獨特。
2. **Push LCL、ARG、THIS、THAT**：把呼叫端的四個基底暫存器備份到堆疊上，供 `return` 回復。
3. **ARG = SP − 5 − n**：`@SP D=M` `@5 D=D-A` `@n D=D-A` `@ARG M=D`。減 5 是因為框架上剛好有 5 個「非參數」的槽位（retAddr、LCL、ARG、THIS、THAT）。
4. **LCL = SP**：設定被呼叫函式的 local 基底。
5. **跳轉到函式**：`@f 0;JMP`。
6. **定義 return label**：`(f$ret.N)`。

被呼叫函式返回後，SP 正好位在「參數撰寫處」的前一格，符合「呼叫者在呼叫後堆疊頂端就是回傳值」的語義。

### write_return

return 依官方協定做「逆向回復」，全程只用 `R13`（frame）與 `R14`（retAddr）：

1. **frame = LCL**：`@LCL D=M @R13 M=D`，先把 frame 存進 R13。
2. **retAddr = *(frame−5)**：`@5 A=D-A D=M @R14 M=D`。注意這裡 A 指令沿用 D 裡仍是 LCL 的值，因此 `A=D-A` 算出 frame−5，再取該處的內容（之前 push 的 return address）。
3. **\*ARG = pop()**：把回傳值搬進 ARG 所指位址（呼叫者放置參數的地方）。
4. **SP = ARG + 1**：把堆疊收縮到「回傳值」之上。
5. 依序從 frame 下方回復四個暫存器：`@R13 AM=M-1 D=M @THAT M=D`（A 的遞減同時完成指標移動與取值），接著 THIS、ARG、LCL，各往前移一格。
6. **goto retAddr**：`@R14 A=M 0;JMP`，回到呼叫者。

### write_bootstrap

只有在**多檔**編譯時才輸出（`argc > 3`）：

```asm
@256
D=A
@SP
M=D        // 初始化堆疊指標到 RAM[256]
```

接著呼叫 `Sys.init`。這是程式在 VM 世界裡的「開機程序」——主程式在真實作業系統上不會自動執行，只能在 VM RAM 被清空、SP 設 256 之後，從 `Sys.init` 展開呼叫鏈。

### translate_file 與 static 命名

`translate_file` 先用 `strrchr` 取出純檔名、去掉副檔名存在 `current_file`，這決定了 static 段的符號名前綴（如 `StaticTest.8`）。它會輸出 `// ========== File: xxx.vm ==========` 的分隔線，方便多檔翻譯時確認來源。

## 測試與驗證

程式用法：

```
./vm2asm <output.asm> <file1.vm> [file2.vm] ...
```

- 單檔翻譯沒有 bootstrap；多檔翻譯會先寫入 SP=256 並呼叫 Sys.init。
- 目錄中的 SimpleAdd.vm、StackTest.vm、BasicTest.vm、PointerTest.vm、StaticTest.vm 都是它的測試素材，對應的 .asm 檔就是用本程式產生後存檔的結果，可直接用 CPU Emulator 執行檢驗。
- 本程式與官方 VMTranslator 相容：官方用 `RAM[13]`~`RAM[15]` 當暫存區，本書用 R13/R14；官方以 `label_true0/end0` 命名，本書以 `TRUE_0/END_0` 命名，功能相同。

## 延伸討論

- **沒有符號表**：與第 6 章組合器不同，VM 翻譯器幾乎是「無狀態的逐行翻譯」，唯一的狀態是 label/return 計數與檔名。這反映出 VM 將複雜語義（堆疊、框架）都編碼進指令本身。
- **static 符號的分配**：`檔案名.index` 會被第 6 章組合器配置到 RAM[16] 起，因此「每個 .vm 檔」的 static 空間彼此隔離，模擬了編譯器每個 class 各自存 static 變數的需求。
- **在真實編譯器中的地位**：Java bytecode、C# IL、Python bytecode 都扮演同樣角色——一種與高階語言無關、可移植、易於直譯或即時編譯的中間表示。Hack 平台把它翻譯成 Hack 組語而非直接直譯，好處是可以像程式書一樣一次翻譯整支程式。
- **可改進處**：`sscanf("%s %s %s")` 對行首空白與多空白處理不嚴謹；無窮迴圈（如 `goto` 到自己）沒有偵測；`strncpy` 後沒有保證 `current_file` 結尾為 `\0`（這裡因陣列初始為全 0 而安全）。