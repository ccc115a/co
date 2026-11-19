# 40 同一支 VM，第二種跑法：`vm2riscv`

## 用法

[`cli/vm2riscv.js`](../cli/vm2riscv.js)：`node cli/vm2riscv.js <out>.s <in>.vm`
（輸出在前，可加 `--lenient` 只檢視不執行）。
21 章那段 `push constant 7 / push constant 8 / add` 交給它：

```
node cli/vm2riscv.js add.s add.vm
```

## 完整範例（上段指令的真實輸出，全文）

```
.text

# ========== File: /tmp/bookex/add.vm ==========
# push constant 7
li t0, 7
sw t0, 0(s1)
addi s1, s1, 4
# push constant 8
li t0, 8
sw t0, 0(s1)
addi s1, s1, 4
# add
addi s1, s1, -4
lw t1, 0(s1)
addi s1, s1, -4
lw t0, 0(s1)
add t0, t0, t1
sw t0, 0(s1)
addi s1, s1, 4
```

對照 21 章看：行前一樣有 `# 原文`；`@SP` 變成 `s1` 加減 4；
值一樣經 `t0` 中轉。只是換了暫存器名字和指令助憶符——
「兩種跑法同構」就是這個意思。[`vm2riscv.js`](../lib/riscv/vm2riscv.js)
只用兩邊都懂的子集（真指令＋`li/mv/j/jr/ret/call`＋`.text/.word`）。

## 原理：先畫記憶體地圖，再逐條翻譯

RV32 的暫存器和記憶體長得不一樣，所以先約定位置：

| 用途 | 放哪 |
|---|---|
| VM 堆疊（`s1`＝SP，向上長） | `0x1C000` 起 |
| LCL／ARG／THIS／THAT | `s2/s3/s4/s5`（RV 的 callee-saved，呼叫中不死） |
| `temp`、`static` | 固定位址區（`0x10000`、`0x11000` 起，每檔分一段） |
| Jack 的 word 世界（heap／SCREEN／KBD） | 整塊鏡像到 `0x20000` 起（`byte位址＝0x20000＋4W`） |

真值沿 Hack（true＝-1），整數 32-bit（Hack 原生 16-bit，小數字行為一致）。

三個手法：**堆疊原語**（值放 `t0`，`sw`＋`s1` 加減即 push／pop；
比較用 `slt/sltiu` 拼 `eq/gt/lt`，RISC-V 沒有整條的比較跳轉）；
**函式幀**（沿 Hack 五格格式；`jal` 寫下的返回位址由 callee 序幕第一行
回填進堆疊——不能先 push ra，`jal` 會蓋掉它——返回用 `jalr`，巢狀安全）；
**OS 內聯**（最關鍵：`Math.multiply/divide` 直接變 `mul/div`，
`Output.print*` 變 UART 的 `ecall`，因為附帶的裁剪版 OS 把 `Output`
留空——不內聯的話 `Seven` 的 `7` 永遠印不出來；其餘 OS 呼叫嚴格模式
直接報錯，`lenient` 照發 `jal` 僅供檢視）。

一個坑：**`li` 符號版**。rvasm 第一遍固定留兩格給 `li rd,標籤`，
小位址第二遍只吐一格，會留下 `0x0` 非法字。全程只用數字版 `li`，
return 位址和 static 一律走暫存器與固定位址繞開。

（整檔包在 `Vm2Rv` IIFE 裡：打包後全域同作用域，不包會和 `vm2asm`
的同名函式互蓋——50 章打包節會再提到。）
