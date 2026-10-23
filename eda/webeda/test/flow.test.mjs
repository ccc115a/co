// 整合測試：YoWASP 完整流程（yosys 合成 → nextpnr 佈局繞線 → icepack 位元流）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runYosys } from '@yowasp/yosys';
import { runNextpnrIce40, runIcepack } from '@yowasp/nextpnr-ice40';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('seg7：合成 → 佈局繞線 → 位元流', async () => {
  const src = await readFile(join(root, 'public/samples/seg7.v'), 'utf8');
  const synth = await runYosys(['-q', '-p', 'read_verilog seg7.v; synth_ice40 -top seg7 -json seg7.json'], { 'seg7.v': src }, { stdout: null, stderr: null });
  assert.ok(synth['seg7.json'], '應產生合成網列');

  const chunks = [];
  const pnr = await runNextpnrIce40(
    ['--hx1k', '--package', 'tq144', '--json', 'seg7.json', '--asc', 'seg7.asc', '--freq', '12'],
    synth,
    { stdout: (b) => b && chunks.push(b), stderr: (b) => b && chunks.push(b) },
  );
  const log = Buffer.concat(chunks.map(b => Buffer.from(b))).toString();
  assert.ok(pnr['seg7.asc'], '應產生 ASC 佈局');
  assert.match(log, /Device utilisation:/);
  assert.match(log, /Max frequency for clock '[^']*': [\d.]+ MHz \(PASS/);

  const packed = await runIcepack(['seg7.asc', 'seg7.bin'], { ...synth, ...pnr });
  const bin = packed['seg7.bin'];
  assert.ok(bin, '應產生位元流');
  assert.ok(bin.length > 10000, `位元流大小合理（${bin.length} bytes）`);
});

test('下一個 Top 模組含子層：flatten 後可模擬', async () => {
  const src = `module add1(input [3:0] a, output [3:0] y); assign y = a + 4'd1; endmodule
module top(input [3:0] a, output [3:0] y); add1 u(.a(a), .y(y)); endmodule`;
  const out = await runYosys(['-q', '-p', 'read_verilog design.v; hierarchy -check -top top; proc; flatten; techmap; opt -fast; simplemap; write_json sim.json'], { 'design.v': src }, { stdout: null, stderr: null });
  const j = JSON.parse(out['sim.json']);
  const { runSimulation } = await import('../public/js/sim.js');
  const r = runSimulation(j, { top: 'top', steps: 3, stimuli: { a: { mode: 'const', value: '9' } } });
  const y = r.signals.find(s => s.name === 'y');
  assert.equal(y.values[0], 10n, 'a=9 → y=10');
});
