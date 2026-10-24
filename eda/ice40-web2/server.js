// iCE40 web flow server — zero npm dependencies.
// Requires on PATH: yosys, nextpnr-ice40, icepack, iverilog, vvp, unshare, prlimit
import http from 'node:http';
import fs from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { assemble, toHex, listingText } from './public/mcu0asm.js';

const PORT = +process.env.PORT || 8080;
const HOST = process.env.HOST || '127.0.0.1';      // local only by default; set HOST=0.0.0.0 deliberately (e.g. inside Docker)
// Sandbox: 'linux' = unshare -n + prlimit (Linux only); 'none' = timeout kill only (macOS, or SANDBOX=none).
const SANDBOX = process.env.SANDBOX || (process.platform === 'linux' && spawnSync('unshare', ['-n', 'true']).status === 0 && spawnSync('prlimit', ['--version']).status === 0 ? 'linux' : 'none');
const CAP = {};   // optional tools, filled in at startup
const onPath = c => (process.env.PATH || '').split(path.delimiter).some(d => d && existsSync(path.join(d, c)));
const MAX_JOBS = +process.env.MAX_JOBS || 2;
const MAX_BODY = 300 * 1024;
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const LIMITS = { synth: 60, pnr: 120, sim: 30, diagram: 30, formal: 150, asm: 5 };           // seconds, wall-clock
const DEVICES = new Set(['up5k', 'hx8k', 'hx1k', 'lp8k', 'lp1k']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,63}$/;
const PKG = /^[a-z0-9]{2,8}$/;
// Extra project files (HDL modules, includes, memory images). Fixed extension list, no paths, no reserved names.
const EXTRA_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,39}\.(v|sv|vh|hex|mem|txt|asm)$/;
const RESERVED = new Set(['design.v', 'tb.v', 'design.pcf']);
const MAX_EXTRA = 8;

// ---- tiny semaphore so a burst of requests can't exhaust the box ----
let running = 0; const waiters = [];
const acquire = () => running < MAX_JOBS ? (running++, Promise.resolve()) : new Promise(r => waiters.push(r));
const release = () => { const w = waiters.shift(); w ? w() : running--; };

// ---- fast reprogram: remember the placed-and-routed bitstream of a design whose memory image is a placeholder,
// so that changing only the program (the hex file) costs one icebram run instead of synthesis plus place-and-route.
const CACHE_ROOT = path.join(os.tmpdir(), 'ice40-web-cache'), CACHE_MAX = 8, cache = new Map();   // key -> directory (insertion order = LRU)
const cacheGet = key => { const d = cache.get(key); if (d) { cache.delete(key); cache.set(key, d); } return d; };
async function cachePut(key, files) {
  const d = path.join(CACHE_ROOT, key); await fs.mkdir(d, { recursive: true });
  for (const [n, c] of Object.entries(files)) await fs.writeFile(path.join(d, n), c);
  cache.set(key, d);
  while (cache.size > CACHE_MAX) { const [k, old] = cache.entries().next().value; cache.delete(k); fs.rm(old, { recursive: true, force: true }); }
}
// $readmemh text -> tokens, comments removed
const hexTokens = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').split(/\s+/).filter(Boolean);
// Full-depth image, one word per line: what icebram compares against the bitstream.
function padImage(text, width, depth) {
  const t = hexTokens(text);
  if (t.length > depth) throw new Error(`the memory image has ${t.length} words but the block RAM holds ${depth}`);
  for (const w of t) {
    if (!/^[0-9a-f]+$/i.test(w)) throw new Error(`fast reprogram needs plain hex words, found "${w.slice(0, 12)}"`);
    if (parseInt(w, 16) >= 2 ** width) throw new Error(`word ${w} does not fit in ${width} bits`);
  }
  const digits = Math.ceil(width / 4);
  return [...t.map(w => w.padStart(digits, '0')), ...Array(depth - t.length).fill('0'.repeat(digits))].join('\n') + '\n';
}
// Unique, reproducible contents so icebram can find this memory in the bitstream.
const placeholderImage = (width, depth) => Array.from({ length: depth }, (_, i) =>
  (crypto.createHash('sha256').update(`ice40-web ${width}x${depth} #${i}`).digest().readUInt32BE(0) % 2 ** width).toString(16).padStart(Math.ceil(width / 4), '0')).join('\n') + '\n';

// Kill a whole process group: tools such as yosys start helper processes (yosys-abc) that must not outlive a cancel.
const killTree = p => { try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch {} } };

// ---- run one tool: no network (unshare -n), memory/cpu/file-size rlimits, hard wall-clock kill ----
function run(job, stage, cmd, args) {
  const secs = LIMITS[stage];
  if (job.cancelled) return Promise.resolve(-1);
  return new Promise(resolve => {
    const [bin, argv] = SANDBOX === 'linux'
      ? ['unshare', ['-n', 'prlimit', '--as=4294967296', `--cpu=${secs + 5}`, '--fsize=268435456', '--nproc=64', '--', cmd, ...args]]
      : [cmd, args];
    const p = spawn(bin, argv, { cwd: job.dir, env: { PATH: process.env.PATH, HOME: job.dir, LANG: 'C' }, detached: true });
    job.procs.add(p);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(p); }, secs * 1000);
    for (const [stream, kind] of [[p.stdout, 'out'], [p.stderr, 'err']]) {
      let buf = '';
      stream.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) { job.emit({ type: 'log', stage, kind, text: buf.slice(0, i) }); buf = buf.slice(i + 1); }
        if (buf.length > 65536) buf = buf.slice(-4096);
      });
      stream.on('end', () => buf && job.emit({ type: 'log', stage, kind, text: buf }));
    }
    p.on('close', code => {
      clearTimeout(timer); job.procs.delete(p);
      if (job.cancelled) return resolve(-1);
      if (timedOut) job.emit({ type: 'log', stage, kind: 'err', text: `ERROR: ${cmd} exceeded the ${secs}s time limit and was killed` });
      resolve(timedOut ? -1 : code);
    });
    p.on('error', e => { clearTimeout(timer); job.emit({ type: 'log', stage, kind: 'err', text: `ERROR: ${e.message}` }); resolve(-1); });
  });
}

const read = (job, f, enc) => fs.readFile(path.join(job.dir, f), enc).catch(() => null);

// Reduce nextpnr's routed JSON to what the viewer needs: cells (BEL, connections, LUT init),
// routed nets as inter-tile edges, and per-tile routing usage for the congestion heat map.
export function slimRouted(jsonText, top) {
  const j = JSON.parse(jsonText), m = j.modules[top] || Object.values(j.modules)[0];
  // bit id -> net name; prefer nets that carry a ROUTING attribute (the real routed ones) over aliases
  const bitNet = new Map();
  for (const pass of [true, false]) for (const [name, n] of Object.entries(m.netnames)) {
    if (!!n.attributes?.ROUTING !== pass) continue;
    for (const b of n.bits || []) if (typeof b === 'number' && !bitNet.has(b)) bitNet.set(b, name);
  }
  const cells = [];
  for (const [name, c] of Object.entries(m.cells)) {
    const b = /^X(\d+)\/Y(\d+)\/(\w+)/.exec(c.attributes?.NEXTPNR_BEL || '');
    if (!b) continue;
    const conn = [];
    for (const [port, bits] of Object.entries(c.connections || {})) { const nn = bitNet.get(bits[0]); if (nn && conn.length < 16) conn.push([port, nn]); }
    const cell = { name, type: c.type, x: +b[1], y: +b[2], bel: b[3], conn };
    const init = c.parameters?.LUT_INIT; if (typeof init === 'string' && /^[01]{16}$/.test(init)) cell.init = parseInt(init, 2).toString(16).padStart(4, '0');
    cells.push(cell);
  }
  const nets = [], heat = new Map(), edgeRe = /\/(\d+)\.(\d+)\.[^>]*\.->\.(\d+)\.(\d+)\./;
  for (const [name, n] of Object.entries(m.netnames)) {
    const r = n.attributes?.ROUTING; if (!r) continue;
    const t = r.split(';'), seen = new Set(), edges = []; let hops = 0;
    for (let i = 0; i + 1 < t.length; i += 3) {
      const e = edgeRe.exec(t[i + 1] || ''); if (!e) continue;
      hops++; const dk = e[3] + ',' + e[4]; heat.set(dk, (heat.get(dk) || 0) + 1);
      const k = e.slice(1, 5).join(','); if ((e[1] !== e[3] || e[2] !== e[4]) && !seen.has(k)) { seen.add(k); edges.push(e.slice(1, 5).map(Number)); }
    }
    nets.push({ name, edges, hops });
  }
  return { cells, nets, heat: [...heat].map(([k, v]) => [...k.split(',').map(Number), v]) };
}

async function flow(res, body, emit) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ice40-'));
  const job = { dir, emit, procs: new Set(), cancelled: false };
  // The client went away (cancel button, closed tab): stop everything. Note that req 'close' is useless here,
  // it fires as soon as the request body has been read; the response closing early is the real disconnect.
  res.on('close', () => { if (!res.writableFinished) { job.cancelled = true; job.procs.forEach(killTree); } });
  const log = (stage, text, kind = 'out') => emit({ type: 'log', stage, kind, text });
  try {
    const { design, tb, pcf } = body;
    const top = body.top || 'top', device = body.device || 'up5k', pkg = body.package || 'sg48';
    const freq = Math.min(Math.max(+body.freq || 12, 1), 500), seed = Math.floor(+body.seed) || 1;
    if (!IDENT.test(top)) throw new Error('invalid top module name');
    if (!DEVICES.has(device)) throw new Error('unknown device');
    if (!PKG.test(pkg)) throw new Error('invalid package');
    if (typeof design !== 'string' || !design.trim()) throw new Error('design is empty');
    const extra = Object.entries(body.files && typeof body.files === 'object' ? body.files : {});
    if (extra.length > MAX_EXTRA) throw new Error(`at most ${MAX_EXTRA} extra files`);
    for (const [n, c] of extra) if (!EXTRA_NAME.test(n) || RESERVED.has(n) || typeof c !== 'string') throw new Error(`invalid extra file name: ${String(n).slice(0, 40)}`);
    const explicit = Array.isArray(body.steps), steps = explicit ? body.steps : ['synth', 'pnr'];
    const wantPnr = steps.includes('pnr'), wantSynth = wantPnr || steps.includes('synth'), wantFormal = steps.includes('formal');
    const wantSim = explicit ? steps.includes('sim') : typeof tb === 'string' && tb.trim() !== '';   // no steps given: simulate only if a testbench exists
    if (!wantSynth && !wantSim && !wantFormal) throw new Error('nothing to do: enable synthesis, simulation or formal verification');
    const result = { top, device, package: pkg };
    const stage = (s) => emit({ type: 'stage', stage: s });

    // ---- assemble *.asm into *.hex
    const files = new Map(extra);
    for (const n of [...files.keys()].filter(n => n.endsWith('.asm'))) {
      stage('asm'); const out = n.slice(0, -4) + '.hex';
      if (files.has(out)) throw new Error(`${n} would overwrite ${out}; remove one of them`);
      const r = assemble(files.get(n));
      if (!r.ok) { for (const e of r.errors) log('asm', `${n}:${e.line}: ERROR: ${e.message}`, 'err'); return emit({ type: 'result', ok: false, failed: 'asm', result }); }
      log('asm', `${n}: ${r.words.length} words, ${r.bytes} bytes -> ${out}`);
      for (const l of listingText(r)) log('asm', '  ' + l);
      files.set(out, toHex(r)); files.delete(n);
    }
    const hdl = [...files.keys()].filter(n => /\.s?v$/.test(n));

    // ---- fast reprogram request (icebram)
    let bram = null;
    if (body.bram && wantPnr) {
      if (!CAP.icebram) throw new Error('icebram is not installed');
      const { file, width, depth } = body.bram;
      if (typeof file !== 'string' || !files.has(file) || !/\.(hex|mem)$/.test(file)) throw new Error('fast reprogram: pick a .hex file that is part of the project');
      if (![2, 4, 8, 16].includes(width) || width * depth !== 4096) throw new Error('fast reprogram supports one 4 kbit block RAM: width x depth = 4096 (16 x 256, 8 x 512, 4 x 1024, 2 x 2048)');
      bram = { file, width, depth, real: padImage(files.get(file), width, depth), placeholder: placeholderImage(width, depth) };
    }

    await fs.writeFile(path.join(dir, 'design.v'), design);
    for (const [n, c] of files) await fs.writeFile(path.join(dir, n), bram && n === bram.file ? bram.placeholder : c);
    if (pcf) await fs.writeFile(path.join(dir, 'design.pcf'), pcf);

    let cacheKey = null, cached = null;
    if (bram) {
      const rest = [...files].filter(([n]) => n !== bram.file).sort(([x], [y]) => x < y ? -1 : 1);
      cacheKey = crypto.createHash('sha256').update(JSON.stringify({ design, pcf: pcf || '', top, device, pkg, freq, seed, rest, bram: [bram.file, bram.width, bram.depth] })).digest('hex');
      cached = cacheGet(cacheKey);
    }

    let rc = 0;
    if (cached) {
      stage('synth');
      log('synth', 'Design unchanged: reusing synthesis and place-and-route from the cache. Only the program image changes.');
      const saved = JSON.parse(await fs.readFile(path.join(cached, 'results.json'), 'utf8'));
      Object.assign(result, saved, { synthOk: true, pnrOk: true });
      await fs.copyFile(path.join(cached, 'out.asc'), path.join(dir, 'out.asc'));
    } else {
      if (wantSynth) {
        stage('synth');
        rc = await run(job, 'synth', 'yosys', ['-p', `read_verilog -sv -I. design.v ${hdl.join(' ')}; synth_ice40 -top ${top} -json out.json; stat`]);
        result.synthOk = rc === 0;
        if (rc !== 0) return emit({ type: 'result', ok: false, failed: 'synth', result });
        // RTL schematic for the diagram tab: optional, never fails the flow
        stage('diagram');
        const drc = await run(job, 'diagram', 'yosys', ['-q', '-p', `read_verilog -sv -I. design.v ${hdl.join(' ')}; prep -top ${top}; write_json rtl.json`]);
        const rtl = drc === 0 ? await read(job, 'rtl.json', 'utf8') : null;
        if (rtl && rtl.length <= 6e6) result.rtl = rtl;
        else log('diagram', rtl ? 'NOTE: schematic skipped, netlist is too large' : 'NOTE: schematic not available for this design', 'err');
      }
      if (job.cancelled) return;
      if (wantPnr) {
        stage('pnr');
        const args = [`--${device}`, '--package', pkg, '--json', 'out.json', '--asc', 'out.asc', '--freq', String(freq), '--seed', String(seed),
          '--report', 'report.json', '--write', 'routed.json', ...(pcf ? ['--pcf', 'design.pcf'] : [])];
        rc = await run(job, 'pnr', 'nextpnr-ice40', args);
        result.pnrOk = rc === 0;
        if (job.cancelled) return;
        if (rc !== 0) return emit({ type: 'result', ok: false, failed: 'pnr', result });
        result.report = JSON.parse(await read(job, 'report.json', 'utf8'));
        result.layout = slimRouted(await read(job, 'routed.json', 'utf8'), top);
        if (bram) await cachePut(cacheKey, { 'out.asc': await fs.readFile(path.join(dir, 'out.asc')), 'results.json': JSON.stringify({ rtl: result.rtl, report: result.report, layout: result.layout }) });
      }
    }
    if (job.cancelled) return;

    if (wantPnr) {
      let asc = 'out.asc';
      if (bram) {
        const t0 = Date.now();
        await fs.writeFile(path.join(dir, 'placeholder.hex'), bram.placeholder); await fs.writeFile(path.join(dir, 'real.hex'), bram.real);
        rc = await run(job, 'pnr', 'sh', ['-c', 'icebram placeholder.hex real.hex < out.asc > fast.asc']);
        if (job.cancelled) return;
        const notFound = `The program image ${bram.file} was not found in the bitstream. Check that a ${bram.width} x ${bram.depth} memory is initialised with $readmemh("${bram.file}", ...) and that Yosys maps it to one block RAM.`;
        if (rc !== 0 || (await fs.readFile(path.join(dir, 'fast.asc'))).equals(await fs.readFile(path.join(dir, 'out.asc')))) throw new Error(notFound);
        asc = 'fast.asc'; result.fast = { hit: !!cached, ms: Date.now() - t0 };
        log('pnr', `icebram: program image of ${bram.file} swapped into the bitstream (${result.fast.ms} ms${cached ? ', no synthesis or place-and-route needed' : ''})`);
      }
      rc = await run(job, 'pnr', 'icepack', [asc, 'out.bin']);
      const bin = rc === 0 && await read(job, 'out.bin');
      if (bin) result.bin = bin.toString('base64');
    }

    // Simulation and formal verification see the real program, not the placeholder.
    if (bram) await fs.writeFile(path.join(dir, bram.file), files.get(bram.file));
    if (job.cancelled) return;
    if (wantSim) {
      if (typeof tb !== 'string' || !tb.trim()) throw new Error('simulation needs a testbench (tb.v)');
      stage('sim');
      await fs.writeFile(path.join(dir, 'tb.v'), tb);
      rc = await run(job, 'sim', 'iverilog', ['-g2012', '-I.', '-o', 'sim.vvp', 'tb.v', 'design.v', ...hdl]);
      if (rc === 0) rc = await run(job, 'sim', 'vvp', ['-n', 'sim.vvp']);   // -n: $stop ends the run instead of prompting
      result.simOk = rc === 0;
      const vcd = await read(job, 'wave.vcd', 'utf8');
      if (vcd) result.vcd = vcd.length > 8e6 ? vcd.slice(0, 8e6) : vcd;
      if (vcd?.length > 8e6) log('sim', 'WARNING: VCD truncated to 8 MB', 'err');
    }

    if (job.cancelled) return;
    if (wantFormal) {
      if (!CAP.sby) throw new Error('SymbiYosys (sby) is not installed. Run bash linux.sh --oss or bash imac.sh to get the full toolchain.');
      const f = body.formal || {}, ENGINE = ['boolector', 'bitwuzla', 'yices', 'z3'].includes(f.engine) ? f.engine : 'boolector', mode = f.mode || 'bmc', depth = Math.floor(+f.depth || 20), ftop = f.top || top;
      if (!['bmc', 'prove', 'cover'].includes(mode)) throw new Error('formal mode must be bmc, prove or cover');
      if (!(depth >= 1 && depth <= 500)) throw new Error('formal depth must be between 1 and 500');
      if (!IDENT.test(ftop)) throw new Error('invalid formal top module name');
      stage('formal');
      const sources = ['design.v', ...files.keys()];
      await fs.writeFile(path.join(dir, 'job.sby'),
        `[options]\nmode ${mode}\ndepth ${depth}\ntimeout ${LIMITS.formal - 15}\n\n[engines]\nsmtbmc ${ENGINE}\n\n[script]\nread_verilog -formal -sv -I. design.v ${hdl.join(' ')}\nprep -top ${ftop}\n\n[files]\n${sources.join('\n')}\n`);
      rc = await run(job, 'formal', 'sby', ['-f', 'job.sby']);
      if (job.cancelled) return;
      const text = await read(job, 'job/logfile.txt', 'utf8') || '';
      const fm = { mode, depth, status: (/DONE \((\w+)/.exec(text) || [])[1] || 'ERROR', failures: [], covers: [] };
      for (const m of text.matchAll(/summary:\s+failed assertion (\S+) at ([^:\s]+):(\d+)\.\d+-\d+\.\d+ step (\d+)/g)) fm.failures.push({ assertion: m[1].split('.').pop(), file: m[2], line: +m[3], step: +m[4] });
      for (const m of text.matchAll(/Reached cover statement in step (\d+) at \S+: ([^:\s]+):(\d+)\./g)) fm.covers.push({ reached: true, step: +m[1], file: m[2], line: +m[3] });
      for (const m of text.matchAll(/Unreached cover statement at \S+: ([^:\s]+):(\d+)\./g)) fm.covers.push({ reached: false, file: m[1], line: +m[2] });
      const engines = (await fs.readdir(path.join(dir, 'job')).catch(() => [])).filter(n => /^engine_\d+$/.test(n));
      for (const e of engines) {
        const names = (await fs.readdir(path.join(dir, 'job', e)).catch(() => [])).filter(n => /^trace\d*\.vcd$/.test(n)).sort();
        if (names.length) { const v = await read(job, `job/${e}/${names[0]}`, 'utf8'); if (v) { fm.vcd = v.length > 8e6 ? v.slice(0, 8e6) : v; break; } }
      }
      if (/Assumptions are unsatisfiable/.test(text)) {
        fm.error = 'The assume() statements can never all hold, so nothing was checked. Check them against the formal top module: for example an assume on an input that the top module drives differently.';
        log('formal', 'ERROR: ' + fm.error, 'err');
      }
      result.formal = fm;
      if (fm.status === 'ERROR') return emit({ type: 'result', ok: false, failed: 'formal', result });
    }
    emit({ type: 'result', ok: true, result });
  } catch (e) {
    emit({ type: 'result', ok: false, error: e.message });
  } finally {
    fs.rm(dir, { recursive: true, force: true });
  }
}

const TEXT = 'text/plain; charset=utf-8';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.v': TEXT, '.hex': TEXT, '.pcf': TEXT };
http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/flow') {
      let size = 0; const chunks = [];
      for await (const c of req) { size += c.length; if (size > MAX_BODY) { res.writeHead(413, { Connection: 'close' }).end('too large'); req.destroy(); return; } chunks.push(c); }
      let body; try { body = JSON.parse(Buffer.concat(chunks)); } catch { res.writeHead(400).end('bad json'); return; }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      const emit = ev => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(ev) + '\n'); };
      if (running >= MAX_JOBS) emit({ type: 'queued' });
      await acquire();
      try { if (!res.destroyed) await flow(res, body, emit); } finally { release(); res.end(); }
      return;
    }
    if (req.method === 'GET' && req.url === '/api/capabilities') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ...CAP, sandbox: SANDBOX })); return; }
    if (req.method === 'GET') {
      const file = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
      const full = path.join(PUBLIC, path.normalize(file));
      if (!full.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
      const data = await fs.readFile(full).catch(() => null);
      if (!data) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' }).end(data);
      return;
    }
    res.writeHead(405).end();
  } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e.message)); }
}).listen(PORT, HOST, () => {
  console.log(`ice40-web on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (sandbox: ${SANDBOX})`);
  if (SANDBOX === 'none') console.log('WARNING: no network/memory isolation, only time limits. Do not expose this to untrusted users.');
  CAP.sby = onPath('sby'); CAP.icebram = onPath('icebram');
  fs.rm(CACHE_ROOT, { recursive: true, force: true });
  if (!CAP.sby) console.log('NOTE: sby not found, formal verification is disabled (bash linux.sh --oss installs it)');
  if (!CAP.icebram) console.log('NOTE: icebram not found, fast reprogram is disabled');
  const missing = ['yosys', 'nextpnr-ice40', 'icepack', 'iverilog', 'vvp'].filter(c => !onPath(c));
  if (missing.length) console.log('WARNING: not found on PATH: ' + missing.join(', '));
});
