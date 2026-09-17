// inline_asm.c：RISC-V 行內組語（對應書 18.3）
// 示範 csrr 讀 cycle CSR 與 auipc 取 PC；僅需 -c 編過（不連結）。
// 驗證：riscv64-unknown-elf-gcc -march=rv64gc -mabi=lp64d -c inline_asm.c
// 注：RV32 須顯式加 zicsr（書 18.2）：-march=rv32imac_zicsr_zifencei，否則 csrr 組譯報錯

// 讀時間基準：cycle CSR（低權限可讀）
static inline unsigned long r_cycle(void) {
  unsigned long x;
  __asm__ volatile("csrr %0, cycle" : "=r"(x));  // 輸出：任一通用暫存器
  return x;
}

// 取目前 PC：auipc 加 0 立即數（結果即本指令位址附近）
static inline unsigned long r_pc(void) {
  unsigned long x;
  __asm__ volatile("auipc %0, 0" : "=r"(x));
  return x;
}

int main(void) {
  unsigned long t0 = r_cycle();  // 起始 tick
  unsigned long pc = r_pc();     // 取樣 PC
  unsigned long t1 = r_cycle();  // 結束 tick
  return (t1 > t0 && pc != 0) ? 0 : 1;
}
