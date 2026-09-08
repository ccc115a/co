# NestedCall.asm 程式說明

這是 NestedCall 測試（`Sys.vm`）翻譯出來的完整 Hack 組合語言檔，共
497 行。它是第 8 章 Framework 協定最完整的單一演練：你可以沿著 497 行，
把「call 的 5 步驟」與「return 的 6 階段」分別出現三次的機器碼一一對照。

## 概述

- 來源：`Sys.vm`（`Sys.init` / `Sys.main` / `Sys.add12` 三函式）。
- 特徵：呼叫鏈為 `Sys.init → Sys.main → Sys.add12`，兩次巢狀 call、
  三次 return。
- 檔頭無 bootstrap：此測試由 VM Emulator 的測試腳本扮演「最外層呼叫者」，
  直接 `call Sys.init` 啟動。

## 架構總覽

| 行號 | 函式 / 事件 | 內容 |
|------|-------------|------|
| 3–4 | `Sys.init` | `(Sys.init)` |
| 5–32 | THIS/THAT 設定 | pop pointer 0/1 |
| 33–83 | **call Sys.main** | 壓 retAddr、LCL、ARG、THIS、THAT，設 ARG/LCL，跳轉 |
| 84–89 | 收 call 回傳 | pop temp 1 |
| 90–94 | 無窮迴圈 | `(LOOP)` + `0;JMP` |
| 95–121 | `function Sys.main 5` | 五個推 0 塊 |
| 122–212 | 設 THIS/THAT、local1..3、push 123 | 各段 pop 模板 |
| 213–271 | **call Sys.add12** | 第二次框架建立 |
| 272–277 | pop temp 0 | 回傳 135 → RAM 5 |
| 278–356 | push local0..4 + add×4 | 0+200+40+6+0 |
| 357–399 | **return** | Sys.main 回推框架 |
| 400–401 | `(Sys.add12)` | 進入第三次執行區 |
| 402–454 | 計算 123+12 | push arg0、push 12、add |
| 455–497 | **return** | Sys.add12 回推框架 |

## 原理：兩次 call 的框架疊加

第一次 call（第 33–83 行）把 `Sys.main` 的框架疊在 `Sys.init` 堆疊之上：

```
call Sys.main 0 的展開                          ; ★ = 尚未進入函式體
@Sys.main$ret.0  D=A  ... 推入                  ; 1. retAddr
@LCL D=M ... 推入                                ; 2. LCL
@ARG D=M ... 推入                                ; 3. ARG
@THIS D=M ... 推入                               ; 4. THIS
@THAT D=M ... 推入                               ; 5. THAT
@SP D=M @5 D=D-A @0 D=D-A @ARG M=D              ; ARG = SP-5-0
@SP D=M @LCL M=D                                ; LCL = SP
@Sys.main 0;JMP                                 ; goto
(Sys.main$ret.0)                                ; 返回標籤
```

第二次 call（第 213–271 行）完全同理，只是 `Sys.add12` 帶 1 個參數，
所以 `D=D-A` 減去 1。結果「call 時壓入的值」與「ARG 所指的參數」剛好
讓 `Sys.add12` 用 `@ARG / A=D+M / D=M` 讀到 123。

## 實作細節（代表性片段）

### call Sys.main 0（第 33–83 行）

```
@Sys.main$ret.0
D=A
@SP
A=M
M=D
@SP
M=M+1      // 推 retAddr
@LCL
D=M
@SP
A=M
M=D
@SP
M=M+1      // 推 LCL
...
@SP
D=M
@5
D=D-A
@0
D=D-A
@ARG
M=D        // ARG = SP - 5 - 0
@SP
D=M
@LCL
M=D        // LCL = SP
@Sys.main
0;JMP      // 跳到函式
(Sys.main$ret.0)
```

### function Sys.main 5（第 95–121 行）

五段「`@SP / A=M / M=0 / @SP / M=M+1`」各建一個 local；測試腳本先塞進
local0、local4 的 -1 在此被清成 0。

### return（第 357–399 行）

與 `SimpleFunction.asm` 完全相同的六階段，這裡是 `Sys.main` 回傳
456 = 0+200+40+6+0。執行後 `THAT` 從 add12 的 5002 還原成 main 的 5001、
`THIS` 還原 4001、ARG/LCL 還原——正是 THIS/THAT 的保存測試。

## 測試與驗證

- 用 VM Emulator 載入並逐步執行；特別在 call 前後觀察 SP、LCL、ARG、
  THIS、THAT 的變化。
- 三次 return 後：temp1（RAM 6）= 456、temp0（RAM 5）= 135。
- 對照 `NestedCall.cmp`（在進入 Sys.init 前，測試腳本還對 local0、local4
  塞 -1 等前置作業）。

## 延伸討論

- **為何一次推 5 個值？** 這 5 個值構成「完整的呼叫環境」；少一個，
  巢狀呼叫就會漏失狀態。`retAddr` 讓我們回來後能繼續執行，`LCL/ARG` 保存
  記憶體段基底，`THIS/THAT` 保存物件環境。
- return 的 `AM=M-1` 同時更新 R13（frame 指標）與取內容，是整個框架協定
  中「最省指令」的精巧處。