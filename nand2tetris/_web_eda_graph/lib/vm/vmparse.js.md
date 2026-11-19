# lib/vm/vmparse.js —— VM 文字行共用解析

`splitArgs(trimmed)` 吃已 `trim` 的非空行，吐 `{ cmd, a1, a2, hasA2 }`
（`a2` 能轉整數就轉數字，否則留原文；`hasA2` 表第三欄是否存在），
`trim`／`removeComment`／`fileBase`（取檔名，含副檔名）與原兩份內聯碼逐字一致。

呼叫端（`lib/asm/vm2asm.js`、`lib/riscv/vm2riscv.js`）各自保留參數檢查，
因兩邊規則不同（見本檔頭註解）；去副檔名（vm2asm）與消毒（vm2riscv
`sanFile`）亦各自處理——共用只到「切行」為止，不碰語意。
