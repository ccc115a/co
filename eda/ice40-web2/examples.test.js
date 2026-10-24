// Runs every bundled example through the real flow with its own settings: node examples.test.js
import fs from 'node:fs';
const BASE = `http://localhost:${process.env.PORT || 8080}`, DIR = new URL('./public/examples/', import.meta.url);
const CORE = new Set(['design.v', 'tb.v', 'design.pcf']);
async function flow(body) {
  const r = await fetch(BASE + '/api/flow', { method: 'POST', body: JSON.stringify(body) }); const evs = []; let buf = '';
  for await (const c of r.body) { buf += Buffer.from(c).toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { evs.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } }
  return { res: evs.find(e => e.type === 'result'), log: evs.filter(e => e.type === 'log').map(e => e.text).join('\n') };
}
let fail = 0; const ck = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, x); if (!c) fail++; };
const EXPECT = {
  'blinky': ({ res, log }) => res.ok && /c=\d+/.test(log) && !!res.result.layout,
  'lfsr': ({ res, log }) => res.ok && /q=[0-9a-f]{2}/.test(log),
  'mcu0-fpga': ({ res, log }) => res.ok && /SUM = 55, LED = 55 \(expect 55\) -> PASS/.test(log) && !!res.result.bin && res.result.formal?.status === 'PASS' && !!res.result.fast && res.result.report.utilization.ICESTORM_RAM.used === 1 && res.result.report.utilization.ICESTORM_LC.used < 300 && Object.values(res.result.report.fmax)[0].achieved >= 12,
  'bcd-formal': ({ res }) => res.ok && res.result.formal?.status === 'FAIL' && res.result.formal.failures[0]?.step === 10 && !!res.result.formal.vcd,
  'mcu0m-sim': ({ res, log }) => res.ok && /1750ns PC=000c IR=1016, SW=8000, A=\s+55/.test(log) && /1990ns PC=0012 IR=2012, SW=4000, A=\s+10/.test(log) && !res.result.layout && !!res.result.vcd,
  'traffic': ({ res, log }) => res.ok && /R=1 Y=0 G=0/.test(log) && /R=0 Y=0 G=1/.test(log) && /R=0 Y=1 G=0/.test(log) && !!res.result.bin,
  'uart': ({ res, log }) => res.ok && /received 0x41 'A' -> PASS/.test(log) && !!res.result.bin,
  'syntax-error': ({ res }) => !res.ok && res.failed === 'synth',
};
for (const ex of JSON.parse(fs.readFileSync(new URL('index.json', DIR)))) {
  const read = f => fs.readFileSync(new URL(`${ex.id}/${f}`, DIR), 'utf8');
  const files = {}; for (const f of ex.files) if (!CORE.has(f)) files[f] = read(f);
  const t0 = Date.now();
  const out = await flow({ design: read('design.v'), tb: ex.files.includes('tb.v') ? read('tb.v') : '', pcf: ex.files.includes('design.pcf') ? read('design.pcf') : '', files, steps: ex.steps, bram: ex.bram, formal: ex.formal, top: ex.top, device: ex.device, package: ex.package, freq: ex.freq });
  ck(`example "${ex.id}"`, !!EXPECT[ex.id]?.(out), `${Date.now() - t0}ms${out.res.ok ? '' : ' | ' + out.log.split('\n').filter(l => /error/i.test(l)).slice(0, 2).join(' | ')}`);
}
// server-side validation of the new request fields
const D = 'module top(input a, output y); assign y = a; endmodule', TB = 'module tb; initial $finish; endmodule';
for (const [name, body, re] of [
  ['extra file with path traversal rejected', { design: D, files: { '../evil.hex': 'x' } }, /invalid extra file/],
  ['extra file with disallowed extension rejected', { design: D, files: { 'run.sh': 'x' } }, /invalid extra file/],
  ['extra file clobbering design.v rejected', { design: D, files: { 'design.v': 'x' } }, /invalid extra file/],
  ['more than 8 extra files rejected', { design: D, files: Object.fromEntries([...Array(9)].map((_, i) => [`f${i}.hex`, '0'])) }, /at most 8/],
  ['no steps enabled rejected', { design: D, steps: [] }, /nothing to do/],
  ['simulation requested without testbench rejected', { design: D, steps: ['sim'], tb: '' }, /needs a testbench/],
]) { const o = await flow(body); ck(name, o.res && !o.res.ok && re.test(o.res.error || ''), o.res?.error); }
const hdl = await flow({ design: 'module top(input a, output y); sub s(a, y); endmodule', files: { 'sub.v': 'module sub(input i, output o); assign o = ~i; endmodule' }, steps: ['synth'] });
ck('extra .v module is read by yosys', hdl.res.ok);
const noPnr = await flow({ design: D, steps: ['synth'] });
ck('synth-only run skips place and route', noPnr.res.ok && !noPnr.res.result.layout);
console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
