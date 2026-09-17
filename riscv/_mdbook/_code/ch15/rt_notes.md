# RT-Thread / ThreadX 要點短筆記（對應 15.4）

## 移植三件套（同 FreeRTOS，檔名不同）

- Tick 驅動：以 machine timer（mtime/mtimecmp）或 SBI 設定週期中斷。
- 上下文切換：存/還原 x1–x31＋sepc/sstatus（見 `freertos_ctx.s` 模式）。
- 中斷入口：`mtvec`/`stvec` 指向 trap 包裝，先存現場再進 C handler。

## RT-Thread 特色

- 物件導向核心：thread/sem/mutex/timer 皆為 `rt_object`，可用 `list` 遍歷除錯。
- `rt_hw_context_switch_to/from` 即本章 save/restore 模式；SMP 版加自旋鎖護排程器。
- 元件豐富（dfs/net/finsh），代價是 RAM/Flash 比 FreeRTOS 大一截。

## ThreadX 特色

- `tx_thread_context_save/restore`＋PIC 式中斷巢管理，強調確定性延遲。
- 中斷回應優化：中斷中直接喚醒執行緒（nested interrupt＋preemption threshold）。
- 排程為優先級搶佔＋時間片輪轉（同優先級），術語叫 thread 而非 task。

## 中斷回應優化通則

1. ISR 只做標記＋喚醒，工作丟給高優先級執行緒。
2. 關中斷區間愈短愈好；必要時用自旋鎖而非全域關中斷。
3. 高頻外設用 DMA＋中斷，勿在 ISR 輪詢搬資料。
