// test/cu2rv.js：custom-0（tid/ntid/barrier）＋cu2rv DSL 編譯器測試。
// 執行：於 _web_tools/ 下 `node --test test/`（由 test/index.js 載入）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from '../lib/rvasm.js';
import { disassemble } from '../lib/rvdis.js';
import { Emulator } from '../lib/rvemu.js';
import { compileKernel } from '../lib/cu2rv.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ku = (name) => fs.readFileSync(path.join(here, '..', 'kernels', name), 'utf8');

describe('custom-0：tid/ntid/barrier', () => {
  it('編碼與 prog.s 手工 .word 一致', () => {
    assert.deepEqual(assemble('tid t0').words, [0x0000028b]);
    assert.deepEqual(assemble('ntid t1').words, [0x0000130b]);
    assert.deepEqual(assemble('barrier').words, [0x0000200b]);
  });
  it('反組譯 roundtrip', () => {
    const { words } = assemble('tid t0\nntid t1\nbarrier\n');
    const dis = disassemble(words);
    assert.ok(dis[0].includes('tid') && dis[0].includes('x5'));
    assert.ok(dis[1].includes('ntid') && dis[1].includes('x6'));
    assert.ok(dis[2].includes('barrier'));
  });
  it('barrier 限定無運算元、tid 需帶 rd', () => {
    assert.throws(() => assemble('barrier x0'), /第1行/);
    assert.throws(() => assemble('tid'), /第1行/);
  });
  it('rvemu 單通道語意：tid=0、ntid=1、barrier=nop', () => {
    const emu = new Emulator();
    emu.loadWords(assemble('tid t0\nntid t1\nbarrier\nli a0, 0\nli a7, 10\necall').words);
    const res = emu.run();
    assert.equal(emu.getReg(5), 0);
    assert.equal(emu.getReg(6), 1);
    assert.equal(res.exitCode, 0);
  });
});

describe('cu2rv：DSL 編譯', () => {
  it('vecadd.ku 產生 tid/barrier/ecall 且可組譯', () => {
    const { asm } = compileKernel(ku('vecadd.ku'));
    assert.ok(asm.includes('tid     t0'));
    assert.ok(asm.includes('barrier'));
    assert.ok(asm.includes('ecall'));
    assert.ok(!asm.includes('mul')); // 硬體無 M 擴充
    const { words } = assemble(asm);
    assert.ok(words.length > 0 && words.length <= 200);
    const dis = disassemble(words).join('\n');
    assert.ok(dis.includes('tid') && dis.includes('barrier'));
  });
  it('tiny.ku（lanes=1）rvemu 單通道跑完 exit=0', () => {
    const { asm } = compileKernel(ku('tiny.ku'));
    // emu 記憶體統一編址：程式改載入 0x1000，避開資料區 0x100..（硬體 IMEM/DMEM 分離無此問題）
    const emu = new Emulator();
    emu.loadWords(assemble(asm, { origin: 0x1000 }).words, 0x1000);
    const res = emu.run();
    assert.equal(res.exitCode, 0);
    assert.equal(emu.getReg(10), 0); // lane0 verify 錯誤數
  });
  it('saxpy.ku：param＋暫存變數可用', () => {
    const { asm } = compileKernel(ku('saxpy.ku'));
    const { words } = assemble(asm); // 可組譯即過
    assert.ok(words.length > 0);
  });
  it('錯誤案例含行號', () => {
    assert.throws(() => compileKernel('lanes 4\nn 8\nmem A @ 0x100\nmem B @ 0x120\nmem C @ 0x140\nkernel:\n  C[i] = A[i] + 1.5\n'), /行/); // 浮點
    assert.throws(() => compileKernel('lanes 4\nn 8\nmem A @ 0x100\nmem B @ 0x120\nmem C @ 0x140\nkernel:\n  C[i] = A[i] * B[i]\n'), /M 擴充/); // 變數相乘
    assert.throws(() => compileKernel('lanes 4\nn 7\nmem A @ 0x100\nmem B @ 0x120\nmem C @ 0x140\nkernel:\n  C[i] = A[i]\n'), /整除/); // n 非 lanes 倍數
    assert.throws(() => compileKernel('lanes 4\nn 8\nmem A @ 0x100\nmem B @ 0x120\nmem C @ 0x140\nkernel:\n  C[i] = D[i]\n'), /未宣告|未定義/); // 未知 mem
    assert.throws(() => compileKernel('lanes 4\nn 8\nmem A @ 0x100\nmem B @ 0x102\nmem C @ 0x140\nkernel:\n  C[i] = A[i]\n'), /對齊|重疊/); // 未對齊／重疊
    assert.throws(() => compileKernel('lanes 4\nn 8\nmem A @ 0x100\nkernel:\n  C[i] = A[i]\n'), /未宣告/); // 寫未宣告 mem
  });
});
