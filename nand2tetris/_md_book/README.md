# 《從0到1：手寫電腦的奇幻之旅 —— 基於 Nand2Tetris 的計算機系統全棧實作》

> 從邏輯閘到能執行 Tetris 遊戲的完整計算機系統

## 第一部分：硬體篇 —— 從邏輯閘到計算機

* 第一章：萬物之始 —— 邏輯閘（Logic Gates）
   * [1.1 - 布林代數與邏輯閘基礎](1.1.md)
   * [1.2 - 宇宙的基石：Nand 閘](1.2.md)
   * [1.3 - 構建基礎邏輯閘：Not, And, Or, Xor](1.3.md)
   * [1.4 - 多路復用與多通道邏輯閘：Mux, Demux, Multi-bit](1.4.md)
   * [1.5 - 實作與測試：使用 Hardware Description Language (HDL)](1.5.md)

* 第二章：運算的核心 —— 算術邏輯單元（ALU）
   * [2.1 - 二進位加法與半加器、全加器（Half/Full Adder）](2.1.md)
   * [2.2 - 增量器與多位元加法器（Inc / Add16）](2.2.md)
   * [2.3 - 邏輯與運算結合：設計 Hack ALU](2.3.md)
   * [2.4 - ALU 標誌位與運算邏輯驗證](2.4.md)

* 第三章：記憶與時間 —— 時序邏輯與記憶體（Memory）
   * [3.1 - 觸發器（D Flip-Flop）：引入時間與狀態](3.1.md)
   * [3.2 - 1-bit 與 16-bit 暫存器（Register）設計](3.2.md)
   * [3.3 - 記憶體層級架構：RAM8 到 RAM16K](3.3.md)
   * [3.4 - 程式計數器（Program Counter, PC）設計](3.4.md)

* 第四章：機器語言與指令集（Machine Language）
   * [4.1 - 硬體與軟體的交界：指令集架構（ISA）](4.1.md)
   * [4.2 - Hack 機器語言規格：A-指令與 C-指令](4.2.md)
   * [4.3 - 記憶體映射 I/O：螢幕與鍵盤的控制原理](4.3.md)
   * [4.4 - 寫入你的第一個 Hack 組合語言程式](4.4.md)

* 第五章：組裝電腦 —— 計算機架構（Computer Architecture）
   * [5.1 - Hack 中央處理器（CPU）結構設計](5.1.md)
   * [5.2 - 記憶體晶片與匯流排整合（Memory Module）](5.2.md)
   * [5.3 - 構建完整電腦：Computer 晶片與執行循環](5.3.md)
   * [5.4 - 硬體模擬器上的系統調試](5.4.md)

## 第二部分：軟體篇 —— 從組譯器到作業系統

* 第六章：第一道軟體橋樑 —— 組譯器（Assembler）
   * [6.1 - 組譯器的工作原理：文字解析與二進位轉譯](6.1.md)
   * [6.2 - 符號表（Symbol Table）與標號解析（Labels & Variables）](6.2.md)
   * [6.3 - 兩階段掃描（Two-Pass）組譯器實作](6.3.md)
   * [6.4 - 測試你的組譯器：將 .asm 編譯為 .hack](6.4.md)

* 第七章：虛擬機架構 —— 堆疊與算術（Virtual Machine I: Stack Arithmetic）
   * [7.1 - 為何需要虛擬機？跨平台與中間語言構想](7.1.md)
   * [7.2 - 堆疊（Stack）資料結構與運算機制](7.2.md)
   * [7.3 - VM 指令翻譯：算術與邏輯指令（add, sub, eq, gt...）](7.3.md)
   * [7.4 - 記憶體段（Memory Segments）的映射與存取](7.4.md)

* 第八章：虛擬機進階 —— 程序與控制流（Virtual Machine II: Program Control）
   * [8.1 - 控制流翻譯：條件與無條件跳躍（goto / if-goto）](8.1.md)
   * [8.2 - 函數呼叫機制：call, function, return](8.2.md)
   * [8.3 - 呼叫堆疊（Call Stack）與區域變數維護](8.3.md)
   * [8.4 - 打造完整的 VM Translator](8.4.md)

* 第九章：高階程式語言 —— Jack 語言導覽
   * [9.1 - Jack 語言語法簡介：物件導向與語法結構](9.1.md)
   * [9.2 - 物件、陣列與指標的底層本質](9.2.md)
   * [9.3 - 使用 Jack 編寫第一個圖形化小遊戲](9.3.md)

* 第十章：語法解析 —— 編譯器前端（Compiler I: Syntax Analysis）
   * [10.1 - 編譯器原理簡介](10.1.md)
   * [10.2 - 詞法分析（Lexical Analysis / Tokenizer）](10.2.md)
   * [10.3 - 語法分析（Parsing / Context-Free Grammar）](10.3.md)
   * [10.4 - 語法樹與 XML 結構輸出測試](10.4.md)

* 第十一章：代碼生成 —— 編譯器後端（Compiler II: Code Generation）
   * [11.1 - 符號表設計：類別級別與方法級別作用域](11.1.md)
   * [11.2 - 物件導向特性的底層翻譯：Constructors, Methods, Fields](11.2.md)
   * [11.3 - 陣列與指標運算的 VM 指令生成](11.3.md)
   * [11.4 - 完工：將 Jack 源碼直接編譯為 VM 代碼](11.4.md)

* 第十二章：靈魂的最後拼圖 —— 作業系統（Operating System）
   * [12.1 - 數學庫：Math（乘除法、開根號）](12.1.md)
   * [12.2 - 記憶體管理：Memory（alloc & dealloc 演算法）](12.2.md)
   * [12.3 - 螢幕與繪圖：Screen（畫線、畫圓演算法）](12.3.md)
   * [12.4 - 字型與輸入：Output & Keyboard](12.4.md)
   * [12.5 - 系統基礎：String, Array, Sys](12.5.md)

## 第三部分：終章 —— 經典重現

* 第十三章：頂峰相見 —— 執行 Tetris
   * [13.1 - 軟硬體全棧鏈條整合測試](13.1.md)
   * [13.2 - 從 Jack 編譯到 Hardware 執行的完整流轉](13.2.md)
   * [13.3 - 回顧與展望：現代計算機架構的演進（RISC-V, 現代 OS, 編譯器優化）](13.3.md)
