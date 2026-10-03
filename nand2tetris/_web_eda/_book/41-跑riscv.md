# 41 把 RV32 跑起來：`riscv_run` 與外部工具鏈

## 用法

[`cli/riscv_run.js`](../cli/riscv_run.js) 只做三件事：組譯、定步跑、印結果：

```
node cli/riscv_run.js sum.s --max 5000 [--dump A,B]
```

## 完整範例（真實輸出）

輸入是兩個 VM 檔翻出來的 `.s`（`Main.main` 把 42 存進 `static 0`，
`Sys.init` 調它，共 86 條指令）：

```
loaded sum.s (86 instructions), 跑滿 5000 步即停（不 halt）
PC=0x00000060 ra=0x0000010c (268) s1/SP=0x0001c004 (114692) a0=0x00000000 (0)
UART:

RAM[0x00011000..=0x00011007]: [42, 0]
```

讀法：第一行說共幾條、跑滿幾步；第二行是暫存器
（十六進位＋括號內有號十進位）；`UART` 是程式印出的字（這支沒有印東西）；
最後一行是 STATIC 區——`0x11000`（第 0 檔的 `static 0`）是 `42`，
答案到了。`--dump` 可加看別的區間，位址可寫十進位或 `0x`。

## 原理：組譯和執行是別人的，自己只管餵檔

RV32 的組譯器（`rvasm`）和模擬器（`rvemu`，另有反組譯 `rvdis`、
指令定義 `isa`）放在 `third_party/rvtools/`（上游 `riscv/_web_tools`
的凍結副本），是**唯讀依賴**：
這邊一行都不改，有 bug 也只能繞（例如 40 章的 `li` 坑）。
[`tools/embed.js`](../tools/embed.js) 把那四檔包成獨立的
`RvToolchain` IIFE 再匯出，就是為了不和自家 `HackAsm.assemble`
同名互蓋。

**跑滿即停是正常的**：`vm2riscv` 產物尾巴是無窮迴圈或 `Sys.halt`，
永不 halt，所以結果一律看 STATIC 區——這是設計如此，不是 bug。

語意小抄（除錯用）：`ecall a7=1` 逐字累進 `emu.uart`
（Seven 的 `7` 從這來）；`keyPressed` 讀 KBD 鏡像；
`readChar/readInt` 類沒鍵盤會空等——不是當機，是在等一個
永遠不會來的按鍵。網頁互動版（按鍵、螢幕、速度桿）見 50 章。
