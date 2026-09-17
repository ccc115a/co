# 載入儲存示範：位寬與符號擴展（對應 3.1-3.5）
# 組譯：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c loadstore.s

    .text
    .globl loadstore_demo
loadstore_demo:
    # a0 = 基址，a1 = 偏移回傳；假設呼叫者已備妥可寫記憶體
    lb a2, 0(a0)              # 載入位元組（符號擴展）
    lbu a3, 0(a0)             # 載入位元組（零擴展）
    lh a4, 0(a0)              # 載入半字（符號擴展）
    lhu a5, 0(a0)             # 載入半字（零擴展）
    lw a6, 0(a0)              # 載入字（RV64 符號擴展至 64 位）
    lwu t0, 0(a0)             # 載入字（零擴展）
    ld t1, 0(a0)              # 載入雙字
    sb a2, 8(a0)              # 存位元組
    sh a4, 10(a0)             # 存半字
    sw a6, 12(a0)             # 存字
    sd t1, 16(a0)             # 存雙字
    ret
