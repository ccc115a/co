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
console.log(fail ? `\n${fail} FAILED` : '\nall passed'); process.exit(fail ? 1 : 0);
