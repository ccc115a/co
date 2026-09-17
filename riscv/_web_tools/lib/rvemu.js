// lib/rvemu.js：RV32 模擬器（純 ES module、零依賴）。
// 支援 INSTR 全部指令（含 M 擴充）；記憶體小端序；UART 位址 0x10000000。

import { decodeWord } from './isa.js';

export const UART_ADDR = 0x10000000;
const INT_MIN = -0x80000000;

// 無號／有號轉換小工具。
const U = (v) => v >>> 0;
const S = (v) => v | 0;

export class Emulator {
  constructor(memSize = 262144) {
    if (!Number.isInteger(memSize) || memSize <= 0) throw new Error(`記憶體大小非法：${memSize}`);
    this.memSize = memSize;
    this.mem = new Uint8Array(memSize);
    this.regs = new Uint32Array(32);
    this.reset();
  }

  reset() {
    this.regs.fill(0);
    this.pc = 0;
    this.uart = '';
    this.halted = false;
    this.exitCode = 0;
  }

  loadWords(words, origin = 0) {
    origin = origin >>> 0;
    this.checkAccess(origin, words.length * 4);
    for (let i = 0; i < words.length; i++) {
      const w = words[i] >>> 0;
      const a = origin + i * 4;
      this.mem[a] = w & 0xff;
      this.mem[a + 1] = (w >>> 8) & 0xff;
      this.mem[a + 2] = (w >>> 16) & 0xff;
      this.mem[a + 3] = (w >>> 24) & 0xff;
    }
    this.pc = origin;
    this.halted = false;
    this.exitCode = 0;
    this.uart = '';
  }

  getReg(i) {
    if (!Number.isInteger(i) || i < 0 || i > 31) throw new Error(`暫存器編號非法：${i}`);
    return this.regs[i] >>> 0;
  }

  dumpWords(addr, n) {
    addr = addr >>> 0;
    this.checkAccess(addr, n * 4);
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.loadWord(addr + i * 4));
    return out;
  }

  checkAccess(addr, len) {
    if (addr + len > this.memSize || len < 0) {
      throw new Error(`記憶體越界（缺頁）：addr=0x${(addr >>> 0).toString(16)} len=${len}`);
    }
  }

  loadByte(a) { this.checkAccess(a, 1); return this.mem[a]; }
  loadHalf(a) { this.checkAccess(a, 2); return this.mem[a] | (this.mem[a + 1] << 8); }
  loadWord(a) {
    this.checkAccess(a, 4);
    return (this.mem[a] | (this.mem[a + 1] << 8) | (this.mem[a + 2] << 16) | (this.mem[a + 3] << 24)) >>> 0;
  }
  storeByte(a, v) { this.checkAccess(a, 1); this.mem[a] = v & 0xff; }
  storeHalf(a, v) { this.checkAccess(a, 2); this.mem[a] = v & 0xff; this.mem[a + 1] = (v >>> 8) & 0xff; }
  storeWord(a, v) {
    this.checkAccess(a, 4);
    this.mem[a] = v & 0xff; this.mem[a + 1] = (v >>> 8) & 0xff;
    this.mem[a + 2] = (v >>> 16) & 0xff; this.mem[a + 3] = (v >>> 24) & 0xff;
  }

  // 寫暫存器：x0 寫入忽略。
  setReg(rd, v) {
    if (rd !== 0) this.regs[rd] = v >>> 0;
  }

  step() {
    if (this.halted) return { pc: this.pc >>> 0, word: 0, halted: true };
    const pc = this.pc >>> 0;
    const word = this.loadWord(pc); // 越界即 throw（缺頁）
    const d = decodeWord(word);
    const { op, rd, rs1, rs2, funct3: f3, funct7: f7, imm } = d;
    const rv1 = this.regs[rs1] >>> 0, rv2 = this.regs[rs2] >>> 0;
    const sv1 = rv1 | 0, sv2 = rv2 | 0;
    let next = (pc + 4) >>> 0;

    const branchTaken = (cond) => { if (cond) next = (pc + imm) >>> 0; };
    const loadAddr = (rv1 + imm) >>> 0; // rs1+imm（載入／儲存共用）

    switch (op) {
      case 0x37: this.setReg(rd, word & 0xfffff000); break; // lui
      case 0x17: this.setReg(rd, (pc + (word & 0xfffff000)) >>> 0); break; // auipc
      case 0x6f: // jal
        this.setReg(rd, pc + 4);
        next = (pc + imm) >>> 0;
        break;
      case 0x67: { // jalr（僅 f3=0）
        if (f3 !== 0) throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        const t = ((rv1 + imm) & ~1) >>> 0;
        this.setReg(rd, pc + 4);
        next = t;
        break;
      }
      case 0x03: { // 載入
        const a = loadAddr;
        if (a === UART_ADDR) throw new Error(`UART 位址不可讀：pc=0x${pc.toString(16)}`);
        switch (f3) {
          case 0: this.setReg(rd, (this.loadByte(a) << 24) >> 24); break; // lb 符號擴展
          case 1: this.setReg(rd, (this.loadHalf(a) << 16) >> 16); break; // lh
          case 2: this.setReg(rd, this.loadWord(a)); break; // lw
          case 4: this.setReg(rd, this.loadByte(a)); break; // lbu
          case 5: this.setReg(rd, this.loadHalf(a)); break; // lhu
          default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      }
      case 0x23: { // 儲存
        const a = loadAddr;
        if (a === UART_ADDR) {
          // SB／SW 往 UART：追加低位元組，不真寫記憶體。
          if (f3 === 0 || f3 === 2) this.uart += String.fromCharCode(rv2 & 0xff);
          else throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
          break;
        }
        switch (f3) {
          case 0: this.storeByte(a, rv2); break;
          case 1: this.storeHalf(a, rv2); break;
          case 2: this.storeWord(a, rv2); break;
          default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      }
      case 0x13: { // I 型算術
        switch (f3) {
          case 0: this.setReg(rd, (sv1 + imm) | 0); break; // addi
          case 1: // slli（高位須為 0）
            if ((imm & 0xfe0) !== 0) throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
            this.setReg(rd, (rv1 << (imm & 0x1f)) >>> 0); break;
          case 2: this.setReg(rd, sv1 < imm ? 1 : 0); break; // slti
          case 3: this.setReg(rd, rv1 < U(imm) ? 1 : 0); break; // sltiu（imm 零擴展比較）
          case 4: this.setReg(rd, (sv1 ^ imm) | 0); break; // xori
          case 5:
            if ((imm & 0x400) === 0 && (imm & 0xfe0) === 0) this.setReg(rd, (rv1 >>> (imm & 0x1f)) >>> 0); // srli
            else if ((imm & 0xfe0) === 0x400) this.setReg(rd, (sv1 >> (imm & 0x1f)) >>> 0); // srai
            else throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
            break;
          case 6: this.setReg(rd, (sv1 | imm) | 0); break; // ori
          case 7: this.setReg(rd, (sv1 & imm) | 0); break; // andi
          default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      }
      case 0x33: { // R 型（含 M 擴充）
        const sh = rv2 & 0x1f;
        if (f7 === 0x00 || (f7 === 0x20 && (f3 === 0 || f3 === 5))) {
          switch (f3) {
            case 0:
              if (f7 === 0x00) this.setReg(rd, (sv1 + sv2) | 0); // add
              else this.setReg(rd, (sv1 - sv2) | 0); // sub
              break;
            case 1: this.setReg(rd, (rv1 << sh) >>> 0); break; // sll
            case 2: this.setReg(rd, sv1 < sv2 ? 1 : 0); break; // slt
            case 3: this.setReg(rd, rv1 < rv2 ? 1 : 0); break; // sltu
            case 4: this.setReg(rd, (sv1 ^ sv2) >>> 0); break; // xor
            case 5:
              if (f7 === 0x00) this.setReg(rd, (rv1 >>> sh) >>> 0); // srl
              else this.setReg(rd, (sv1 >> sh) >>> 0); // sra
              break;
            case 6: this.setReg(rd, (sv1 | sv2) >>> 0); break; // or
            case 7: this.setReg(rd, (sv1 & sv2) >>> 0); break; // and
            default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
          }
        } else if (f7 === 0x01) {
          const a = BigInt(sv1), b = BigInt(sv2);
          const ua = BigInt(rv1), ub = BigInt(rv2);
          const M32 = BigInt(0xffffffff);
          switch (f3) {
            case 0: this.setReg(rd, Number((a * b) & M32)); break; // mul 取低 32
            case 1: this.setReg(rd, Number((a * b >> BigInt(32)) & M32)); break; // mulh
            case 2: this.setReg(rd, Number((a * ub >> BigInt(32)) & M32)); break; // mulhsu
            case 3: this.setReg(rd, Number((ua * ub >> BigInt(32)) & M32)); break; // mulhu
            case 4: // div：除零→-1，溢出（INT_MIN/-1）→被除數
              if (sv2 === 0) this.setReg(rd, -1);
              else if (sv1 === INT_MIN && sv2 === -1) this.setReg(rd, INT_MIN);
              else this.setReg(rd, Math.trunc(sv1 / sv2));
              break;
            case 5: // divu：除零→全 1
              this.setReg(rd, sv2 === 0 ? 0xffffffff : Math.floor(rv1 / rv2));
              break;
            case 6: // rem：除零→被除數，溢出→0
              if (sv2 === 0) this.setReg(rd, sv1);
              else if (sv1 === INT_MIN && sv2 === -1) this.setReg(rd, 0);
              else this.setReg(rd, sv1 % sv2);
              break;
            case 7: // remu：除零→被除數
              this.setReg(rd, sv2 === 0 ? rv1 : rv1 % rv2);
              break;
            default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
          }
        } else {
          throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      }
      case 0x63: // B 型分支
        switch (f3) {
          case 0: branchTaken(sv1 === sv2); break;
          case 1: branchTaken(sv1 !== sv2); break;
          case 4: branchTaken(sv1 < sv2); break;
          case 5: branchTaken(sv1 >= sv2); break;
          case 6: branchTaken(rv1 < rv2); break;
          case 7: branchTaken(rv1 >= rv2); break;
          default: throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        }
        break;
      case 0x0f: break; // fence：空運算
      case 0x73: { // ecall／ebreak
        if (f3 !== 0) throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        if (imm === 1) { this.halted = true; this.exitCode = 0; break; } // ebreak：停機
        if (imm !== 0) throw new Error(`未支援指令：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
        const a7 = this.regs[17] >>> 0, a0 = this.regs[10] >>> 0;
        if (a7 === 1) this.uart += String.fromCharCode(a0 & 0xff);
        else if (a7 === 10) { this.halted = true; this.exitCode = a0 | 0; }
        else throw new Error(`ECALL 未支援的 a7=${a7}：pc=0x${pc.toString(16)}`);
        break;
      }
      default:
        throw new Error(`未支援 opcode 0x${op.toString(16)}：pc=0x${pc.toString(16)} word=0x${word.toString(16)}`);
    }

    this.pc = next;
    return { pc, word, halted: this.halted };
  }

  run({ maxSteps = 100000 } = {}) {
    let steps = 0;
    while (!this.halted) {
      if (steps >= maxSteps) throw new Error(`超過最大步數 ${maxSteps}`);
      this.step();
      steps++;
    }
    return { steps, halted: this.halted, exitCode: this.exitCode, uart: this.uart };
  }
}
