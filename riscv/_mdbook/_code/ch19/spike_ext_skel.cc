// spike_ext_skel.cc：Spike 自訂指令擴充骨架（對應書 19.3）
// 本檔為骨架示意（不求直接編過）：重點是三個銜接點的註解。
// 完整流程與指令見 spike_notes.md。

// 需 riscv-isa-sim 標頭：#include "riscv/extension.h"
// 建共享庫：g++ -shared -fPIC -I<isa-sim> -o libcustom_add.so spike_ext_skel.cc
// 掛載測試：spike --extension=custom_add pk custom_add.elf

// 銜接點 1：語義函式（每條自訂指令一個）
// - 巨集：RS1/RS2 讀來源暫存器，WRITE_RD 寫目的暫存器
// - 非法情況拋 trap_illegal_instruction
// 範例語義：RD = RS1 + RS2（與 custom_add.s 的 t0 = t1 + t2 對應）
// DEFINE_INSN(custom_add) {
//   WRITE_RD((reg_t)((int64_t)RS1 + (int64_t)RS2));
// }

// 銜接點 2：get_instructions（向 Spike 登記編碼表）
// - 回傳 vector<insn_desc_t>，每項含 match/mask（custom-0：match 0x0b，mask 0x7f）
// - mask 須覆蓋 opcode 7 位＋funct3/funct7，避免誤吃標準指令
// std::vector<insn_desc_t> get_instructions() {
//   return { {0x0000000b, 0xfe00707f, &custom_add_desc} };  // 示意：funct7=0,funct3=0
// }

// 銜接點 3：註冊（讓 --extension=custom_add 找得到）
// - 舊版：在 riscv/extension.cc 登記；新版：以外掛 .so 匯出 REGISTER_EXTENSION
// - 檔名、外掛名、--extension= 參數三者須一致
// REGISTER_EXTENSION(custom_add, []() { return new custom_add_t; });
