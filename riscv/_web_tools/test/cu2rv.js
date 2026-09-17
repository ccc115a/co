// test/cu2rv.js：custom-0（tid/ntid/barrier）＋cu2rv 高階 DSL 編譯器測試。
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

// emu 統一編址：程式載入 0x1000，避開 0x100.. 資料區（硬體 IMEM/DMEM 分離無此問題）
function runSingle(asmText) {
  const emu = new Emulator();
  emu.loadWords(assemble(asmText, { origin: 0x1000 }).words, 0x1000);
  return { emu, res: emu.run() };
}

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

describe('cu2rv：高階 DSL 編譯', () => {
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
  it('全部 kernels/*.ku 可編譯＋可組譯', () => {
    for (const f of ['vecadd.ku', 'saxpy.ku', 'tiny.ku', 'relu.ku', 'sum.ku']) {
      const { asm } = compileKernel(ku(f));
      const { words } = assemble(asm);
      assert.ok(words.length > 0 && words.length <= 200, f);
    }
  });
  it('saxpy.ku：真實函式呼叫（F_axpy＋jalr 回返）', () => {
    const { asm } = compileKernel(ku('saxpy.ku'));
    assert.ok(asm.includes('F_axpy:'));
    assert.ok(asm.includes('jal     ra, F_axpy'));
    assert.ok(asm.includes('jalr    x0, 0(ra)'));
    assert.ok(asm.includes('sw      ra,'));
  });
  it('tiny.ku（lanes=1）rvemu 單通道跑完 exit=0', () => {
    const { asm } = compileKernel(ku('tiny.ku'));
    const { emu, res } = runSingle(asm);
    assert.equal(res.exitCode, 0);
    assert.equal(emu.getReg(10), 0); // lane0 expect 錯誤數
  });
  it('print＋while＋除法：UART 與 expect 全對', () => {
    const src = [
      'lanes 1;',
      'n 4;',
      'mem A[4] @ 0x100 = i * 2;',
      'mem B[4] @ 0x120;',
      'kernel pw {',
      '  for (i: int = tid; i < n; i += ntid) {',
      '    v: int = A[i];',
      '    print(v);',
      '    B[i] = v / 2;',
      '  }',
      '  barrier();',
      '  w: int = 0;',
      '  while (w < 3) {',
      '    w = w + 1;',
      '    if (w == 2) {',
      '      continue;',
      '    }',
      '    B[w] = B[w] + 1;',
      '  }',
      '  barrier();',
      '}',
      'expect {',
      '  B[i] = A[i] / 2 + (i == 1) + (i == 3);',
      '}',
    ].join('\n');
    const { asm } = compileKernel(src);
    const { emu, res } = runSingle(asm);
    assert.equal(res.uart, '0246');
    assert.equal(res.exitCode, 0);
    assert.equal(emu.getReg(10), 0);
  });
  it('錯誤案例含行號', () => {
    const head = 'lanes 4;\nn 8;\nmem A[8] @ 0x100;\nmem B[8] @ 0x120;\nmem C[8] @ 0x140;\n';
    const k = (body) => head + 'kernel k {\n' + body + '}\n';
    assert.throws(() => compileKernel(k('  C[0] = 1.5;\n')), /浮點/);
    assert.throws(() => compileKernel(k('  C[0] = A[0] * B[0];\n')), /M 擴充/);
    assert.throws(() => compileKernel(k('  C[0] = A[0] / B[0];\n')), /除法/);
    assert.throws(() => compileKernel(k('  C[0] = D[0];\n')), /未宣告/);
    assert.throws(() => compileKernel(k('  C[0] = nofunc(A[0]);\n')), /未定義的函式/);
    assert.throws(() => compileKernel(head + 'func f(a: int) -> int {\n  return a;\n}\n'
      + 'kernel k {\n  C[0] = f(A[0], B[0]);\n}\n'), /參數數量/);
    assert.throws(() => compileKernel(head + 'func f(a: int) -> int {\n  t: int = a;\n}\n'
      + 'kernel k {\n  C[0] = 1;\n}\n'), /缺少 return/);
    assert.throws(() => compileKernel(k('  break;\n')), /迴圈/);
    assert.throws(() => compileKernel(head + 'expect {\n  barrier();\n}\n'
      + 'kernel k {\n  C[0] = 1;\n}\n'), /expect/);
    assert.throws(() => compileKernel(head + 'kernel k {\n  return 1;\n}\n'), /return/);
    assert.throws(() => compileKernel('lanes 4;\nn 8;\nmem A[8] @ 0x100;\nmem B[8] @ 0x102;\n'
      + 'kernel k {\n  C[0] = 1;\n}\n'), /對齊|重疊/);
    assert.throws(() => compileKernel(head + 'kernel k {\n  C[0] = A[0];\n}\n'
      + 'expect {\n  C[i] = nofunc(i);\n}\n'), /未定義的函式/);
  });
});
