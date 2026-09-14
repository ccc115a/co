# Computer 晶片說明（完整的 Hack 電腦）

這個電路把第五章的三塊拼圖——`ROM32K`（程式記憶體）、`CPU`、`Memory`——接成一台可執行程式的
完整電腦：程式靜靜躺在 ROM 裡，CPU 一個時脈一個時脈地取指令、解碼、執行，資料在 CPU 與
Memory 之間流動。對外的介面只剩一個按鈕（`reset`）。

## 概述

- 在 Nand2Tetris 第五章，Computer 是層次結構的頂點，象徵「從 Nand 到 Tetris」的第一個里程碑：
  一個兵工廠裡所有閘器組成的可程式機器。到這裡，硬體「內建」的只剩接下來的作業系統逐步解鎖能力。
- 由三個子元件組成：`ROM32K`（存放程式、內建）、`CPU`（第 5 章自製）、`Memory`（第 5 章自製）。
- 沒有上游使用者——It's the whole computer。給它的只是：ROM 裡先載好的程式，以及一個 reset 開關。

## 介面與規格

```
IN reset;
```

沒有 OUT。行為非常簡潔（原始檔註解）：

- `reset=0`：執行 ROM 中的程式。
- `reset=1`：正在跑的程式停止，回到位址 0 重來。
- 要「啟動」一支程式，先把 `reset` 推高（1）再放低（0）；從此交給軟體——程式要畫螢幕就畫、
  要讀鍵盤就讀，電腦只是忠實執行。

## 原理：fetch→execute 迴圈

電腦的基本迴圈：**取指令（fetch）→ 解碼執行（execute）→ 更新 PC → 回到取指令**。一條指令一
個時脈週期，每一週期包含：

1. **fetch**：`pc` 送進 ROM32K 當位址，ROM 輸出那一格的指令 `instruction`。
2. **decode + execute**：`instruction` 送進 CPU，CPU 算出 ALU 結果、更新 A/D、判斷跳轉與是否
   `writeM`。
3. **資料存取**：若是 `M` 相關指令，CPU 用 `addressM` 對 Memory 定址，配合 `outM/writeM` 讀寫。
4. **更新 PC**：PC 在時脈邊緣提交新值（`pc+1` 或跳轉目標），下一週期從這裡再取指令。

下圖把接線順序畫出來（內部接線只是一條線，箭頭是資料流向）：

```
                     ┌───────────────┐
        pc ─────────►│    ROM32K     │ out=instruction
                     └───────┬───────┘ default
                             │ instruction
                             ▼
                     ┌───────────────┐
        inM ◄────────┤               │◄── reset
                     │      CPU      │
   Memory.out ──────►|inM            |
                     │     outM ────►│ outM  →（線 inM）  → Memory.in
                     │   writeM ────►│ writeM→（線 loadM）→ Memory.load
                     │  addressM ───►│ addressM（同名線）  → Memory.address
                     └───────┬───────┘
                             │ pc（回到 ROM32K，閉合迴圈）
```

## 實作細節

原始檔只有三行 PARTS，但接線非常有教學意義：

```
ROM32K(address=pc, out=instruction);
CPU(inM=outM, instruction=instruction, reset=reset,
    outM=inM, writeM=loadM, addressM=addressM, pc=pc);
Memory(in=inM, load=loadM, address=addressM, out=outM);
```

### 中間線的真正流向（容易搞混的命名陷阱）

HDL 的「線」要自己接；這裡作者偷懶取了兩個**容易誤導**的名字：

| 線名 | 誰的輸出（供） | 給誰（需求） |
| --- | --- | --- |
| `instruction` | ROM32K 的 `out` | CPU 的 `instruction` |
| `pc` | CPU 的 `pc` | ROM32K 的 `address` |
| `addressM` | CPU 的 `addressM` | Memory 的 `address` |
| **`inM`** | CPU 的 `outM`（**！！**） | Memory 的 `in` |
| **`loadM`** | CPU 的 `writeM` | Memory 的 `load` |
| **`outM`** | Memory 的 `out`（**！！**） | CPU 的 `inM` |

線名叫 `inM`，裡面流的其實是「CPU 要寫給記憶體的值」（CPU 自己的輸出 `outM`）；線名叫
`outM`，流的卻是「記憶體讀回給 CPU 的值」（CPU 的輸入 `inM`）。**命名對稱、意義相反**，因為
``CPU.outM → Memory.in``、``Memory.out → CPU.inM`` 是兩條對向的資料流，作者只取了「一端」的
名字。讀這段電路時，請以上表為準，別被線名騙了。

### 資料路徑範例

- **M=D**（把 D 寫到 RAM[A]）：CPU 把 `writeM=1`、`outM=D`、`addressM=A` 交給 Memory，Memory
  在下一個時間步把 `in` 寫入 `address`。
- **D=M**（讀 RAM[A] 進 D）：CPU 設好 `addressM=A`，Memory 的 `out` 組合邏輯立即輸出
  `RAM[A]`，經線 `outM` 回到 CPU 的 `inM`，ALU 與 D 暫存器接手。

### PC 與 reset 的閉合

RM 的 `address=pc` 使電腦「下一步在哪」完全由 CPU 的 PC 決定。`reset` 直接接進 PC 的 `reset`
腳：reset 拉高，`pc` 下一個時間步歸零，程式從頭執行——這就是「重跑」的唯一機制，也是所有三個
測試檔開場都要 `reset=1` 又放下 `reset=0` 的原因。

## 測試與驗證

第五章提供三支完整程式的測試（都是先 `ROM32K load XXX.hack` 把組譯後的機器碼放進 ROM）：

### ComputerAdd.tst（Add.hack）

一支「把 2 和 3 相加寫入 RAM[0]」的程式。腳本 `repeat 6 { tick, tock, output }` 跑 6 個週期，比對
`RAM16K[0]` 應變成 5、程式的 PC 走到程式結尾；接著 `reset=1` 重跑第二次，確認重跑後行為一致
（驗證 PC 被正確歸零）。

### ComputerMax.tst（Max.hack）

「取 RAM[0] 與 RAM[1] 的較大者寫入 RAM[2]」的程式。第一次跑輸入 `(3, 5)`、第二次輸入
`(23456, 12345)`，第二次用較少週期（分支路徑不同）——測試檔故意用不同輸入與不同週期數，驗證
程式**依資料分支**的能力。

### ComputerRect.tst（Rect.hack）

「在螢幕左上角畫一個寬 16 像素、高 RAM[0] 的長方形」的程式。`set RAM16K[0] 4` 後跑 63 個週期，
意義是：透過 Memory 對 Screen 區段的寫入，程式把資料畫上螢幕；測試前記得在 View 選單開啟
Screen 畫面。這支程式預告了第十二章作業系統與 Pong 遊戲的圖形輸出。

若要自己動手，可考慮把 Max/Rect 的組譯版本換掉（改放自己的 .hack），驗證任意程式都能在上頭跑。

## 延伸討論

- **儲存程式的機器（stored-program）**：Computer 是教科書級的 von Neumann 機器——程式碼與資料
  都在記憶體定址空間中、執行的順序由程式自己控制。嚴格說 Hack 的程式放 ROM、資料放 RAM，
  偏「哈佛架構」的分離式設計，但概念核心（程式即資料、CPU 自動取出執行）一致。
- **本章的地位**：「從 Nand 到 Tetris」至此硬體完結。接下來第六章組合器把符號式組合語言翻譯成
  機器碼（正是 `Add.hack` 的來源），第七、八章發展 VM，第十一章 Jack 語言，第十二章作業系統
  最後把整台機器點亮成可互動的計算機。
- **可改進處**：真正的電腦用壓縮指令、管線、快取與中斷，這裡一概沒有；但它以不到三十個閘器的
  規模，精準示範了「硬體的往下挖到底」與「軟體的往上堆到頂」之間唯一的交界——這條指令週期。