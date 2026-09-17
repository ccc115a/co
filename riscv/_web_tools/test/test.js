// test/test.js：RV32 工具鏈測試（node:test＋node:assert）。
// 執行：於 _web_tools/ 下 `node --test test/`。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REG, regNum, encodeR, encodeI, encodeS, encodeB, encodeU, encodeJ, decodeWord, INSTR, PSEUDO } from '../lib/isa.js';
import { assemble } from '../lib/rvasm.js';
import { disassemble } from '../lib/rvdis.js';
import { Emulator } from '../lib/rvemu.js';

describe('isa：暫存器', () => {
  it('ABI 名、x 名、大小寫皆可', () => {
    assert.equal(regNum('zero'), 0);
    assert.equal(regNum('ra'), 1);
    assert.equal(regNum('x0'), 0);
    assert.equal(regNum('x31'), 31);
    assert.equal(regNum('SP'), 2);
    assert.equal(regNum('T0'), 5);
    assert.equal(regNum('Fp'), 8);
    assert.equal(regNum('a7'), 17);
    assert.equal(REG.t6, 31);
    assert.equal(REG.s0, 8);
  });
  it('非法暫存器 throw', () => {
    assert.throws(() => regNum('x32'), Error);
    assert.throws(() => regNum('foo'), Error);
    assert.throws(() => regNum(''), Error);
  });
});

describe('isa：encode 已知向量', () => {
  it('add x2, x1, x2 = 0x00208133', () => {
    assert.equal(encodeR(0x33, 2, 1, 2, 0, 0), 0x00208133);
  });
  it('lui x1, 0x12345 = 0x123450b7', () => {
    assert.equal(encodeU(0x37, 1, 0x12345), 0x123450b7);
  });
  it('addi x2, x1, 5 = 0x00508113', () => {
    assert.equal(encodeI(0x13, 2, 1, 0, 5), 0x00508113);
  });
  it('sw x2, 8(x1) = 0x0020a423', () => {
    assert.equal(encodeS(0x23, 1, 2, 2, 8), 0x0020a423);
  });
  it('beq x1, x2, 8 = 0x00208463', () => {
    assert.equal(encodeB(0x63, 1, 2, 0, 8), 0x00208463);
  });
  it('jal x1, 8 = 0x008000ef', () => {
    assert.equal(encodeJ(0x6f, 1, 8), 0x008000ef);
  });
  it('立即數超出範圍 throw', () => {
    assert.throws(() => encodeI(0x13, 1, 0, 0, 5000), Error); // addi 12 位
    assert.throws(() => encodeI(0x13, 1, 0, 0, -2049), Error);
    assert.throws(() => encodeB(0x63, 1, 2, 0, 7), Error); // 奇數位移
    assert.throws(() => encodeB(0x63, 1, 2, 0, 5000), Error); // 超距
    assert.throws(() => encodeJ(0x6f, 1, 1), Error); // 奇數位移
    assert.throws(() => encodeJ(0x6f, 1, 1 << 20), Error); // 超距
    assert.throws(() => encodeU(0x37, 1, 0x100000), Error); // 20 位
  });
});

describe('isa：decode 與指令表', () => {
  it('decode 0x00208133 還原 add 欄位', () => {
    const d = decodeWord(0x00208133);
    assert.equal(d.op, 0x33);
    assert.equal(d.rd, 2);
    assert.equal(d.rs1, 1);
    assert.equal(d.rs2, 2);
    assert.equal(d.funct3, 0);
    assert.equal(d.funct7, 0);
    assert.equal(d.fmt, 'R');
  });
  it('decode 各格式 imm 符號擴展', () => {
    assert.equal(decodeWord(encodeI(0x13, 2, 1, 0, -1)).imm, -1);
    assert.equal(decodeWord(encodeS(0x23, 1, 2, 2, -8)).imm, -8);
    assert.equal(decodeWord(encodeB(0x63, 1, 2, 0, -12)).imm, -12);
    assert.equal(decodeWord(encodeJ(0x6f, 1, -20)).imm, -20);
    assert.equal(decodeWord(encodeU(0x37, 1, 0x12345)).imm, 0x12345000 | 0);
  });
  it('INSTR 含 RV32I＋M 擴充 8 條＋fence/ecall/ebreak', () => {
    const mns = INSTR.map(e => e.mn);
    for (const m of ['lui', 'auipc', 'jal', 'jalr', 'beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu',
      'lb', 'lh', 'lw', 'lbu', 'lhu', 'sb', 'sh', 'sw',
      'addi', 'slti', 'sltiu', 'xori', 'ori', 'andi', 'slli', 'srli', 'srai',
      'add', 'sub', 'sll', 'slt', 'sltu', 'xor', 'srl', 'sra', 'or', 'and',
      'fence', 'ecall', 'ebreak']) assert.ok(mns.includes(m), m);
    for (const m of ['mul', 'mulh', 'mulhsu', 'mulhu', 'div', 'divu', 'rem', 'remu']) {
      const e = INSTR.find(x => x.mn === m);
      assert.ok(e, m);
      assert.equal(e.fmt, 'R');
      assert.equal(e.op, 0x33);
      assert.equal(e.f7, 0x01);
    }
    for (const e of INSTR) assert.ok(['R', 'I', 'S', 'B', 'U', 'J', 'G'].includes(e.fmt), e.mn);
  });
  it('PSEUDO 含 8 個虛擬指令', () => {
    for (const m of ['nop', 'li', 'mv', 'not', 'neg', 'j', 'jr', 'ret', 'call']) {
      assert.ok(PSEUDO.includes(m), m);
    }
  });
});

describe('rvasm', () => {
  it('roundtrip：asm→dis 含關鍵字', () => {
    const src = [
      'main: add x2, x1, x2',
      '  sw x2, 8(x1)',
      '  lw x3, 8(x1)',
      '  beq x1, x2, main',
      '  jal x1, main',
    ].join('\n');
    const { words, labels, listing } = assemble(src);
    assert.equal(words.length, 5);
    assert.equal(labels.get('main'), 0);
    assert.equal(listing[0].addr, 0);
    assert.equal(listing[0].word, 0x00208133);
    const dis = disassemble(words);
    assert.ok(dis[0].includes('add') && dis[0].includes('x2'));
    assert.ok(dis[1].includes('sw'));
    assert.ok(dis[2].includes('lw'));
    assert.ok(dis[3].includes('beq'));
    assert.ok(dis[4].includes('jal'));
  });
  it('dis 格式為 addr8hex: word8hex  mn ops', () => {
    const dis = disassemble([0x00208133]);
    assert.deepEqual(dis, ['00000000: 00208133  add x2, x1, x2']);
    const dis2 = disassemble([0x00208133], 0x100);
    assert.ok(dis2[0].startsWith('00000100: '));
  });
  it('未知編碼印 (unknown) 不 throw', () => {
    const dis = disassemble([0xffffffff, 0x00000000]);
    assert.ok(dis[0].includes('(unknown)'));
    assert.ok(dis[1].includes('(unknown)'));
  });
  it('li 小數展成單條 addi', () => {
    const { words } = assemble('li x1, 5');
    assert.deepEqual(words, [encodeI(0x13, 1, 0, 0, 5)]);
  });
  it('li 大數展成 lui+addi 且值正確', () => {
    const { words } = assemble('li t0, 0x12345');
    assert.equal(words.length, 2);
    const emu = new Emulator();
    emu.loadWords([...words, 0x00100073]); // ebreak 停機
    emu.run();
    assert.equal(emu.getReg(5), 0x12345);
  });
  it('li 負大數值正確', () => {
    const { words } = assemble('li t0, -70000');
    const emu = new Emulator();
    emu.loadWords([...words, 0x00100073]); // ebreak 停機（li 負大數）
    emu.run();
    assert.equal(emu.getReg(5), (-70000) >>> 0);
  });
  it('call/j/ret/nop/mv 展開', () => {
    const { words } = assemble(['call func', 'j end', 'func: ret', 'end: nop'].join('\n'));
    assert.equal(words.length, 4);
    assert.equal(words[0], encodeJ(0x6f, 1, 8)); // call → jal ra, func
    assert.equal(words[1], encodeJ(0x6f, 0, 8)); // j → jal x0, end
    assert.equal(words[2], encodeI(0x67, 0, 1, 0, 0)); // ret → jalr x0, 0(ra)
    assert.equal(words[3], encodeI(0x13, 0, 0, 0, 0)); // nop
    const { words: w2 } = assemble('mv x1, x2');
    assert.deepEqual(w2, [encodeI(0x13, 1, 2, 0, 0)]);
  });
  it('.word/.byte/.ascii/.asciz 與註解', () => {
    const { words } = assemble([
      '# 全行註解',
      '.word 1, 0x2, -1  # 行尾註解',
      '.byte 0x41, 0x42',
      '.ascii "Hi"',
      '.asciz "OK"',
    ].join('\n'));
    assert.equal(words[0], 1);
    assert.equal(words[1], 2);
    assert.equal(words[2], 0xffffffff);
    const dump = Buffer.from(words.slice(3).flatMap(w =>
      [w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff, (w >>> 24) & 0xff]));
    assert.deepEqual([...dump.slice(0, 7)], [0x41, 0x42, 0x48, 0x69, 0x4f, 0x4b, 0x00]);
  });
  it('fence/ecall/ebreak 與 M 指令組譯', () => {
    const { words } = assemble('fence\necall\nebreak\nmul x1, x2, x3\ndiv x4, x5, x6');
    assert.equal(words[0], 0x0000000f);
    assert.equal(words[1], 0x00000073);
    assert.equal(words[2], 0x00100073);
    const dis = disassemble(words);
    assert.ok(dis[0].includes('fence') && dis[1].includes('ecall') && dis[2].includes('ebreak'));
    assert.ok(dis[3].includes('mul') && dis[4].includes('div'));
  });
  it('錯誤案例 throw 且含行號', () => {
    assert.throws(() => assemble('add x1, x2, x3\nfoo x1, x2'), /第2行/);
    assert.throws(() => assemble('add x32, x1, x2'), /第1行/);
    assert.throws(() => assemble('addi x1, x2, 5000'), /第1行/);
    const far = 'beq x1, x0, far\n.word ' + new Array(1500).fill(0).join(',') + '\nfar: nop';
    assert.throws(() => assemble(far), /第1行/);
    assert.throws(() => assemble('beq x1, x2, nosuch'), /第1行/);
    assert.throws(() => assemble('dup: nop\ndup: nop'), /第2行/);
  });
  it('origin 影響標籤與 listing 位址', () => {
    const r = assemble('main: nop', { origin: 0x100 });
    assert.equal(r.labels.get('main'), 0x100);
    assert.equal(r.listing[0].addr, 0x100);
    assert.deepEqual(r.errors, []);
  });
});

describe('rvemu', () => {
  it('UART hello（ecall a7=1）', () => {
    const src = [
      'li a0, 72', 'li a7, 1', 'ecall', // H
      'li a0, 105', 'ecall', // i（a7 仍為 1）
      'li a0, 0', 'li a7, 10', 'ecall',
    ].join('\n');
    const emu = new Emulator();
    emu.loadWords(assemble(src).words);
    const res = emu.run();
    assert.equal(res.uart, 'Hi');
    assert.equal(res.halted, true);
    assert.equal(res.exitCode, 0);
  });
  it('1..10 求和 = 55（exit code）', () => {
    const src = [
      'li t0, 0', 'li t1, 1', 'li t2, 11',
      'loop: add t0, t0, t1',
      'addi t1, t1, 1',
      'blt t1, t2, loop',
      'mv a0, t0',
      'li a7, 10', 'ecall',
    ].join('\n');
    const emu = new Emulator();
    emu.loadWords(assemble(src).words);
    const res = emu.run();
    assert.equal(res.exitCode, 55);
    assert.equal(emu.getReg(10), 55);
  });
  it('M 擴充乘法 mul', () => {
    const emu = new Emulator();
    emu.loadWords(assemble('li a0, 6\nli a1, 7\nmul a0, a0, a1\nli a7, 10\necall').words);
    const res = emu.run();
    assert.equal(res.exitCode, 42);
  });
  it('ecall exit code 回傳 a0', () => {
    const emu = new Emulator();
    emu.loadWords(assemble('li a0, 42\nli a7, 10\necall').words);
    assert.equal(emu.run().exitCode, 42);
  });
  it('SB／SW 到 0x10000000 送 UART', () => {
    const emu = new Emulator();
    emu.loadWords(assemble([
      'li t0, 0x10000000',
      'li a0, 65', 'sb a0, 0(t0)', // A
      'li a0, 0x142', 'sw a0, 0(t0)', // 低位元組 B
      'li a0, 0', 'li a7, 10', 'ecall',
    ].join('\n')).words);
    const res = emu.run();
    assert.equal(res.uart, 'AB');
  });
  it('除零語意依 RISC-V 規範', () => {
    const emu = new Emulator();
    emu.loadWords(assemble([
      'li t0, 10',
      'div t1, t0, x0', // → -1
      'divu t2, t0, x0', // → 全 1
      'rem t3, t0, x0', // → 被除數
      'remu t4, t0, x0', // → 被除數
      'li t5, 0x80000000', 'li t6, -1',
      'div s0, t5, t6', // 溢出 → 被除數
      'rem s1, t5, t6', // 溢出 → 0
      'li a7, 10', 'ecall',
    ].join('\n')).words);
    emu.run();
    assert.equal(emu.getReg(6), 0xffffffff); // t1 = div(10, 0) → -1
    assert.equal(emu.getReg(7), 0xffffffff); // t2 = divu(10, 0) → 全 1
    assert.equal(emu.getReg(28), 10); // t3 = rem(10, 0) → 被除數
    assert.equal(emu.getReg(29), 10); // t4 = remu(10, 0) → 被除數
    assert.equal(emu.getReg(8), 0x80000000); // s0 = 溢出除法 → 被除數
    assert.equal(emu.getReg(9), 0); // s1 = 溢出餘數 → 0
  });
  it('x0 恆零', () => {
    const emu = new Emulator();
    emu.loadWords(assemble('addi x0, x0, 5\nli x0, 99\nli a7, 10\necall').words);
    emu.step();
    emu.step();
    assert.equal(emu.getReg(0), 0);
  });
  it('step 回傳、dumpWords、reset 與錯誤', () => {
    const emu = new Emulator();
    emu.loadWords(assemble('nop').words);
    const s = emu.step();
    assert.equal(s.pc, 0);
    assert.equal(s.word, 0x00000013);
    assert.deepEqual(emu.dumpWords(0, 1), [0x00000013]);
    emu.reset();
    assert.equal(emu.getReg(0), 0);
    // 未支援 opcode throw
    const bad = new Emulator();
    bad.loadWords([0xffffffff]);
    assert.throws(() => bad.step(), Error);
    // 越界（缺頁）throw
    const tiny = new Emulator(4);
    tiny.loadWords([0x00000013]);
    tiny.step();
    assert.throws(() => tiny.step(), Error);
    // run 超步數 throw
    const loop = new Emulator();
    loop.loadWords(assemble('here: j here').words);
    assert.throws(() => loop.run({ maxSteps: 100 }), /步數/);
    // 未支援的 ecall a7 throw
    const e = new Emulator();
    e.loadWords(assemble('li a7, 2\necall').words);
    assert.throws(() => e.run(), /a7/);
  });
});
