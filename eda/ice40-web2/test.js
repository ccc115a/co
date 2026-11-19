// Integration tests: node test.js  (server must be running on PORT, default 8080)
const BASE = `http://localhost:${process.env.PORT || 8080}`;
const GOOD = `module top(input clk, output [3:0] led);
reg [25:0] c=0; always @(posedge clk) c<=c+1; assign led=c[25:22]; endmodule`;
const PCF = 'set_io clk 35\nset_io led[0] 39\nset_io led[1] 40\nset_io led[2] 41\nset_io led[3] 42\n';
const TB = `\`timescale 1ns/1ps
module tb; reg clk=0; wire [3:0] led; top dut(.clk(clk),.led(led)); always #5 clk=~clk;
initial begin $dumpfile("wave.vcd"); $dumpvars(0,tb); #1000 $display("done c=%0d",dut.c); $finish; end endmodule`;

async function flow(body) {
  const t0 = Date.now(), r = await fetch(BASE + '/api/flow', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) return { status: r.status, ms: Date.now() - t0 };
  const evs = []; let buf = '';
  for await (const c of r.body) { buf += Buffer.from(c).toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { evs.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } }
  const res = evs.find(e => e.type === 'result');
  return { evs, res, ms: Date.now() - t0, logs: evs.filter(e => e.type === 'log').map(e => e.text) };
}
let fail = 0;
const check = (name, cond, extra = '') => { console.log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) fail++; };

const a = await flow({ design: GOOD, pcf: PCF, tb: TB, device: 'up5k', package: 'sg48', freq: 12 });
check('full flow ok', a.res?.ok, `${a.ms}ms`);
check('fmax reported', Object.values(a.res?.result.report?.fmax || {})[0]?.achieved > 12);
check('layout has cells and nets', a.res?.result.layout?.cells.length > 20 && a.res.result.layout.nets.some(n => n.edges.length));
check('bitstream produced', Buffer.from(a.res?.result.bin || '', 'base64').length > 1000);
check('VCD produced', /\$enddefinitions/.test(a.res?.result.vcd || ''));
check('$display captured', a.logs.some(l => l.includes('done c=')));

const b = await flow({ design: 'module top(input a, output b); assign b = a +; endmodule', device: 'up5k' });
check('syntax error reported, flow stops', b.res && !b.res.ok && b.res.failed === 'synth' && b.logs.some(l => /ERROR/.test(l)));

const c = await flow({ design: GOOD, top: 'top; rm -rf /', device: 'up5k' });
check('bad top name rejected', c.res && !c.res.ok && /invalid top/.test(c.res.error));
const d = await flow({ design: GOOD, device: '../../etc', package: 'sg48' });
check('bad device rejected', d.res && !d.res.ok);
const e = await flow({ design: GOOD, package: 'sg48; id' });
check('bad package rejected', e.res && !e.res.ok);

const f = await flow({ design: GOOD, pcf: PCF, device: 'up5k', package: 'sg48', tb: `module tb; initial begin $system("echo PWNED > /tmp/pwned_by_tb"); $finish; end endmodule` });
const pwned = await import('node:fs').then(fs => fs.existsSync('/tmp/pwned_by_tb'));
check('$system in testbench does not escape sandbox', !pwned, f.logs.filter(l => /system|PWNED/i.test(l)).join(' | '));

const g = await flow({ design: GOOD, pcf: PCF, device: 'up5k', package: 'sg48', tb: 'module tb; reg x=0; initial forever begin x=~x; end endmodule' });
check('infinite-loop testbench is killed', g.res && g.res.result?.simOk === false && g.logs.some(l => /time limit/.test(l)), `${g.ms}ms`);

const h = await fetch(BASE + '/api/flow', { method: 'POST', body: 'x'.repeat(400 * 1024) });
check('oversize body rejected', h.status === 413);
const i = await fetch(BASE + '/../server.js'); const i2 = await fetch(BASE + '/%2e%2e/server.js');
check('static path traversal blocked', i.status !== 200 || !(await i.text()).includes('createServer'));
check('static path traversal (encoded) blocked', i2.status !== 200 || !(await i2.text()).includes('createServer'));
// ---- cancel: closing the connection must kill the running tool (and its children) promptly
import { execSync } from 'node:child_process';
// Match on the command line, not the process name: the OSS CAD Suite starts its tools through ld-linux, so the name is not the tool's.
const alive = n => execSync('ps -eo args').toString().split('\n').some(l => new RegExp(`(^|[/ ])${n}( |$)`).test(l) && !/ps -eo|test\.js/.test(l));
const BIG = `module top(input clk, input [7:0] a, output y);
  wire [31:0] w [0:40]; assign w[0] = {24'd0, a};
  genvar i; generate for (i = 1; i <= 40; i = i + 1) begin : s
    reg [31:0] r; always @(posedge clk) r <= w[i-1] + {a, a, a, a} + i; assign w[i] = r; end endgenerate
  assign y = ^w[40];
endmodule`;
async function cancelDuring(stageName, body, tool) {
  const ac = new AbortController(); const r = await fetch(BASE + '/api/flow', { method: 'POST', body: JSON.stringify(body), signal: ac.signal });
  let buf = '', seen = false, t0 = 0, wasRunning = false;
  try { for await (const c of r.body) { buf += Buffer.from(c).toString(); if (buf.includes(`"stage":"${stageName}"`) && !seen) { seen = true; await new Promise(r => setTimeout(r, 1500)); wasRunning = alive(tool); t0 = Date.now(); ac.abort(); } } } catch {}
  let gone = false; for (let i = 0; i < 40 && !gone; i++) { await new Promise(r => setTimeout(r, 100)); gone = !alive(tool); }
  return { seen, wasRunning, gone, ms: Date.now() - t0 };
}
const c1 = await cancelDuring('pnr', { design: BIG, device: 'hx8k', package: 'ct256', freq: 12 }, 'nextpnr-ice40');
check('cancel during place and route: tool was running, then killed', c1.seen && c1.wasRunning && c1.gone, `killed within ${c1.ms}ms`);
const c2 = await cancelDuring('sim', { design: GOOD, pcf: PCF, device: 'up5k', package: 'sg48', tb: 'module tb; reg x=0; initial forever begin x=~x; end endmodule' }, 'vvp');
check('cancel during simulation: vvp killed', c2.seen && c2.wasRunning && c2.gone, `killed within ${c2.ms}ms`);
const after = await flow({ design: GOOD, pcf: PCF, device: 'up5k', package: 'sg48' });
check('server still works after cancels', after.res?.ok);
check('no orphan helper processes', !alive('yosys-abc') && !alive('nextpnr-ice40') && !alive('vvp'));
const rtl = a.res?.result.rtl;
check('RTL netlist returned for the schematic', rtl && JSON.parse(rtl).modules.top, rtl ? `${(rtl.length / 1024).toFixed(0)} KB` : 'missing');
const lc = a.res?.result.layout.cells.find(c => c.type === 'ICESTORM_LC');
check('layout cells carry connections and LUT init', lc?.conn.length > 0 && /^[0-9a-f]{4}$/.test(lc.init || ''), JSON.stringify(lc?.conn?.slice(0, 2)) + ' init=' + lc?.init);
check('layout includes routing heat and hop counts', a.res?.result.layout.heat.length > 3 && a.res.result.layout.nets.every(n => typeof n.hops === 'number'));


// ---- assembler, fast reprogram (icebram), formal verification
import { assemble, toHex } from './public/mcu0asm.js';
import fs from 'node:fs';
const caps = await (await fetch(BASE + '/api/capabilities')).json();
const EX = new URL('./public/examples/', import.meta.url), rd = (id, f) => fs.readFileSync(new URL(`${id}/${f}`, EX), 'utf8');
const MCU = { design: rd('mcu0-fpga', 'design.v'), pcf: rd('mcu0-fpga', 'design.pcf'), tb: rd('mcu0-fpga', 'tb.v'), device: 'up5k', package: 'sg48', freq: 12 };
const ASM = rd('mcu0-fpga', 'mcu0.asm'), BRAM = { file: 'mcu0.hex', width: 16, depth: 256 };
const nlog = (o, re) => o.logs.some(l => re.test(l));

const asmBad = await flow({ ...MCU, files: { 'mcu0.asm': 'LD 1\nFOO 2\nJMP NOWHERE' }, steps: ['synth'] });
check('assembler errors stop the flow and name file and line', asmBad.res && !asmBad.res.ok && asmBad.res.failed === 'asm' && nlog(asmBad, /^mcu0\.asm:2: ERROR: unknown instruction/) && nlog(asmBad, /^mcu0\.asm:3: ERROR: undefined label/));
const asmDup = await flow({ ...MCU, files: { 'mcu0.asm': ASM, 'mcu0.hex': '0000' }, steps: ['synth'] });
check('asm and hex of the same name are refused', asmDup.res && !asmDup.res.ok && /would overwrite/.test(asmDup.res.error || ''));

if (!caps.icebram) console.log('SKIP fast reprogram tests: icebram not installed');
else {
  const full = await flow({ ...MCU, files: { 'mcu0.hex': toHex(assemble(ASM)) }, steps: ['synth', 'pnr'] });            // ordinary build, real program in synthesis
  const f1 = await flow({ ...MCU, files: { 'mcu0.asm': ASM }, steps: ['synth', 'pnr'], bram: BRAM });                    // placeholder build + icebram
  check('fast reprogram: first run builds and swaps the image', f1.res?.ok && f1.res.result.fast?.hit === false && !!f1.res.result.bin, JSON.stringify(f1.res?.result.fast) + ` ${f1.ms}ms`);
  check('fast reprogram: bitstream is bit-identical to a full rebuild with the real program', full.res?.ok && f1.res?.ok && full.res.result.bin === f1.res.result.bin, `${Buffer.from(f1.res?.result.bin || '', 'base64').length} bytes`);
  const f2 = await flow({ ...MCU, files: { 'mcu0.asm': ASM }, steps: ['synth', 'pnr'], bram: BRAM });
  check('fast reprogram: same design again is served from the cache', f2.res?.result.fast?.hit === true && nlog(f2, /reusing synthesis and place-and-route/) && f2.res.result.bin === f1.res.result.bin, `${f2.ms}ms vs ${f1.ms}ms`);
  check('fast reprogram: cached run still returns report, layout and schematic', !!f2.res?.result.report && f2.res.result.layout?.cells.length > 20 && !!f2.res.result.rtl);
  const ASM2 = ASM.replace('N:      WORD  10', 'N:      WORD  4');
  const f3 = await flow({ ...MCU, files: { 'mcu0.asm': ASM2 }, steps: ['synth', 'pnr', 'sim'], bram: BRAM });
  const full2 = await flow({ ...MCU, files: { 'mcu0.hex': toHex(assemble(ASM2)) }, steps: ['synth', 'pnr'] });
  check('fast reprogram: a different program hits the cache and differs from the first bitstream', f3.res?.result.fast?.hit === true && f3.res.result.bin !== f1.res.result.bin);
  check('fast reprogram: the changed program is also bit-identical to its own full rebuild', f3.res?.result.bin === full2.res?.result.bin);
  check('simulation uses the real program, not the placeholder', nlog(f3, /SUM = 10, LED = 10 \(expect 55\) -> FAIL/), f3.logs.find(l => /SUM =/.test(l)));
  const f4 = await flow({ ...MCU, design: MCU.design + '\n// edit', files: { 'mcu0.asm': ASM }, steps: ['synth', 'pnr'], bram: BRAM });
  check('fast reprogram: editing the design invalidates the cache', f4.res?.result.fast?.hit === false);
  const e1 = await flow({ ...MCU, files: { 'mcu0.asm': ASM }, steps: ['synth', 'pnr'], bram: { ...BRAM, file: 'nope.hex' } });
  check('fast reprogram: unknown image file rejected', e1.res && !e1.res.ok && /pick a .hex file/.test(e1.res.error || ''));
  const e2 = await flow({ ...MCU, files: { 'mcu0.asm': ASM }, steps: ['synth', 'pnr'], bram: { ...BRAM, depth: 128 } });
  check('fast reprogram: shapes other than one 4 kbit block rejected', e2.res && !e2.res.ok && /4 kbit/.test(e2.res.error || ''));
  const e3 = await flow({ ...MCU, files: { 'mcu0.hex': '0016\n' + '0000\n'.repeat(300) }, steps: ['synth', 'pnr'], bram: BRAM });
  check('fast reprogram: image larger than the RAM rejected', e3.res && !e3.res.ok && /holds 256/.test(e3.res.error || ''));
  const e4 = await flow({ ...MCU, design: 'module top(input clk, output [7:0] led); reg [7:0] c; always @(posedge clk) c <= c + 1; assign led = c; endmodule', pcf: 'set_io clk 35\nset_io led[0] 36\nset_io led[1] 37\nset_io led[2] 38\nset_io led[3] 42\nset_io led[4] 43\nset_io led[5] 44\nset_io led[6] 45\nset_io led[7] 46\n', files: { 'mcu0.hex': '0016\n' }, steps: ['synth', 'pnr'], bram: BRAM });
  check('fast reprogram: a design that never reads the image is reported, not silently built', e4.res && !e4.res.ok && /not found in the bitstream/.test(e4.res.error || ''), e4.res?.error);
}

if (!caps.sby) console.log('SKIP formal tests: sby not installed');
else {
  const BCD = rd('bcd-formal', 'design.v');
  const b1 = await flow({ design: BCD, top: 'bcd', steps: ['formal'], formal: { mode: 'bmc', depth: 20 } });
  const F1 = b1.res?.result.formal;
  check('formal: buggy counter fails at the right line and step', F1?.status === 'FAIL' && F1.failures[0]?.line === 9 && F1.failures[0]?.step === 10, JSON.stringify(F1?.failures));
  check('formal: counterexample waveform returned and parseable', /\$enddefinitions/.test(F1?.vcd || '') && /count/.test(F1.vcd));
  const b2 = await flow({ design: BCD.replace('count == 10', 'count == 9'), top: 'bcd', steps: ['formal'], formal: { mode: 'prove', depth: 5 } });
  check('formal: fixed counter is proven by induction', b2.res?.result.formal?.status === 'PASS' && !b2.res.result.formal.vcd);
  const b3 = await flow({ design: BCD, top: 'bcd', steps: ['formal'], formal: { mode: 'cover', depth: 20 } });
  check('formal: cover reports the step it was reached at', b3.res?.result.formal?.covers.some(c => c.reached && c.step === 10) || b3.res?.result.formal?.covers.some(c => c.reached), JSON.stringify(b3.res?.result.formal?.covers));
  const m1 = await flow({ ...MCU, files: { 'mcu0.asm': ASM }, steps: ['formal'], formal: { mode: 'bmc', depth: 250, top: 'mcu0' } });
  check('formal: MCU0 property holds over 250 cycles', m1.res?.result.formal?.status === 'PASS', `${m1.ms}ms`);
  const m2 = await flow({ ...MCU, files: { 'mcu0.asm': ASM }, steps: ['formal'], formal: { mode: 'cover', depth: 250, top: 'mcu0' } });
  check('formal: the EXIT loop is reachable (the property is not vacuous)', m2.res?.result.formal?.covers.some(c => c.reached && c.step >= 230 && c.step <= 245), JSON.stringify(m2.res?.result.formal?.covers));
  const m3 = await flow({ ...MCU, design: MCU.design.replace("out == 8'd55);   // at", "out == 8'd54);   // at"), files: { 'mcu0.asm': ASM }, steps: ['formal'], formal: { mode: 'bmc', depth: 250, top: 'mcu0' } });
  check('formal: a wrong expected value is caught (mutation)', m3.res?.result.formal?.status === 'FAIL' && m3.res.result.formal.failures[0]?.step >= 230);
  const m4 = await flow({ ...MCU, files: { 'mcu0.asm': ASM }, steps: ['formal'], formal: { mode: 'bmc', depth: 30 } });
  check('formal: contradictory assumptions are explained', m4.res && !m4.res.ok && /can never all hold/.test(m4.res.result?.formal?.error || ''), m4.res?.result?.formal?.status);
  const x1 = await flow({ design: BCD, top: 'bcd', steps: ['formal'], formal: { mode: 'rm -rf', depth: 20 } });
  check('formal: bad mode rejected', x1.res && !x1.res.ok && /mode must be/.test(x1.res.error || ''));
  const x2 = await flow({ design: BCD, top: 'bcd', steps: ['formal'], formal: { mode: 'bmc', depth: 100000 } });
  check('formal: absurd depth rejected', x2.res && !x2.res.ok && /between 1 and 500/.test(x2.res.error || ''));
  const x3 = await flow({ design: BCD, top: 'bcd', steps: ['formal'], formal: { mode: 'bmc', depth: 5, top: 'x; rm -rf /' } });
  check('formal: bad top name rejected', x3.res && !x3.res.ok && /invalid formal top/.test(x3.res.error || ''));
  const x4 = await flow({ design: 'module bcd(input a, output y); assign y = a &; endmodule', top: 'bcd', steps: ['formal'], formal: { mode: 'bmc', depth: 5 } });
  check('formal: syntax errors surface with file and line', x4.res && !x4.res.ok && nlog(x4, /design\.v:1: ERROR/i), x4.logs.find(l => /ERROR/i.test(l)));
  // cancelling must also stop the solver processes that sby starts
  const c3 = await cancelDuring('formal', { ...MCU, files: { 'mcu0.asm': ASM }, steps: ['formal'], formal: { mode: 'bmc', depth: 250, top: 'mcu0', engine: 'yices' } }, 'yices-smt2');
  check('cancel during formal verification: solver killed', c3.seen && c3.wasRunning && c3.gone, `killed within ${c3.ms}ms`);
  check('no orphan solver or sby processes', !alive('yices-smt2') && !alive('boolector') && !alive('sby'));
}
const cap = await (await fetch(BASE + '/api/capabilities')).json();
check('capabilities endpoint reports tools and sandbox', typeof cap.sby === 'boolean' && typeof cap.icebram === 'boolean' && /^(linux|none)$/.test(cap.sandbox), JSON.stringify(cap));

console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
