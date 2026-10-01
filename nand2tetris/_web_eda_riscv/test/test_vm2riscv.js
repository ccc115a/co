// vm2riscv 測試（node --test）：單元（文字形狀）＋ e2e（Jack noOS 經 rvasm＋rvemu 執行驗證）
// 執行鏈：lib/jack/jack2vm.js（Jack→VM）→ lib/riscv/vm2riscv.js（VM→RISC-V）→
//   ../../riscv/_web_tools 的 rvasm（組譯）＋ rvemu（執行），讀 STATIC_BASE 驗結果。
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { compileJack } from '../lib/jack/jack2vm.js';
import { Vm2Rv } from '../lib/riscv/vm2riscv.js';
import { assemble } from '../../../riscv/_web_tools/lib/rvasm.js';
import { Emulator } from '../../../riscv/_web_tools/lib/rvemu.js';

const { translate, STACK_BASE, TEMP_BASE, STATIC_BASE, STATIC_STRIDE } = Vm2Rv;

const REPO = path.resolve(import.meta.dirname, '../../');
const NOOS = path.join(REPO, '11', 'jackNoOs');

// ==================== 單元：文字形狀 ====================
describe('vm2riscv 單元', () => {
  const t1 = (src) => translate([{ path: 'Main.vm', src }]);

  it('push constant＋add 形狀（s1＝SP，t0 傳值）', () => {
    const s = t1('push constant 7\npush constant 8\nadd\n');
    assert.ok(s.includes('li t0, 7'));
    assert.ok(s.includes('sw t0, 0(s1)'));
    assert.ok(s.includes('add t0, t0, t1'));
    assert.ok(s.startsWith('.text'));
  });

  it('eq/gt/lt 產生 true＝-1（sltiu/slt＋sub x0）', () => {
    assert.ok(t1('eq\n').includes('sltiu t0, t0, 1'));
    const gt = t1('gt\n');
    assert.ok(gt.includes('slt t0, t1, t0') && gt.includes('sub t0, x0, t0'));
    const lt = t1('lt\n');
    assert.ok(lt.includes('slt t0, t0, t1') && lt.includes('sub t0, x0, t0'));
  });

  it('neg/not 原地修改棧頂（不動 SP）', () => {
    const neg = t1('neg\n');
    assert.ok(neg.includes('lw t0, -4(s1)') && neg.includes('sub t0, x0, t0'));
    const not = t1('not\n');
    assert.ok(not.includes('xori t0, t0, -1'));
  });

  it('segments 對應暫存器與固定位址', () => {
    const s = t1('push local 2\npush argument 3\npush this 4\npush that 5\npush temp 6\npush pointer 0\npush pointer 1\npush static 2\n');
    assert.ok(s.includes('add t1, s2, t1')); // local＝s2
    assert.ok(s.includes('add t1, s3, t1')); // argument＝s3
    assert.ok(s.includes('add t1, s4, t1')); // this＝s4
    assert.ok(s.includes('add t1, s5, t1')); // that＝s5
    assert.ok(s.includes(`li t1, ${TEMP_BASE + 6 * 4}`)); // temp 固定位址
    assert.ok(s.includes('addi t0, s4, 0') && s.includes('addi t0, s5, 0')); // pointer
    assert.ok(s.includes(`li t1, ${STATIC_BASE + 0 * STATIC_STRIDE + 2 * 4}`)); // static 第 0 檔
  });

  it('第二檔 static 位址按 STRIDE 偏移', () => {
    const s = translate([
      { path: 'A.vm', src: 'push static 0\n' },
      { path: 'B.vm', src: 'function Sys.init 0\npush static 1\n' },
    ]);
    assert.ok(s.includes(`li t1, ${STATIC_BASE + 0}`));
    assert.ok(s.includes(`li t1, ${STATIC_BASE + STATIC_STRIDE + 4}`));
  });

  it('function 序幕回填 ra、call 經 jal、return 經 jalr', () => {
    const s = translate([{
      path: 'Main.vm',
      src: 'function Main.f 1\npush constant 0\npop local 0\npush local 0\nreturn\nfunction Sys.init 0\ncall Main.f 0\nreturn\n',
    }]);
    assert.ok(s.includes('Main.f:'));
    assert.ok(s.includes('sw ra, -20(s2)')); // 序幕回填返回位址
    assert.ok(s.includes('jal ra, Main.f'));
    assert.ok(s.includes('Main.f$ret.0:'));
    assert.ok(s.includes('lw t1, -20(t2)') && s.includes('jalr x0, 0(t1)'));
  });

  it('Math.multiply／Math.divide 內聯為 mul／div', () => {
    const mul = translate([{ path: 'M.vm', src: 'function F 0\npush constant 2\npush constant 3\ncall Math.multiply 2\nreturn\nfunction Sys.init 0\ncall F 0\nreturn\n' }]);
    assert.ok(mul.includes('mul t0, t0, t1'));
    assert.ok(!mul.includes('jal ra, Math.multiply'));
    const div = translate([{ path: 'M.vm', src: 'function F 0\ncall Math.divide 2\nreturn\nfunction Sys.init 0\ncall F 0\nreturn\n' }]);
    assert.ok(div.includes('div t0, t0, t1'));
  });

  it('不支援的 OS 呼叫／未定義函式／非法 segment 直接 throw', () => {
    assert.throws(() => t1('call Memory.alloc 1\n'), /不支援的 OS 呼叫/);
    assert.throws(() => t1('call String.new 1\n'), /不支援的 OS 呼叫/);
    assert.throws(() => t1('function Sys.init 0\ncall Nope.f 0\nreturn\n'), /未定義函式：Nope\.f/);
    assert.throws(() => t1('push weird 0\n'), /不支援的 segment/);
    assert.throws(() => t1('pop temp 8\n'), /temp 索引/);
  });

  it('lenient 顯示模式：OS 呼叫照發 jal 並列在表頭，未定義亦放行', () => {
    const s = translate(
      [{ path: 'M.vm', src: 'function Main.main 0\ncall String.new 1\ncall Nope.f 0\nreturn\n' }],
      { lenient: true }
    );
    assert.ok(s.includes('jal ra, String.new'));
    assert.ok(s.includes('jal ra, Nope.f'));
    assert.ok(s.includes('#   外部：String.new'));
    assert.ok(s.includes('僅供檢視'));
    // 無外部呼叫時不加表頭
    const clean = translate(
      [{ path: 'M.vm', src: 'function Main.main 0\npush constant 1\nreturn\n' }],
      { lenient: true }
    );
    assert.ok(!clean.includes('外部：'));
  });

  it('多檔才寫 bootstrap（Sys.init＋ecall 停機），單檔不寫', () => {
    const multi = translate([
      { path: 'Main.vm', src: 'function Main.init 0\nreturn\n' },
      { path: 'Sys.vm', src: 'function Sys.init 0\ncall Main.init 0\nreturn\n' },
    ]);
    assert.ok(multi.includes(`li s1, ${STACK_BASE}`));
    assert.ok(multi.includes('jal ra, Sys.init'));
    assert.ok(multi.includes('ecall'));
    const single = t1('push constant 1\n');
    assert.ok(!single.includes('Sys.init'));
    assert.ok(!single.includes('ecall'));
  });

  it('輸出無 `//` 註解、無符號版 li（rvasm 佔位坑）', () => {
    const s = translate([
      { path: 'Main.vm', src: 'function Main.init 0\npush constant 5\npop static 0\nreturn\n' },
      { path: 'Sys.vm', src: 'function Sys.init 0\ncall Main.init 0\nreturn\n' },
    ]);
    assert.ok(!s.split('\n').some((l) => l.includes('//')));
    assert.ok(!/^li\s+\w+,\s*[A-Za-z]/m.test(s), '不可出現 li rd, <標籤>');
    // 保證可組譯（rvasm 失敗即 throw）
    const { words } = assemble(s, { origin: 0 });
    assert.ok(words.length > 0 && words.length * 4 < TEMP_BASE);
  });
});

// ==================== e2e：Jack noOS＋chain 在 rvemu 跑出正確 static ====================
const CHAIN_MAIN = `class Main {
    static int x;

    function void init() {
        let x = 5;
    }

    function void loop() {
        while (true) {
        }
    }
}`;
const CHAIN_SYS = `class Sys {
    function void init() {
        do Main.init();
        do Main.loop();
        return;
    }
}`;

function runJackOnRvemu(mainSrc, sysSrc, expect, budget) {
  const files = [
    { path: 'Main.vm', src: compileJack(mainSrc).join('\n') + '\n' },
    { path: 'Sys.vm', src: compileJack(sysSrc).join('\n') + '\n' },
  ];
  const s = translate(files);
  const { words } = assemble(s, { origin: 0 });
  assert.ok(words.length * 4 < TEMP_BASE, `程式 ${words.length * 4} bytes 超出資料區下限 ${TEMP_BASE}`);
  const emu = new Emulator();
  emu.loadWords(words, 0);
  const addr = STATIC_BASE; // Main.vm 為第 0 檔、result/x 皆為 static 0
  let hit = -1;
  for (let steps = 1; steps <= budget; steps++) {
    emu.step();
    if (steps % 1000 === 0 && emu.loadWord(addr) === expect) { hit = steps; break; }
  }
  assert.ok(hit > 0, `預算 ${budget} 步內 STATIC[0] 未變成 ${expect}`);
  // 再跑一段確認已進入無窮迴圈且值穩定（排除中間值巧合）
  for (let k = 0; k < 20000; k++) emu.step();
  assert.equal(emu.loadWord(addr), expect);
  return { hit, words: words.length };
}

describe('vm2riscv e2e（Jack→VM→RV32 在 rvemu 執行）', () => {
  const jackOf = (dir, f) => fs.readFileSync(path.join(NOOS, dir, f), 'utf8');

  it('chain：Main.x＝5', () => {
    runJackOnRvemu(CHAIN_MAIN, CHAIN_SYS, 5, 20000);
  });
  it('Sum：1..100＝5050', () => {
    runJackOnRvemu(jackOf('Sum', 'Main.jack'), jackOf('Sum', 'Sys.jack'), 5050, 100000);
  });
  it('Factorial：5!＝120', () => {
    runJackOnRvemu(jackOf('Factorial', 'Main.jack'), jackOf('Factorial', 'Sys.jack'), 120, 50000);
  });
  it('Fib：fib(20)＝6765', () => {
    runJackOnRvemu(jackOf('Fib', 'Main.jack'), jackOf('Fib', 'Sys.jack'), 6765, 50000);
  });
  it('GCD(1386,3213)＝63', () => {
    runJackOnRvemu(jackOf('GCD', 'Main.jack'), jackOf('GCD', 'Sys.jack'), 63, 50000);
  });
  it('PrimeUnder100：100 以下最大質數＝97', () => {
    runJackOnRvemu(jackOf('PrimeUnder100', 'Main.jack'), jackOf('PrimeUnder100', 'Sys.jack'), 97, 500000);
  });
});

// ==================== dist bundle：HackVm2Rv 與 lib 一致、vm2asm 未被覆蓋 ====================
describe('vm2riscv dist bundle（jack.html .s 分頁）', () => {
  const DIST = path.resolve(import.meta.dirname, '../dist');

  function loadBundle() {
    const g = globalThis;
    const prev = g.window;
    g.window = g;
    try {
      (0, eval)(fs.readFileSync(path.join(DIST, 'embed.js'), 'utf8'));
      return { HackVm2Rv: g.window.HackVm2Rv, HackVm2Asm: g.window.HackVm2Asm };
    } finally {
      g.window = prev;
    }
  }

  it('bundle 內 HackVm2Rv.translate 與 lib 輸出一致', () => {
    const { HackVm2Rv } = loadBundle();
    assert.ok(HackVm2Rv && typeof HackVm2Rv.translate === 'function');
    const files = [
      { path: 'Main.vm', src: 'function Main.init 0\npush constant 5\npop static 0\nreturn\n' },
      { path: 'Sys.vm', src: 'function Sys.init 0\ncall Main.init 0\nreturn\n' },
    ];
    assert.equal(HackVm2Rv.translate(files), translate(files));
  });

  it('bundle 內 HackVm2Asm.translate 未被覆蓋（拼接作用域回歸）', () => {
    const { HackVm2Asm } = loadBundle();
    assert.ok(HackVm2Asm.translate([{ path: 'M.vm', src: 'push constant 7\n' }]).includes('@7'));
  });

  it('bundle 內 OS 呼叫照樣 throw（jack.html .s 分頁靠此顯示訊息）', () => {
    const { HackVm2Rv } = loadBundle();
    assert.throws(
      () => HackVm2Rv.translate([{ path: 'M.vm', src: 'function Sys.init 0\ncall Memory.alloc 1\nreturn\n' }]),
      /不支援的 OS 呼叫/
    );
  });

  it('Seven＋OS：嚴格模式 throw，lenient 顯示模式產出 .s（含外部表頭）', () => {
    const osDir = path.resolve(import.meta.dirname, '../gen/os_src');
    const vmFiles = [];
    for (const f of fs.readdirSync(osDir).filter((f) => f.endsWith('.jack')).sort()) {
      vmFiles.push({
        path: f.replace(/\.jack$/, '.vm'),
        src: compileJack(fs.readFileSync(path.join(osDir, f), 'utf8')).join('\n') + '\n',
      });
    }
    const seven = fs.readFileSync(path.join(REPO, '11', 'jack', 'Seven', 'Main.jack'), 'utf8');
    vmFiles.push({ path: 'Main.vm', src: compileJack(seven).join('\n') + '\n' });
    assert.throws(() => translate(vmFiles), /不支援的 OS 呼叫/);
    const s = translate(vmFiles, { lenient: true });
    assert.ok(s.length > 10000, 'OS 全量應有萬行以上');
    assert.ok(s.includes('#   外部：'), '應列出外部未定義呼叫');
    assert.ok(s.includes('Sys.main:') || s.includes('Main.main:'));
  });
});
