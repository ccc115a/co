# Riscv5stage — RV 風格迷你處理器（Nand2Tetris HackHDL）

本目錄在 Nand2Tetris 的 HackHDL 平台上，自製一個「簡化版 RISC-V」處理器：
32 位元資料通路、16 位元指令、8 個暫存器（x0..x7），分兩顆核心實作同樣的指令集：

| 核心 | 組織 | 狀態 |
|------|------|------|
| `Rv1.hdl` | 單週期（IF+ID+EX+WB 合一） | 通過全部測試 |
| `Rv5.hdl` | 五級管線（IF/ID/EX/MEM/WB）＋前饋＋stall＋flush | 通過全部測試 |

兩顆核心執行相同程式，產出相同的暫存器/記憶體最終狀態（`Rv1*.cmp` 與 `Rv5*.cmp`
對照同一批 `prog*.bin`）。

## 指令集（RvMini ISA，16 位元）

| 指令 | 格式 | 說明 |
|------|------|------|
| `LI rd, imm9` | `0 rd[11:9] imm9[8:0]` | rd = 有號 imm9（進 32 位元高半做號展） |
| `AND/ADD/SUB/OR rd,rs1,rs2` | `1..4 rd rs1 rs2 sel[1:0]` | ALU：AND=01、ADD=10、SUB=11、OR=00 |
| `LW rd, rs1, off6` | `5 rd rs1 off6[5:0]` | rd = mem[rs1+off] |
| `SW rs1, rs2, off6` | `6 off6[11:6] rs1[5:3] rs2[2:0]` | mem[rs1+off] = rs2 |
| `BEQ rs1, rs2, off6` | `7 off6[11:6] rs1[5:3] rs2[2:0]` | rs1==rs2 → pc+1+off |
| `JAL rd, off9` | `8 rd[11:9] off9[8:0]` | rd = link(pc+1)；pc = pc+1+off |
| `HALT` | `9` | 永久凍結 PC |
| `NOP` | `= LI x0,0` | 空轉 |

- 全為 word 定址，off/imm 為有號 word 偏移。
- x0 恆為 0 且永不寫入。
- 32 位元值一律以 lo[16]+hi[16] 兩條 bus 傳遞（HackHDL 無 32 位元 bus 字面值）。

## 目錄結構

```
Rv1.hdl        單週期核心（基準實作，用來對拍管線正確性）
Rv5.hdl        五級管線核心（本專案主角）
asm.py         RvMini 組譯器：.asm → .bin（每行一個 16 位元指令）
prog1.asm      綜合測試程式（前遞 1/2 級、SW/LW、load-use stall、BEQ 不跳、
               JAL 連結與 flush）
prog2.asm      向後迴圈測試（累加 3+2+1、向後 JAL、BEQ 跳出、x0 不寫入）
Rv1.tst        單週期@prog1；Rv1_2.tst 單週期@prog2
Rv5.tst        管線@prog1；   Rv5_2.tst 管線@prog2
Rv{1,1_2,5,5_2}.cmp 對照檔（由通過的 .out 複製產生，與 .bin 一起提交）
verify.sh      一步驗證：重組譯 + 跑全部 .tst，必須全 PASS
_lib/          教材缺件的自製晶片：Mem32(2×RAM16K)、Rf8x16、Alu32、Dec、
               PR2/PR7/PR11、Pad3/Pad6、Xor16…
```

## Rv5 物線設計要點

管線暫存器：
- `IF/ID = PR2`（指令、fetchPc）
- `ID/EX = PR11`（兩份運算元 lo/hi、offA、offB、imm、pc、rd、ctl、rs 欄
  — rs 欄位供前遞比對）
- `EX/MEM = PR7`（ALU 結果、store 資料、imm、rd、ctl)
- `MEM/WB = PR7`（記憶體讀回、ALU 結果、imm、rd、ctl）

前饋與危障（關鍵：本工具的 tick 取樣 / tock 提交模型決定了時序）：
1. **ID/EX 輸入端**（PR11 前）：抓 EX/MEM 級（差 2 拍，較新）與 MEM/WB 級
   （差 3 拍）的現成產出，覆蓋 RAW 舊值。若少了這一層，差 3 拍的產出者
   （如連續 LI 後馬上被讀）會在消費指令進 EX 前就離開 WB，讀到舊值。
2. **EX 輸入端**：consumer 在 ID 時 producer 才在 EX（差 1 拍），用 EX/MEM
   級的現成結果再覆蓋一次（例如 ADD 結果馬上被下一條 SUB 使用）。
3. **load-use stall**：只要 EX 是 LW（`ctlX[9]=1`）且目標暫存器被 ID 指令用到，
   凍結 PC 與 IF/ID、塞一顆 NOP 進 ID/EX，等一拍；之後 LW 進 MEM 級，
   RAM16K 為組合式讀取，讀出值可直接經 EX/MEM 級前遞。
4. **BEQ/JAL**：EX 解出 taken/jal → 清掉 IF/ID（flush）＋ PC 跳目標。
   目標一律以「該指令自己的 pcX」＋1＋off 計算（不能用流動的現役 PC）。
   JAL 會同時寫回 link（W 級走 alu 通道，EX 時 `aluLoM=pcX+1`）。
5. **HALT**：任一級解到 HALT 即用 self-holding latch 永久凍結 PC，
   之後每拍都塞 NOP 進管線。

## 建置與測試

```bash
# 組譯範例
python3 asm.py prog1.asm prog2.asm

# 單一測試（跑 01/02/03a/03b/05 + 本目錄的晶片）
node ../_web_eda16/cli/hdl2js.js \
  --dir ../01 --dir ../02 --dir ../03/a --dir ../03/b --dir ../05 \
  --dir . --test Rv5.tst

# 一鍵驗證（組譯 + 全部 .tst）
bash verify.sh
```

測試皆為 `compare-to .cmp`：先跑出 `.out`，確認結果正確後把 `.out` 複製成
`.cmp`（暫存器/記憶體最終狀態與 PC 全凍結為 HALT 後的樣子）。