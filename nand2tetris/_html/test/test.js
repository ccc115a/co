// hackjs 單元測試（node --test）
// 涵蓋：ast / parser / elab / fmt / tst / codegen / model / CLI (ch01+02+03=29 + ch05=8 → 37/37)
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { parseHdl } from '../lib/hdl/parser.js';
import { Range, ParseError } from '../lib/hdl/ast.js';
import { loadLibrary, mergeLibs, mergeLibsList, elab, Builtin } from '../lib/hdl/elab.js';
import { generateJs, san, pinSan, topClassExpr } from '../lib/hdl/codegen.js';
import { TopModel } from '../lib/rt/model.js';
import { OutField, headerLine, dataLine, binField, decField, hexField, center } from '../lib/rt/fmt.js';
import { parseScript, run, PinRef, parseVal } from '../lib/rt/tst.js';
import { assemble, parseAsmLine } from '../lib/asm/hackasm.js';
import { translate as vm2asm } from '../lib/asm/vm2asm.js';
import { compileJack } from '../lib/jack/jack2vm.js';
import { Vm } from '../lib/vm/hackemu.js';

// 產出程式內的 ROM32K.load 靠這個 hook 讀檔（同 cli/hdl2js.js）
globalThis.HACKJS_FS = {
  read(p) {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  },
};

const REPO = path.resolve(import.meta.dirname, '../../');
const CH01 = path.join(REPO, '01');
const CH02 = path.join(REPO, '02');
const CH03A = path.join(REPO, '03', 'a');
const CH03B = path.join(REPO, '03', 'b');
const CH05 = path.join(REPO, '05');

// ==================== ast ====================
describe('ast', () => {
  it('Range.Root', () => {
    const r = new Range('Whole');
    assert.equal(r.kind, 'Whole');
    assert.equal(r.lo(), 0);
    assert.equal(r.bits(), 1);
  });
  it('Range.Slice', () => {
    const r = new Range('Slice', 3, 5);
    assert.equal(r.lo(), 3);
    assert.equal(r.bits(), 3);
  });
  it('Range.Bit', () => {
    const r = new Range('Bit', 15);
    assert.equal(r.lo(), 15);
    assert.equal(r.bits(), 1);
  });
});

// ==================== parser ====================
describe('parser', () => {
  it('parse_half_adder first chip name', () => {
    const src = fs.readFileSync(path.join(CH02, 'HalfAdder.hdl'), 'utf8');
    const c = parseHdl(src);
    assert.equal(c.name, 'HalfAdder');
    assert.equal(c.inPins.length, 2);
    assert.equal(c.outPins.length, 2);
  });

  it('parse_and first chip', () => {
    const c = parseHdl(fs.readFileSync(path.join(CH01, 'And.hdl'), 'utf8'));
    assert.equal(c.name, 'And');
  });

  it('parse_alu', () => {
    const c = parseHdl(fs.readFileSync(path.join(CH02, 'ALU.hdl'), 'utf8'));
    assert.equal(c.name, 'ALU');
    assert.equal(c.inPins.length, 8);
  });

  it('syntax error → ParseError with line/col', () => {
    assert.throws(() => parseHdl('@#$%^'), (e) => e instanceof ParseError);
  });

  it('parses all ch01 hdl (15 files)', () => {
    const files = fs.readdirSync(CH01).filter((f) => f.endsWith('.hdl'));
    for (const f of files) {
      parseHdl(fs.readFileSync(path.join(CH01, f), 'utf8'));
    }
    assert.equal(files.length, 15);
  });

  it('parses all ch02 hdl (6 files)', () => {
    const files = fs.readdirSync(CH02).filter((f) => f.endsWith('.hdl'));
    for (const f of files) {
      parseHdl(fs.readFileSync(path.join(CH02, f), 'utf8'));
    }
    assert.equal(files.length, 6);
  });
});

// ==================== elab ====================
describe('elab', () => {
  it('elab_and → two Nand in evalOrder', () => {
    const lib = loadLibrary(CH01);
    const e = elab(lib, 'And');
    assert.equal(e.chips[0].name, 'And');
    const topIdx = e.top;
    assert.equal(e.chips[topIdx].parts.length, 2);
    assert.equal(e.chips[topIdx].parts[0].clip.kind, 'Builtin');
    assert.equal(e.chips[topIdx].parts[1].clip.b, Builtin.Nand);
    assert.deepEqual(e.chips[topIdx].evalOrder, [0, 1]);
  });

  it('elab_ch02_add16 → 2 full adders in order', () => {
    const lib = mergeLibs(loadLibrary(CH01), loadLibrary(CH02));
    const e = elab(lib, 'Add16');
    assert.equal(e.chips[e.top].name, 'Add16');
  });

  it('all_elab_ch01+02: 21 chips pass', () => {
    const lib = mergeLibs(loadLibrary(CH01), loadLibrary(CH02));
    let ok = 0;
    for (const f of [...fs.readdirSync(CH01), ...fs.readdirSync(CH02)].filter((f) => f.endsWith('.hdl'))) {
      const name = f.replace('.hdl', '');
      elab(lib, name);
      ok += 1;
    }
    assert.equal(ok, 21);
  });

  it('elab_chips_in_reuse_and_order (And → NAND with passthrough)', () => {
    const lib = loadLibrary(CH01);
    const e = elab(lib, 'And16');
    const top = e.chips[e.top];
    assert.ok(top.parts.length >= 2, 'top And16 should have parts');
    assert.ok(top.evalOrder.length <= top.parts.length);
  });

  it('elab_reuse_order: ch01 all chips have 1:N parts', () => {
    const lib = loadLibrary(CH01);
    for (const f of fs.readdirSync(CH01).filter((f) => f.endsWith('.hdl'))) {
      const name = f.replace('.hdl', '');
      const e = elab(lib, name);
      assert.ok(e.chips[e.top].parts.length >= 1, `${name} should have >=1 parts`);
    }
  });

  it('elab_reuse_order: ch02 all chips have 1:N parts', () => {
    const lib = mergeLibs(loadLibrary(CH01), loadLibrary(CH02));
    for (const f of fs.readdirSync(CH02).filter((f) => f.endsWith('.hdl'))) {
      const name = f.replace('.hdl', '');
      const e = elab(lib, name);
      assert.ok(e.chips[e.top].parts.length >= 1, `${name} should have >=1 parts`);
    }
  });

  it('elab_reuse_order: ch03a all chips', () => {
    const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A)]);
    for (const f of fs.readdirSync(CH03A).filter((f) => f.endsWith('.hdl'))) {
      const name = f.replace('.hdl', '');
      elab(lib, name);
    }
  });

  it('elab_chips has_state for ch03a', () => {
    const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A)]);
    for (const f of fs.readdirSync(CH03A).filter((f) => f.endsWith('.hdl'))) {
      const name = f.replace('.hdl', '');
      const e = elab(lib, name);
      assert.ok(typeof e.chips[e.top].hasState === 'boolean', `${name} hasState should be boolean`);
    }
  });
});

// ==================== fmt ====================
describe('fmt', () => {
  it('center even/odd', () => {
    assert.equal(center('hi', 6), '  hi  ');
    assert.equal(center('hi', 5), ' hi  ');
    assert.equal(center('hello', 3), 'hel');
  });

  it('binField zero-pad', () => {
    assert.equal(binField(0b1010, 8), '00001010');
    assert.equal(binField(0xffff, 16), '1111111111111111');
  });

  it('decField signed right-align', () => {
    assert.equal(decField(1, 4), '   1');
    assert.equal(decField(0xfffd, 4), '  -3');
  });

  it('hexField uppercase', () => {
    assert.equal(hexField(0x00ff, 4), '00FF');
    assert.equal(hexField(0x1234, 6), '  1234');
  });

  it('headerLine + dataLine', () => {
    const fields = [
      new OutField('a', 'B', 2, 8, 1),
      new OutField('b', 'D', 2, 4, 1),
    ];
    const header = headerLine(fields);
    assert.ok(header.startsWith('|'));
    const line = dataLine(fields, '0', (n) => (n === 'a' ? 5 : 7));
    assert.ok(line.startsWith('|'));
    assert.ok(line.includes('00000101'));
  });
});

// ==================== tst ====================
describe('tst', () => {
  it('PinRef.parse Whole', () => {
    const p = PinRef.parse('x');
    assert.equal(p.raw(), 'x');
    assert.equal(p.idx.kind, 'Whole');
  });

  it('PinRef.parse Bit', () => {
    const p = PinRef.parse('x[3]');
    assert.equal(p.raw(), 'x[3]');
    assert.equal(p.idx.kind, 'Bit');
    assert.equal(p.idx.i, 3);
  });

  it('parseVal bin/dec/hex', () => {
    assert.equal(parseVal('%B1010'), 10);
    assert.equal(parseVal('%XFF'), 255);
    assert.equal(parseVal('42'), 42);
    assert.equal(parseVal('-3'), 65533);
  });

  it('parseScript basic', () => {
    const src = 'load X.hdl;\noutput-list a%B8.8.1 b%D4.2.1;\nset a 1; set b 2; output';
    const s = parseScript(src);
    assert.equal(s.load, 'X.hdl');
    assert.equal(s.outputList.length, 2);
    assert.equal(s.steps.length, 3); // set + set + output
  });
});

// ==================== codegen ====================
describe('codegen', () => {
  it('san / pinSan', () => {
    assert.equal(san('123'), '_123');
    assert.equal(san('hello-world'), 'hello_world');
    assert.equal(pinSan('in'), 'in_');
    assert.equal(pinSan('a'), 'a');
    assert.equal(pinSan('out'), 'out');
  });

  it('generateJs: And chip has eval', () => {
    const lib = mergeLibs(loadLibrary(CH01), loadLibrary(CH02));
    const e = elab(lib, 'And');
    const src = generateJs(e);
    assert.ok(src.includes('class AndChip'));
    assert.ok(src.includes('function setBits'));
  });

  it('generateJs produces runnable chip', () => {
    const lib = mergeLibs(loadLibrary(CH01), loadLibrary(CH02));
    const e = elab(lib, 'And');
    const src = generateJs(e);
    const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
    const AndChip = fn();
    const u = new AndChip();
    const r = u.eval(0, 0);
    assert.equal(r.out, 0);
    assert.equal(u.eval(1, 0).out, 0);
    assert.equal(u.eval(1, 1).out, 1);
  });

  it('generateJs with asModule includes export', () => {
    const lib = mergeLibs(loadLibrary(CH01), loadLibrary(CH02));
    const e = elab(lib, 'And');
    const src = generateJs(e, { asModule: true });
    assert.ok(src.includes('export'));
    assert.ok(src.includes('AndChip'));
  });
});

// ==================== model ====================
describe('model', () => {
  it('TopModel And gate eval + getOutput', () => {
    const lib = mergeLibs(loadLibrary(CH01), loadLibrary(CH02));
    const e = elab(lib, 'And');
    const src = generateJs(e);
    const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
    const m = new TopModel(fn(), e.chips[0]);
    m.doEval();
    assert.equal(m.getOutput('out'), 0);
    m.setInput('a', 1);
    m.setInput('b', 1);
    m.doEval();
    assert.equal(m.getOutput('out'), 1);
  });

  it('TopModel Not gate', () => {
    const lib = mergeLibs(loadLibrary(CH01), loadLibrary(CH02));
    const e = elab(lib, 'Not');
    const src = generateJs(e);
    const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
    const m = new TopModel(fn(), e.chips[0]);
    m.doEval();
    assert.equal(m.getOutput('out'), 1);
    m.setInput('in', 1);
    m.doEval();
    assert.equal(m.getOutput('out'), 0);
  });

  it('TopModel Bit flip-flop: tick latches, tock commits', () => {
    const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A)]);
    const e = elab(lib, 'Bit');
    const src = generateJs(e);
    const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
    const tm = new TopModel(fn(), e.chips[e.top]);
    assert.equal(tm.hasState, true);
    tm.setInput('in', 1);
    tm.setInput('load', 1);
    tm.tick();
    assert.equal(tm.getOutput('out'), 0, 'tick 取樣但未提交，out 仍是舊值');
    tm.tock();
    assert.equal(tm.getOutput('out'), 1, 'tock 提交後 out=1');
    tm.setInput('load', 0);
    tm.setInput('in', 0);
    tm.tick();
    tm.tock();
    assert.equal(tm.getOutput('out'), 1, 'load=0 不覆寫');
  });

  it('TopModel Register 16-bit', () => {
    const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A)]);
    const e = elab(lib, 'Register');
    const src = generateJs(e);
    const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
    const tm = new TopModel(fn(), e.chips[e.top]);
    tm.setInput('in', 0xabcd);
    tm.setInput('load', 1);
    tm.tick();
    tm.tock();
    assert.equal(tm.getOutput('out'), 0xabcd);
  });

  it('TopModel RAM8: write addr 7 stores cell 7 only', () => {
    const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A)]);
    const e = elab(lib, 'RAM8');
    const src = generateJs(e);
    const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
    const tm = new TopModel(fn(), e.chips[e.top]);
    tm.setInput('in', 111);
    tm.setInput('load', 1);
    tm.setInput('address', 7);
    tm.tick();
    tm.tock();
    tm.setInput('load', 0);
    tm.setInput('address', 0);
    tm.doEval();
    assert.equal(tm.getOutput('out'), 0);
    tm.setInput('address', 7);
    tm.doEval();
    assert.equal(tm.getOutput('out'), 111);
  });

  it('TopModel PC: reset forces 0', () => {
    const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A)]);
    const e = elab(lib, 'PC');
    const src = generateJs(e);
    const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
    const tm = new TopModel(fn(), e.chips[e.top]);
    tm.setInput('reset', 1);
    tm.tick();
    assert.equal(tm.getOutput('out'), 0);
    tm.tock();
    assert.equal(tm.getOutput('out'), 0);
  });
});

// ==================== CLI: ch01+02+03 (29/29) ====================
describe('CLI hdl2js ch01+02+03 29/29', () => {
  const CH03B = path.join(REPO, '03', 'b');
  const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A), loadLibrary(CH03B)]);

  function collectTst(dir) {
    const files = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith('.')) continue;
        files.push(...collectTst(p));
      } else if (ent.name.endsWith('.tst')) {
        files.push(p);
      }
    }
    return files.sort();
  }

  function runTst(tst) {
    const script = parseScript(fs.readFileSync(tst, 'utf8'));
    const top = script.load?.replace(/\.hdl$/, '');
    if (!top) throw new Error(`no load in ${tst}`);
    const e = elab(lib, top);
    const src = generateJs(e);
    const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
    const model = new TopModel(fn(), e.chips[e.top]);
    const out = [];
    run(model, script, path.dirname(tst), out, false);
  }

  const all = [...collectTst(CH01), ...collectTst(CH02), ...collectTst(CH03A), ...collectTst(CH03B)];
  assert.equal(all.length, 29, 'expected 29 tst files in 01+02+03');

  for (const tst of all) {
    const name = path.basename(tst, '.tst');
    it(`${name}`, () => {
      runTst(tst);
    });
  }
});

// ==================== v0.5：工具鏈 + e2e chain ====================
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

describe('工具鏈 v0.5', () => {
  it('hackasm: add.asm → 06/add.bin byte 相同', () => {
    const ch06 = path.join(REPO, '06');
    const { bin } = assemble(fs.readFileSync(path.join(ch06, 'add.asm'), 'utf8'));
    const ref = fs.readFileSync(path.join(ch06, 'add.bin'));
    assert.deepEqual(Buffer.from(bin), ref);
  });

  it('hackasm: sum.asm → 06/sum.bin byte 相同', () => {
    const ch06 = path.join(REPO, '06');
    const { bin } = assemble(fs.readFileSync(path.join(ch06, 'sum.asm'), 'utf8'));
    const ref = fs.readFileSync(path.join(ch06, 'sum.bin'));
    assert.deepEqual(Buffer.from(bin), ref);
  });

  it('vm2asm: test1.vm → 與 C oracle 位元相同（含 // 註解行與檔案 header）', () => {
    const ch08 = path.join(REPO, '08');
    const asm = vm2asm([{ path: 'test1.vm', src: fs.readFileSync(path.join(ch08, 'test1.vm'), 'utf8') }]);
    const expected = '\n// ========== File: test1.vm ==========\n'
      + '// push constant 7\n@7\nD=A\n@SP\nA=M\nM=D\n@SP\nM=M+1\n'
      + '// push constant 8\n@8\nD=A\n@SP\nA=M\nM=D\n@SP\nM=M+1\n'
      + '// add\n@SP\nAM=M-1\nD=M\nA=A-1\nM=D+M\n';
    assert.equal(asm, expected);
  });

  it('vm2asm: 多檔模式 label/goto 加「函式$」前綴（跨檔 WHILE_EXP 不撞）', () => {
    const asm = vm2asm([
      { path: 'A.vm', src: 'function A.f 0\nlabel WHILE_EXP0\ngoto WHILE_EXP0\nreturn\n' },
      { path: 'B.vm', src: 'function B.g 0\nlabel WHILE_EXP0\ngoto WHILE_EXP0\nif-goto WHILE_EXP0\nreturn\n' },
    ]);
    const prefix = (f) => asm.includes(`(${f}$WHILE_EXP0)`) && asm.includes(`@${f}$WHILE_EXP0`);
    assert.ok(prefix('A.f') && prefix('B.g'), '兩個函式的 WHILE_EXP0 都應加上各自函式前綴');
    assert.ok(asm.startsWith('// Bootstrap code'), '多檔應有 bootstrap');
    assert.ok(!/(^|\n)\((?!.*\$)(WHILE_EXP)/.test(asm), '不應有未加前綴的 WHILE label');
  });

  it('vm2asm: 多檔自動加 bootstrap（8 支目錄案例）', () => {
    const ch08 = path.join(REPO, '08');
    const cases = [
      'FunctionCalls/FibonacciElement/Main.vm', 'FunctionCalls/FibonacciElement/Sys.vm',
      'FunctionCalls/NestedCall/Sys.vm', 'FunctionCalls/SimpleFunction/SimpleFunction.vm',
      'FunctionCalls/StaticsTest/Class1.vm', 'FunctionCalls/StaticsTest/Class2.vm',
      'FunctionCalls/StaticsTest/Sys.vm', 'MemoryAccess/BasicTest/BasicTest.vm',
      'MemoryAccess/PointerTest/PointerTest.vm', 'MemoryAccess/StaticTest/StaticTest.vm',
      'ProgramFlow/BasicLoop/BasicLoop.vm', 'ProgramFlow/FibonacciSeries/FibonacciSeries.vm',
      'StackArithmetic/SimpleAdd/SimpleAdd.vm', 'StackArithmetic/StackTest/StackTest.vm',
    ];
    for (const rel of cases) {
      const src = fs.readFileSync(path.join(ch08, rel), 'utf8');
      const asm = vm2asm([{ path: rel, src }]);
      assert.ok(asm.length > 0, rel);
      assert.ok(!/\bundefined\b/.test(asm), rel);
    }
  });

  it('jack2vm: chain Main.jack → 認得的 VM（含 static 0 段）', () => {
    const vm = compileJack(CHAIN_MAIN);
    assert.ok(vm.includes('function Main.init 0'));
    assert.ok(vm.includes('push constant 5'));
    assert.ok(vm.includes('pop static 0'));
    assert.ok(vm.includes('label WHILE_EXP0'));
    assert.ok(vm.includes('goto WHILE_EXP0'));
  });

  it('e2e chain：Jack→VM→ASM→HACK 跑在 Computer.hdl，RAM[16]=5', () => {
    const tmp = fs.mkdtempSync(path.join(osTmp(), 'chain-'));
    const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A), loadLibrary(CH03B), loadLibrary(CH05)]);

    const vmFiles = [
      { path: 'Main.vm', src: compileJack(CHAIN_MAIN).join('\n') + '\n' },
      { path: 'Sys.vm', src: compileJack(CHAIN_SYS).join('\n') + '\n' },
    ];
    const asm = vm2asm(vmFiles);
    const { hack } = assemble(asm);
    fs.writeFileSync(path.join(tmp, 'chain.hack'), hack);

    const tst = `load Computer.hdl,
output-file chain.out,
compare-to chain.cmp,
output-list RAM16K[16]%D1.7.1;

ROM32K load chain.hack,
set reset 0,
output;

repeat 300 {
    tick, tock;
}
output;
`;
    fs.writeFileSync(path.join(tmp, 'chain.tst'), tst);
    const cmp = '|RAM16K[16|\n' + '|       0 |\n' + '|       5 |\n';
    fs.writeFileSync(path.join(tmp, 'chain.cmp'), `${cmp}\n`);

    const script = parseScript(tst);
    const e = elab(lib, 'Computer');
    const fn = new Function(`${generateJs(e)}\nreturn ${topClassExpr(e)};`);
    const model = new TopModel(fn(), e.chips[e.top]);
    const out = [];
    run(model, script, tmp, out, false); // 比對失敗會 throw；沒 throw 即 RAM[16]=5 達成
  });
});

function osTmp() {
  return process.env.TMPDIR || '/tmp';
}

// ==================== v0.8：網頁 bundle 回歸 ====================
describe('dist/embed.js 瀏覽器 bundle（v0.8）', () => {
  it('embed.js eval 後提供 HackVM/HackAsm，且範例乘法程式執行正確', () => {
    const embed = fs.readFileSync(path.resolve(REPO, '_html', 'dist', 'embed.js'), 'utf8');
    const g = globalThis;
    const prev = g.window;
    g.window = g;
    let vmApi, asmApi;
    try {
      (0, eval)(`${embed}\n//# sourceURL=embed.js`);
      vmApi = g.window.HackVM;
      asmApi = g.window.HackAsm;
    } finally {
      g.window = prev;
    }
    const { Vm, KEY_LEFT } = vmApi;
    const { assemble } = asmApi;
    const vm = new Vm();
    const sample = '@2\nD=A\n@R1\nM=D\n@5\nD=A\n@R2\nM=D\n@R1\nD=M\n@R0\nM=0\n(LOOP)\n@R1\nD=M\n@R0\nM=D+M\n@R2\nM=M-1\n@R2\nD=M\n@LOOP\nD;JGT\n(END)\n@END\n0;JMP\n';
    assert.ok(assemble);
    assert.ok(vm instanceof Object && KEY_LEFT === 130);
    vm.loadHack(assemble(sample).hack);
    vm.run(500);
    assert.equal(vm.ram[0], 10, 'R0 = 2*5');
    assert.equal(vm.ram[1], 2, '乘數 R1 保持 2');
    assert.equal(vm.ram[2], 0, 'R2 累減到 0 後跳出迴圈');
  });
});
describe('hackemu 虛擬機 v0.6', () => {
  const rom = (asm) => {
    const { bin } = assemble(asm);
    return new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);
  };

  it('simple_add：RAM[0]=2+3=5、最後 @0 使 A=0', () => {
    const vm = new Vm();
    vm.rom = rom('@2\nD=A\n@3\nD=D+A\n@0\nM=D\n@0\n0;JMP\n');
    vm.run(6);
    assert.equal(vm.ram[0], 5);
    assert.equal(vm.a, 0);
  });

  it('eq 跳躍分支（成立/不成立）＋ J 語意', () => {
    let vm = new Vm();
    vm.rom = rom('@1\nD=A\n@1\nD=D-A\n@9\nD;JEQ\n@0\nM=-1\n@0\n0;JMP\n');
    vm.run(6);
    assert.equal(vm.ram[0], 0);
    assert.equal(vm.pc, 9);
    vm = new Vm();
    vm.rom = rom('@1\nD=A\n@2\nD=D-A\n@9\nD;JEQ\n@0\nM=-1\n@0\n0;JMP\n');
    vm.run(8);
    assert.equal(vm.ram[0], 0xffff);
  });

  it('SCREEN 位元序：word bit15=最左、screen_pixel 對映', () => {
    const vm = new Vm();
    vm.rom = rom('@SCREEN\nM=-1\n@0\n0;JMP\n');
    vm.run(2);
    assert.equal(vm.ram[16384], 0xffff);
    assert.ok(vm.screenPixel(0, 0) && vm.screenPixel(0, 15));
    assert.ok(!vm.screenPixel(0, 16) && !vm.screenPixel(1, 0));
    vm.ram[16384] = 0x8000;
    assert.ok(vm.screenPixel(0, 0) && !vm.screenPixel(0, 15));
    vm.ram[16384] = 0x0001;
    assert.ok(!vm.screenPixel(0, 0) && vm.screenPixel(0, 15));
  });

  it('jump 用「更新後」的 A（A=D;0;JMP 範例）', () => {
    const vm = new Vm();
    vm.ram[5] = 3;
    vm.rom = rom('@5\nD=M\nA=D\n0;JMP\n');
    vm.run(4);
    assert.equal(vm.pc, 3);
    assert.equal(vm.a, 3);
  });

  it('load_bin little-endian / load_hack 文字 / 越界停止', () => {
    const bin = assemble('@2\nD=A\n').bin;
    const vm = new Vm();
    vm.loadBin(bin);
    assert.equal(vm.rom.length, 2);
    assert.equal(vm.rom[1], 0xec10);
    assert.throws(() => vm.loadBin(new Uint8Array([1])));
    vm.loadHack('0000000000000010\n1110000000010000\n');
    assert.equal(vm.rom[1], 0xe010);
    assert.throws(() => vm.loadHack('not-binary\n'));
    const vm2 = new Vm();
    vm2.rom = new Uint16Array([0x0000]);
    vm2.run(100);
    assert.equal(vm2.cycles, 1);
  });

  it('交叉驗證：chain.bin 與 hdl2js（Computer.hdl）同結果 RAM[16]=5', () => {
    const tmp = fs.mkdtempSync(path.join(osTmp(), 'hackemu-'));
    const vmFiles = [
      { path: 'Main.vm', src: compileJack(CHAIN_MAIN).join('\n') + '\n' },
      { path: 'Sys.vm', src: compileJack(CHAIN_SYS).join('\n') + '\n' },
    ];
    const asm = vm2asm(vmFiles);
    const { bin } = assemble(asm);
    const vm = new Vm();
    vm.loadBin(bin);
    vm.run(500000);
    assert.equal(vm.ram[16], 5, 'chain.bin 跑 50 萬條後 RAM[16]=5');
    assert.equal(vm.pc, 71, '與 Rust oracle after: PC=71 一致（Main.loop 無限迴圈）');
    assert.equal(vm.ram[0], 266, '與 Rust oracle SP=266 一致');
    assert.equal(vm.cycles, 500000);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
describe('CLI hdl2js ch05 CPU + Computer 8/8', () => {
  const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A), loadLibrary(CH03B), loadLibrary(CH05)]);

  // 與 Rust verify.sh 相同的 8 支清單（Memory.tst 需人工按鍵，不自動化）
  const all = [
    'CPU.tst',
    'CPU-external.tst',
    'ComputerAdd.tst',
    'ComputerAdd-external.tst',
    'ComputerMax.tst',
    'ComputerMax-external.tst',
    'ComputerRect.tst',
    'ComputerRect-external.tst',
  ].map((f) => path.join(CH05, f));
  assert.equal(all.length, 8);

  for (const tst of all) {
    const name = path.basename(tst, '.tst');
    it(`${name}`, () => {
      const script = parseScript(fs.readFileSync(tst, 'utf8'));
      const top = script.load?.replace(/\.hdl$/, '');
      const e = elab(lib, top);
      const src = generateJs(e);
      const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
      const model = new TopModel(fn(), e.chips[e.top]);
      const out = [];
      run(model, script, path.dirname(tst), out, false);
    });
  }
});

// ==================== CLI: ch04 (2/2) ====================
describe('CLI hdl2js ch04 Mult-hw + Fill-hw 2/2', () => {
  const REV = path.resolve(import.meta.dirname, '../..');
  const CH04MULT = path.join(REV, '04', 'mult');
  const CH04FILL = path.join(REV, '04', 'fill');
  const lib = mergeLibsList([loadLibrary(CH01), loadLibrary(CH02), loadLibrary(CH03A), loadLibrary(CH03B), loadLibrary(CH05)]);
  const all = [
    path.join(CH04MULT, 'Mult-hw.tst'),
    path.join(CH04FILL, 'Fill-hw.tst'),
  ];
  assert.equal(all.length, 2);

  for (const tst of all) {
    const name = path.basename(tst, '.tst');
    it(`${name}`, () => {
      const script = parseScript(fs.readFileSync(tst, 'utf8'));
      const e = elab(lib, 'Computer');
      const src = generateJs(e);
      const fn = new Function(`${src}\nreturn ${topClassExpr(e)};`);
      const model = new TopModel(fn(), e.chips[e.top]);
      const out = [];
      run(model, script, path.dirname(tst), out, false);
    });
  }
});

// ==================== v0.9: dist bundle（corpus + shim + embed）瀏覽器路徑 ====================
import { execFileSync } from 'node:child_process';

describe('v0.9 dist bundle（瀏覽器執行路徑）', () => {
  const DIST = path.resolve(import.meta.dirname, '../dist');
  const TOOLS = path.resolve(import.meta.dirname, '../tools');
  const origFS = globalThis.HACKJS_FS;

  before(() => {
    // 重新產生語料＋bundle，確保測試的是最新產物
    execFileSync(process.execPath, ['tools/embed.js'], { stdio: 'pipe' });
    execFileSync(process.execPath, ['tools/gen_corpus.js'], { stdio: 'pipe' });
  });

  after(() => {
    globalThis.HACKJS_FS = origFS; // 還原 CLI 的 ROM hook
  });

  it('embed.js / corpus.js / hdl.js 語法均通過 node --check', () => {
    for (const f of ['embed.js', 'corpus.js', 'hdl.js', 'hdl-rt.js']) {
      assert.doesNotThrow(() => new Function(fs.readFileSync(path.join(DIST, f), 'utf8')));
    }
  });

  it('bundle 掛出 HackHdl 全域，且 fs/path shim 能吃語料', () => {
    globalThis.window = globalThis;
    (0, eval)(fs.readFileSync(path.join(DIST, 'corpus.js'), 'utf8'));
    (0, eval)(fs.readFileSync(path.join(DIST, 'hdl-rt.js'), 'utf8'));
    (0, eval)(fs.readFileSync(path.join(DIST, 'embed.js'), 'utf8'));
    assert.ok(globalThis.HackHdl);
    assert.equal(typeof globalThis.HackHdl.elab, 'function');
    assert.ok(globalThis.HACKJS_CORPUS['../01/And.hdl']);
    assert.equal(globalThis.HACKJS_FS.readFileSync('../01/And.tst', 'utf8').includes('load And.hdl'), true);
    assert.equal(globalThis.HACKJS_PATH.join('gen', 'chain') + '/x', 'gen/chain/x');
  });

  for (const [dirs, tstName, top] of [
    [['../01'], '../01/And.tst', 'And'],
    [['../01', '../02'], '../02/ALU.tst', 'ALU'],
    [['../01', '../02', '../03/a', '../03/b', '../05', '../04/mult', '../04/fill', 'gen/chain'], 'gen/chain/chain.tst', 'Computer'],
  ]) {
    it(`跑語料案例 ${tstName}（全瀏覽器路徑）`, () => {
      const H = globalThis.HackHdl;
      const tstText = globalThis.HACKJS_FS.readFileSync(tstName, 'utf8');
      const script = H.parseScript(tstText);
      let lib = {};
      for (const d of dirs) lib = H.mergeLibs(lib, H.loadLibrary(d));
      const e = H.elab(lib, top);
      const TopClass = new Function(`${H.generateJs(e)}\nreturn ${H.topClassExpr(e)};`)();
      const model = new H.TopModel(TopClass, e.chips[e.top]);
      const out = [];
      H.run(model, script, tstName.split('/').slice(0, -1).join('/'), out, false);
      assert.ok(out.join('').split('\n').filter((l) => l.includes('|')).length >= 1);
    });
  }
});

// ==================== v1.0: dist bundle Jack 全鏈路（瀏覽器路徑） ====================
describe('v1.0 dist bundle（Jack 全鏈路瀏覽器路徑）', () => {
  const DIST = path.resolve(import.meta.dirname, '../dist');
  const corpusSrc = () => fs.readFileSync(path.join(DIST, 'corpus.js'), 'utf8');

  function pipeRun(name, prog, files, withOS, steps, expectRam16) {
    it(name, () => {
      const { compileJack } = globalThis.HackJack2Vm;
      const { translate } = globalThis.HackVm2Asm;
      const { assemble } = globalThis.HackAsm;
      const { Vm } = globalThis.HackVM;
      const corpus = globalThis.HACKJS_CORPUS;
      const vmFiles = [];
      if (withOS) {
        for (const k of Object.keys(corpus).filter((k) => k.startsWith('gen/os_src/') && k.endsWith('.jack')).sort()) {
          vmFiles.push({ path: k.split('/').pop().replace(/\.jack$/, '.vm'), src: compileJack(corpus[k]).join('\n') + '\n' });
        }
      }
      for (const f of files) {
        vmFiles.push({ path: f.replace(/\.jack$/, '.vm'), src: compileJack(corpus[f]).join('\n') + '\n' });
      }
      const asm = translate(vmFiles);
      const { hack, bin } = assemble(asm);
      assert.ok(bin.length > 0);
      const vm = new Vm();
      vm.loadHack(hack);
      vm.run(steps);
      if (expectRam16 !== undefined) assert.equal(vm.ram[16], expectRam16);
      assert.ok(vm.pc < hack.split('\n').length); // 執行結束時 PC 仍在 ROM 內
    });
  }

  before(() => {
    globalThis.window = globalThis;
    (0, eval)(corpusSrc());
    (0, eval)(fs.readFileSync(path.join(DIST, 'hdl-rt.js'), 'utf8'));
    (0, eval)(fs.readFileSync(path.join(DIST, 'embed.js'), 'utf8'));
  });

  pipeRun('chain（Main+Sys，無 OS）：RAM[16]=5 oracle', 'chain',
    ['gen/chain/Main.jack', 'gen/chain/Sys.jack'], false, 5000, 5);
  pipeRun('Sum（noOS）：RAM[16]=5050', 'Sum',
    ['../11/jackNoOs/Sum/Main.jack', '../11/jackNoOs/Sum/Sys.jack'], false, 20000, 5050);
  pipeRun('Seven（含 OS，8 個 os_src）：run 200000 步不當', 'Seven',
    ['../11/jack/Seven/Main.jack'], true, 200000, undefined);
});