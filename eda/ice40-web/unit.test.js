import { parseVCD, busToHex, valueAt, summarizeReport, layoutBounds, errorLocation } from './public/lib.js';
import { slimRouted } from './server.js';
let fail = 0; const ck = (n, c, x = '') => { console.log(c ? 'PASS' : 'FAIL', n, x); if (!c) fail++; };
const vcd = `$timescale 1ps $end $scope module tb $end $var reg 1 ! clk $end $var wire 4 " led [3:0] $end
$scope module dut $end $var wire 1 ! clk $end $upscope $end $upscope $end $enddefinitions $end
#0 $dumpvars 0! b0000 " $end
#5000 1! #10000 0! b1010 " #20000 1!`;
const v = parseVCD(vcd);
ck('timescale', v.timescale === '1ps'); ck('end time', v.end === 20000);
ck('aliased id feeds both signals', v.signals.filter(s => s.id === '!').length === 2 && v.signals.every(s => s.changes.length));
ck('hierarchical name', v.signals.some(s => s.name === 'tb.dut.clk'));
const led = v.signals.find(s => s.name === 'tb.led');
ck('valueAt', valueAt(led, 9999) === '0000' && valueAt(led, 10000) === '1010' && valueAt(led, -1) === 'x');
ck('busToHex', busToHex('1010') === '0xa' && busToHex('10xz') === '10xz' && busToHex('0000') === '0x0');
ck('errorLocation', errorLocation('alu.sv:7: ERROR: x')?.file === 'alu.sv' && errorLocation('design.v:3: ERROR: syntax error')?.line === 3 && !errorLocation('design.v:3: Warning: x') && !errorLocation('hello'));
ck('summarize handles empty report', summarizeReport({}).fmax.length === 0 && summarizeReport(undefined).path.length === 0);
const s = summarizeReport({ fmax: { c: { achieved: 10, constraint: 12 } }, critical_paths: [{ path: [{ type: 'routing', delay: 1, net: 'n1', from: { cell: 'a', port: 'O' }, to: { cell: 'b', port: 'I' } }] }] });
ck('critical path rows carry raw cell names', s.path[0].fromCell === 'a' && s.path[0].toCell === 'b');
ck('fmax fail flagged, critical net collected', s.fmax[0].pass === false && s.criticalNets.has('n1'));
const routed = JSON.stringify({ modules: { top: { cells: { u: { type: 'ICESTORM_LC', attributes: { NEXTPNR_BEL: 'X5/Y27/lc3' } }, w: { type: 'X', attributes: {} } },
  netnames: { a: { attributes: { ROUTING: 'X5/Y27/w;;1;X4/Y27/l;X4/Y27/4.27.lutff_7:out.->.5.27.local_g1_7.;1;X5/Y27/m;X5/Y27/5.27.a.->.5.27.b.;1' } }, b: { attributes: {} } } } } });
const sl = slimRouted(routed, 'top');
ck('slimRouted cells', sl.cells.length === 1 && sl.cells[0].bel === 'lc3' && sl.cells[0].x === 5);
ck('slimRouted keeps inter-tile edge, drops intra-tile', sl.nets.length === 1 && sl.nets[0].edges.length === 1 && sl.nets[0].edges[0].join() === '4,27,5,27');
ck('layoutBounds', layoutBounds(sl).maxX === 5 && layoutBounds(sl).maxY === 27);
process.exit(fail ? 1 : 0);
