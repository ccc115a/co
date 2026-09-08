## MCU0m -- 一顆只有 51 行 Verilog 程式碼的 16 位元處理器

在本文中、我們將設計出一個簡易的 16 位元 CPU 微控制器，稱為 MCU0 。

### MCU0 的架構

MCU0 是一顆 16 位元的 CPU，所有暫存器都是 16 位元的，總共有 (IR, SW, PC, A) 等四個暫存器，如下所示：

暫存器名稱    | 功能           | 說明
--------------|--------------|--------------------------------------------------------------------------------------
IR            | 指令暫存器     | 用來儲存從記憶體載入的機器碼指令
PC            | 程式計數器     | 用來儲存指令的位址 (也就是目前執行到哪個指令的記憶體位址)
SW            | 狀態暫存器     | 用來儲存 CMP 比較指令的結果旗標，像是負旗標 N 與零旗標 Z 等。作為條件跳躍 JEQ 等指令是否跳躍的判斷依據。
A             | 累積器         | 用來儲存計算的結果，像是加減法的結果。

為了讓程式極度簡化，在本文中我們只實作測試程式所用到的「必要指令」，總共有 6 個，如下所示：

代碼 | 名稱 |      格式   |              說明        |          語意
----|------|-------------|--------------------------|----------------
0   | LD   |      LD  C  |              載入        |      A = [C]
1   | ADD  |      ADD C  |              加法        |      A = A + [C]
2   | JMP  |      JMP C  |              跳躍        |      PC = C
3   | ST   |      ST  C  |              儲存        |      [C] = A
4   | CMP  |      CMP C  |              比較        |      SW = A CMP [C]
5   | JEQ  |      JEQ C  |              相等時跳躍  |      if SW[30]=Z=1 then PC = C

### 組合語言與機器碼

以下是一個 MCU0 處理器的組合語言範例程式，該程式可以計算從 SUM=1+2+...+N 的結果。
其中第一欄是指令或資料的機器碼，註解符號 `//` 之後則是位址與組合語言。

檔案： mcu0m.hex

```
00 16  // 00    LOOP:   LD    I    
40 1A  // 02            CMP   N    
50 12  // 04            JEQ   EXIT
10 18  // 06            ADD   K1    
30 16  // 08            ST    I    
00 14  // 0A            LD    SUM    
10 16  // 0C            ADD   I    
30 14  // 0E            ST    SUM    
20 00  // 10            JMP   LOOP
20 12  // 12    EXIT:   JMP   EXIT
00 00  // 14    SUM:    WORD  0    
00 00  // 16    I:      WORD  0    
00 01  // 18    K1:     WORD  1    
00 0A  // 1A    N:      WORD  10     
```

MCU0 的指令格式很簡單，當指令被載入指令暫存器 IR 後，前四個位元 IR[15:12] 是指令代碼 (OP)，而
後 12 個位元 IR[11:0] 則是一個常數 C，該常數通常代表記憶體位址。(由於採用絕對定址，所以 MCU0 的
記憶體最大只能達 2 的 12 次方，也就是從 0 到 4095。

由於指令格式只有一種，分為 4 位元的 OP 代碼與 12 位元的 C 常數，因此編碼非常容易，例如 `LD I` 這個指令，
由於 LD 的代碼為 0，而 I 的位址為 0x16，所以整個指令編碼為 0016。而對於 `CMP N` 這個指令而言，由於
CMP 的代碼為 4，變數 N 的位址為 0x1A，所以整個指令編碼為 401A。

### Verilog 程式實作

於是、整個 mcu0m 處理器只有短短的 51 行 Verilog 程式就實作完了，以下是全部的程式碼列表。

檔案： mcu0m.v

```verilog
`define N    SW[15] // 負號旗標
`define Z    SW[14] // 零旗標
`define OP   IR[15:12] // 運算碼
`define C    IR[11:0]  // 常數欄位
`define M    {m[`C], m[`C+1]}

module cpu(input clock); // CPU0-Mini 的快取版：cpu0mc 模組
  parameter [3:0] LD=4'h0,ADD=4'h1,JMP=4'h2,ST=4'h3,CMP=4'h4,JEQ=4'h5;
  reg signed [15:0] A;   // 宣告暫存器 R[0..15] 等 16 個 32 位元暫存器
  reg [15:0] IR;  // 指令暫存器 IR
  reg [15:0] SW;  // 指令暫存器 IR
  reg [15:0] PC;  // 程式計數器
  reg [15:0] pc0;
  reg [7:0]  m [0:32];    // 內部的快取記憶體
  integer i;  
  initial  // 初始化
  begin
    PC = 0; // 將 PC 設為起動位址 0
    SW = 0;
    $readmemh("mcu0m.hex", m);
    for (i=0; i < 32; i=i+2) begin
       $display("%8x: %8x", i, {m[i], m[i+1]});
    end
  end
  
  always @(posedge clock) begin // 在 clock 時脈的正邊緣時觸發
    IR = {m[PC], m[PC+1]};  // 指令擷取階段：IR=m[PC], 2 個 Byte 的記憶體
    pc0= PC;                // 儲存舊的 PC 值在 pc0 中。
    PC = PC+2;              // 擷取完成，PC 前進到下一個指令位址
    case (`OP)              // 解碼、根據 OP 執行動作
      LD: A = `M; 		  // LD C
      ST: `M = A;			  // ST C
      CMP: begin `N=(A < `M); `Z=(A==`M); end // CMP C
      ADD: A = A + `M;	  // ADD C
      JMP: PC = `C;		  // JMP C
      JEQ: if (`Z) PC=`C;	  // JEQ C
    endcase
    // 印出 PC, IR, SW, A 等暫存器值以供觀察
    $display("%4dns PC=%x IR=%x, SW=%x, A=%d", $stime, pc0, IR, SW, A); 
  end
endmodule

module main;                // 測試程式開始
reg clock;                  // 時脈 clock 變數

cpu cpux(clock);            // 宣告 cpu0mc 處理器

initial clock = 0;          // 一開始 clock 設定為 0
always #10 clock=~clock;    // 每隔 10ns 反相，時脈週期為 20ns
initial #2000 $finish;      // 在 2000 奈秒的時候停止測試。
endmodule
```

### 執行結果

上述程式以 mcu0m.hex 這個 16 進位的機器碼檔作為輸入，其編譯執行結果如下：

```
C:\Dropbox\Public\web\oc\code\mcu>iverilog -o mcu0m mcu0m.v

C:\Dropbox\Public\web\oc\code\mcu>vvp mcu0m
WARNING: mcu0m.v:20: $readmemh(mcu0m.hex): Not enough words in the file for the
requested range [0:32].
00000000:     0016
00000002:     401a
00000004:     5012
00000006:     1018
00000008:     3016
0000000a:     0014
0000000c:     1016
0000000e:     3014
00000010:     2000
00000012:     2012
00000014:     0000
00000016:     0000
00000018:     0001
0000001a:     000a
0000001c:     xxxx
0000001e:     xxxx
  10ns PC=0000 IR=0016, SW=0000, A=     0
  30ns PC=0002 IR=401a, SW=8000, A=     0
  50ns PC=0004 IR=5012, SW=8000, A=     0
  70ns PC=0006 IR=1018, SW=8000, A=     1
  90ns PC=0008 IR=3016, SW=8000, A=     1
 110ns PC=000a IR=0014, SW=8000, A=     0
 130ns PC=000c IR=1016, SW=8000, A=     1
 150ns PC=000e IR=3014, SW=8000, A=     1
 170ns PC=0010 IR=2000, SW=8000, A=     1
 190ns PC=0000 IR=0016, SW=8000, A=     1
 210ns PC=0002 IR=401a, SW=8000, A=     1
 230ns PC=0004 IR=5012, SW=8000, A=     1
 250ns PC=0006 IR=1018, SW=8000, A=     2
 270ns PC=0008 IR=3016, SW=8000, A=     2
 290ns PC=000a IR=0014, SW=8000, A=     1
 310ns PC=000c IR=1016, SW=8000, A=     3
 330ns PC=000e IR=3014, SW=8000, A=     3
 350ns PC=0010 IR=2000, SW=8000, A=     3
 370ns PC=0000 IR=0016, SW=8000, A=     2
 390ns PC=0002 IR=401a, SW=8000, A=     2
 410ns PC=0004 IR=5012, SW=8000, A=     2
 430ns PC=0006 IR=1018, SW=8000, A=     3
 450ns PC=0008 IR=3016, SW=8000, A=     3
 470ns PC=000a IR=0014, SW=8000, A=     3
 490ns PC=000c IR=1016, SW=8000, A=     6
 510ns PC=000e IR=3014, SW=8000, A=     6
 530ns PC=0010 IR=2000, SW=8000, A=     6
 550ns PC=0000 IR=0016, SW=8000, A=     3
 570ns PC=0002 IR=401a, SW=8000, A=     3
 590ns PC=0004 IR=5012, SW=8000, A=     3
 610ns PC=0006 IR=1018, SW=8000, A=     4
 630ns PC=0008 IR=3016, SW=8000, A=     4
 650ns PC=000a IR=0014, SW=8000, A=     6
 670ns PC=000c IR=1016, SW=8000, A=    10
 690ns PC=000e IR=3014, SW=8000, A=    10
 710ns PC=0010 IR=2000, SW=8000, A=    10
 730ns PC=0000 IR=0016, SW=8000, A=     4
 750ns PC=0002 IR=401a, SW=8000, A=     4
 770ns PC=0004 IR=5012, SW=8000, A=     4
 790ns PC=0006 IR=1018, SW=8000, A=     5
 810ns PC=0008 IR=3016, SW=8000, A=     5
 830ns PC=000a IR=0014, SW=8000, A=    10
 850ns PC=000c IR=1016, SW=8000, A=    15
 870ns PC=000e IR=3014, SW=8000, A=    15
 890ns PC=0010 IR=2000, SW=8000, A=    15
 910ns PC=0000 IR=0016, SW=8000, A=     5
 930ns PC=0002 IR=401a, SW=8000, A=     5
 950ns PC=0004 IR=5012, SW=8000, A=     5
 970ns PC=0006 IR=1018, SW=8000, A=     6
 990ns PC=0008 IR=3016, SW=8000, A=     6
1010ns PC=000a IR=0014, SW=8000, A=    15
1030ns PC=000c IR=1016, SW=8000, A=    21
1050ns PC=000e IR=3014, SW=8000, A=    21
1070ns PC=0010 IR=2000, SW=8000, A=    21
1090ns PC=0000 IR=0016, SW=8000, A=     6
1110ns PC=0002 IR=401a, SW=8000, A=     6
1130ns PC=0004 IR=5012, SW=8000, A=     6
1150ns PC=0006 IR=1018, SW=8000, A=     7
1170ns PC=0008 IR=3016, SW=8000, A=     7
1190ns PC=000a IR=0014, SW=8000, A=    21
1210ns PC=000c IR=1016, SW=8000, A=    28
1230ns PC=000e IR=3014, SW=8000, A=    28
1250ns PC=0010 IR=2000, SW=8000, A=    28
1270ns PC=0000 IR=0016, SW=8000, A=     7
1290ns PC=0002 IR=401a, SW=8000, A=     7
1310ns PC=0004 IR=5012, SW=8000, A=     7
1330ns PC=0006 IR=1018, SW=8000, A=     8
1350ns PC=0008 IR=3016, SW=8000, A=     8
1370ns PC=000a IR=0014, SW=8000, A=    28
1390ns PC=000c IR=1016, SW=8000, A=    36
1410ns PC=000e IR=3014, SW=8000, A=    36
1430ns PC=0010 IR=2000, SW=8000, A=    36
1450ns PC=0000 IR=0016, SW=8000, A=     8
1470ns PC=0002 IR=401a, SW=8000, A=     8
1490ns PC=0004 IR=5012, SW=8000, A=     8
1510ns PC=0006 IR=1018, SW=8000, A=     9
1530ns PC=0008 IR=3016, SW=8000, A=     9
1550ns PC=000a IR=0014, SW=8000, A=    36
1570ns PC=000c IR=1016, SW=8000, A=    45
1590ns PC=000e IR=3014, SW=8000, A=    45
1610ns PC=0010 IR=2000, SW=8000, A=    45
1630ns PC=0000 IR=0016, SW=8000, A=     9
1650ns PC=0002 IR=401a, SW=8000, A=     9
1670ns PC=0004 IR=5012, SW=8000, A=     9
1690ns PC=0006 IR=1018, SW=8000, A=    10
1710ns PC=0008 IR=3016, SW=8000, A=    10
1730ns PC=000a IR=0014, SW=8000, A=    45
1750ns PC=000c IR=1016, SW=8000, A=    55
1770ns PC=000e IR=3014, SW=8000, A=    55
1790ns PC=0010 IR=2000, SW=8000, A=    55
1810ns PC=0000 IR=0016, SW=8000, A=    10
1830ns PC=0002 IR=401a, SW=4000, A=    10
1850ns PC=0004 IR=5012, SW=4000, A=    10
1870ns PC=0012 IR=2012, SW=4000, A=    10
1890ns PC=0012 IR=2012, SW=4000, A=    10
1910ns PC=0012 IR=2012, SW=4000, A=    10
1930ns PC=0012 IR=2012, SW=4000, A=    10
1950ns PC=0012 IR=2012, SW=4000, A=    10
1970ns PC=0012 IR=2012, SW=4000, A=    10
1990ns PC=0012 IR=2012, SW=4000, A=    10
```

您可以看到在 1750ns 的時候，程式執行到 PC=000C 這行，也就是下列的 ADD I，計算出了 1+2+...+10 的結果，
也就是 55，然後 ST SUM 將 55 存入 SUM 中，接著 JMP LOOP 跳回 PC=0000 的 LOOP: LD I 繼續執行，然後 CMP N 
指令將載入到 A 暫存器的 I 值 (10) 與 N 的值 (10) 作比較，於是在 JEQ 指令時由於兩者已經相等，於是就跳到
EXIT 標記的 0012 去執行。

但是位於 EXIT 的指令是 JMP EXIT，也就是一個無窮迴圈程式，因此程式會不斷在 0012 這個位址重複執行，直到
2000ns  的時候被 $finish 強制結束。

```
00 16  // 00    LOOP:   LD    I    
40 1A  // 02            CMP   N    
50 12  // 04            JEQ   EXIT
10 18  // 06            ADD   K1    
30 16  // 08            ST    I    
00 14  // 0A            LD    SUM    
10 16  // 0C            ADD   I    
30 14  // 0E            ST    SUM    
20 00  // 10            JMP   LOOP
20 12  // 12    EXIT:   JMP   EXIT
00 00  // 14    SUM:    WORD  0    
00 00  // 16    I:      WORD  0    
00 01  // 18    K1:     WORD  1    
00 0A  // 1A    N:      WORD  10     
```

### 結語

在本學期筆者教授計算機結構課程的過程當中，我發現透過 16 位元 MCU0 的對照，可以更容易的讓學生瞭解
處理器的設計方式，因為若只教 32 位元處理器 CPU0 的設計，學生很難理解還有甚麼樣的方式可以設計
「另一種指令集與 CPU」，但是加入了 MCU0 之後，由於有 「16 位元 vs. 32 位元」、「單一指令格式 vs. 多種指令格式」
與「單一累積暫存器 vs. 16 個通用暫存器」的區別，學生們會更容易瞭解不同設計背後的優缺點，也才能有
足夠的背景知識可以完成他們的期末作業 -- 「自己設計一顆處理器的指令集、Verilog 程式，並用 Icarus 進行測試」
的任務。

