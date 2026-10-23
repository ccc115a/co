// 單元測試：閘階層模擬器（用 yosys 映射範例電路後模擬）
import test from 'node:test';
import assert from 'node:assert/strict';
import { runYosys } from '@yowasp/yosys';
import { runSimulation, writeVCD } from '../public/js/sim.js';

const MAP = (top) => [
  'read_verilog -sv design.v',
  `hierarchy -check -top ${top}`,
  'proc', 'flatten', 'memory_map', 'async2sync', 'opt -fast', 'techmap', 'opt -fast', 'simplemap',
  'write_json sim.json',
].join('; ');

async function mapSource(src, top) {
  const out = await runYosys(['-q', '-p', MAP(top)], { 'design.v': src }, { stdout: null, stderr: null });
  return JSON.parse(out['sim.json']);
}

test('計數器：en=1 時每個上升緣加一', async () => {
  const j = await mapSource("module counter(input clk, input en, output reg [7:0] count); always @(posedge clk) if (en) count <= count + 1'b1; endmodule", 'counter');
  // 半週期 5 步 → 每 10 步一個上升緣；en 第 10 步起為 1
  const seq = Array.from({ length: 50 }, (_, i) => i >= 10 ? 1 : 0);
  const r = runSimulation(j, {
    top: 'counter', steps: 50, initFFs: 'zero',
    stimuli: { clk: { mode: 'clock', half: 5 }, en: { mode: 'seq', seq } },
  });
  assert.deepEqual(r.warnings, []);
  const count = r.signals.find(s => s.name === 'count');
  assert.ok(count, '應有 count 訊號');
  assert.equal(count.values[0], 0n);
  // 上升緣在 step 5,15,25,35,45；step 15 起有 en → step 15 後 count=1，之後每緣 +1
  assert.equal(count.values[14], 0n, 'step14 尚未計數');
  assert.equal(count.values[15], 1n, 'step15 第一個上升緣');
  assert.equal(count.values[25], 2n);
  assert.equal(count.values[35], 3n);
  assert.equal(count.values[45], 4n);
  assert.equal(count.values[49], 4n, 'en 關閉後不變');
});

test('計數器：initFFs 預設 x（無重置設計的 x 傳播）', async () => {
  const j = await mapSource("module counter(input clk, input en, output reg [7:0] count); always @(posedge clk) if (en) count <= count + 1'b1; endmodule", 'counter');
  const r = runSimulation(j, { top: 'counter', steps: 30, stimuli: { clk: { mode: 'clock', half: 5 }, en: { mode: 'const', value: '1' } } });
  const count = r.signals.find(s => s.name === 'count');
  assert.equal(count.values[0], 'x');
  assert.equal(count.values[29], 'x', '無重置時 x 應持續傳播');
});

test('ALU：純組合邏輯隨輸入即時變化', async () => {
  const src = `module alu4(input [3:0] a, input [3:0] b, input [2:0] op, output reg [3:0] y, output wire zero);
  always @(*) case (op)
    3'd0: y = a + b; 3'd1: y = a - b; 3'd2: y = a & b; 3'd3: y = a | b;
    3'd4: y = a ^ b; 3'd5: y = a << 1; 3'd6: y = a >> 1; 3'd7: y = ~a;
  endcase
  assign zero = (y == 4'd0);
endmodule`;
  const j = await mapSource(src, 'alu4');
  // a=5, b=3，op 依步驟 0..7 變化（序列最後一個重複）
  const r = runSimulation(j, {
    top: 'alu4', steps: 8, initFFs: 'zero',
    stimuli: {
      a: { mode: 'const', value: '5' },
      b: { mode: 'const', value: '3' },
      op: { mode: 'seq', seq: [0, 1, 2, 3, 4, 5, 6, 7] },
    },
  });
  const y = r.signals.find(s => s.name === 'y');
  const zero = r.signals.find(s => s.name === 'zero');
  // values[0]=t0（op=seq[0]=0），之後每步換一個 op，第 8 步起維持 op=7
  assert.deepEqual(y.values.map(String), ['8', '2', '1', '7', '6', '10', '2', '10', '10']);
  assert.equal(zero.values[3], 0);
});

test('帶同步重置的設計', async () => {
  const src = "module rst(input clk, input rstn, output reg [3:0] q); always @(posedge clk) if (!rstn) q <= 0; else q <= q + 1'b1; endmodule";
  const j = await mapSource(src, 'rst');
  const seq = Array.from({ length: 40 }, (_, i) => i < 12 ? 0 : 1); // 前 12 步重置
  const r = runSimulation(j, {
    top: 'rst', steps: 40, initFFs: 'x',
    stimuli: { clk: { mode: 'clock', half: 5 }, rstn: { mode: 'seq', seq } },
  });
  assert.deepEqual(r.warnings, []);
  const q = r.signals.find(s => s.name === 'q');
  assert.equal(q.values[11], 0n, '重置期間為 0');
  assert.equal(q.values[21], 1n, 'step 21（第二個釋放後上升緣）');
  assert.equal(q.values[31], 2n);
});

test('writeVCD 產生合法標頭與值變更', async () => {
  const j = await mapSource("module counter(input clk, input en, output reg [7:0] count); always @(posedge clk) if (en) count <= count + 1'b1; endmodule", 'counter');
  const r = runSimulation(j, {
    top: 'counter', steps: 20, initFFs: 'zero',
    stimuli: { clk: { mode: 'clock', half: 5 }, en: { mode: 'const', value: '1' } },
  });
  const vcd = writeVCD(r, { moduleName: 'counter' });
  assert.match(vcd, /\$timescale 1ns \$end/);
  assert.match(vcd, /\$scope module counter \$end/);
  assert.match(vcd, /\$var wire 8 \S+ count \$end/);
  assert.match(vcd, /#15/);
  assert.match(vcd, /b00000001 count|b00000001 \S+/);
});
