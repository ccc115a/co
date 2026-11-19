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
const alive = n => { try { return execSync(`pgrep -x ${n}`).toString().trim().length > 0; } catch { return false; } };
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

console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
