// iCE40 web flow server — zero npm dependencies.
// Requires on PATH: yosys, nextpnr-ice40, icepack, iverilog, vvp, unshare, prlimit
import http from 'node:http';
import fs from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = +process.env.PORT || 8080;
const HOST = process.env.HOST || '127.0.0.1';      // local only by default; set HOST=0.0.0.0 deliberately (e.g. inside Docker)
// Sandbox: 'linux' = unshare -n + prlimit (Linux only); 'none' = timeout kill only (macOS, or SANDBOX=none).
const SANDBOX = process.env.SANDBOX || (process.platform === 'linux' && spawnSync('unshare', ['-n', 'true']).status === 0 && spawnSync('prlimit', ['--version']).status === 0 ? 'linux' : 'none');
const onPath = c => (process.env.PATH || '').split(path.delimiter).some(d => d && existsSync(path.join(d, c)));
const MAX_JOBS = +process.env.MAX_JOBS || 2;
const MAX_BODY = 300 * 1024;
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const LIMITS = { synth: 60, pnr: 120, sim: 30 };           // seconds, wall-clock
const DEVICES = new Set(['up5k', 'hx8k', 'hx1k', 'lp8k', 'lp1k']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,63}$/;
const PKG = /^[a-z0-9]{2,8}$/;

// ---- tiny semaphore so a burst of requests can't exhaust the box ----
let running = 0; const waiters = [];
const acquire = () => running < MAX_JOBS ? (running++, Promise.resolve()) : new Promise(r => waiters.push(r));
const release = () => { const w = waiters.shift(); w ? w() : running--; };

// ---- run one tool: no network (unshare -n), memory/cpu/file-size rlimits, hard wall-clock kill ----
function run(job, stage, cmd, args) {
  const secs = LIMITS[stage];
  return new Promise(resolve => {
    const [bin, argv] = SANDBOX === 'linux'
      ? ['unshare', ['-n', 'prlimit', '--as=4294967296', `--cpu=${secs + 5}`, '--fsize=268435456', '--nproc=64', '--', cmd, ...args]]
      : [cmd, args];
    const p = spawn(bin, argv, { cwd: job.dir, env: { PATH: process.env.PATH, HOME: job.dir, LANG: 'C' } });
    job.procs.add(p);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, secs * 1000);
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
      if (timedOut) job.emit({ type: 'log', stage, kind: 'err', text: `ERROR: ${cmd} exceeded the ${secs}s time limit and was killed` });
      resolve(timedOut ? -1 : code);
    });
    p.on('error', e => { clearTimeout(timer); job.emit({ type: 'log', stage, kind: 'err', text: `ERROR: ${e.message}` }); resolve(-1); });
  });
}

const read = (job, f, enc) => fs.readFile(path.join(job.dir, f), enc).catch(() => null);

// Reduce nextpnr's routed JSON to what the viewer needs: cell BELs and inter-tile route edges.
export function slimRouted(jsonText, top) {
  const j = JSON.parse(jsonText), m = j.modules[top] || Object.values(j.modules)[0];
  const cells = [];
  for (const [name, c] of Object.entries(m.cells)) {
    const b = /^X(\d+)\/Y(\d+)\/(\w+)/.exec(c.attributes?.NEXTPNR_BEL || '');
    if (b) cells.push({ name, type: c.type, x: +b[1], y: +b[2], bel: b[3] });
  }
  const nets = [], edgeRe = /\/(\d+)\.(\d+)\.[^>]*\.->\.(\d+)\.(\d+)\./;
  for (const [name, n] of Object.entries(m.netnames)) {
    const r = n.attributes?.ROUTING; if (!r) continue;
    const t = r.split(';'), seen = new Set(), edges = [];
    for (let i = 0; i + 1 < t.length; i += 3) {
      const e = edgeRe.exec(t[i + 1] || ''); if (!e) continue;
      const k = e.slice(1, 5).join(','); if ((e[1] !== e[3] || e[2] !== e[4]) && !seen.has(k)) { seen.add(k); edges.push(e.slice(1, 5).map(Number)); }
    }
    nets.push({ name, edges });
  }
  return { cells, nets };
}

async function flow(req, body, emit) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ice40-'));
  const job = { dir, emit, procs: new Set() };
  req.on('close', () => job.procs.forEach(p => p.kill('SIGKILL')));
  try {
    const { design, tb, pcf } = body;
    const top = body.top || 'top', device = body.device || 'up5k', pkg = body.package || 'sg48';
    const freq = Math.min(Math.max(+body.freq || 12, 1), 500), seed = Math.floor(+body.seed) || 1;
    if (!IDENT.test(top)) throw new Error('invalid top module name');
    if (!DEVICES.has(device)) throw new Error('unknown device');
    if (!PKG.test(pkg)) throw new Error('invalid package');
    if (typeof design !== 'string' || !design.trim()) throw new Error('design is empty');
    await fs.writeFile(path.join(dir, 'design.v'), design);
    const result = { top, device, package: pkg };
    const stage = (s) => emit({ type: 'stage', stage: s });

    stage('synth');
    let rc = await run(job, 'synth', 'yosys', ['-p', `read_verilog -sv design.v; synth_ice40 -top ${top} -json out.json; stat`]);
    result.synthOk = rc === 0;
    if (rc !== 0) return emit({ type: 'result', ok: false, failed: 'synth', result });
    emit({ type: 'artifact', name: 'netlist', size: (await fs.stat(path.join(dir, 'out.json'))).size });

    if (body.steps?.includes('pnr') !== false) {
      stage('pnr');
      if (pcf) await fs.writeFile(path.join(dir, 'design.pcf'), pcf);
      const args = [`--${device}`, '--package', pkg, '--json', 'out.json', '--asc', 'out.asc', '--freq', String(freq), '--seed', String(seed),
        '--report', 'report.json', '--write', 'routed.json', ...(pcf ? ['--pcf', 'design.pcf'] : [])];
      rc = await run(job, 'pnr', 'nextpnr-ice40', args);
      result.pnrOk = rc === 0;
      if (rc !== 0) return emit({ type: 'result', ok: false, failed: 'pnr', result });
      result.report = JSON.parse(await read(job, 'report.json', 'utf8'));
      result.layout = slimRouted(await read(job, 'routed.json', 'utf8'), top);
      rc = await run(job, 'pnr', 'icepack', ['out.asc', 'out.bin']);
      const bin = rc === 0 && await read(job, 'out.bin');
      if (bin) result.bin = bin.toString('base64');
    }

    if (typeof tb === 'string' && tb.trim()) {
      stage('sim');
      await fs.writeFile(path.join(dir, 'tb.v'), tb);
      rc = await run(job, 'sim', 'iverilog', ['-g2012', '-o', 'sim.vvp', 'tb.v', 'design.v']);
      if (rc === 0) rc = await run(job, 'sim', 'vvp', ['-n', 'sim.vvp']);   // -n: $stop ends the run instead of prompting
      result.simOk = rc === 0;
      const vcd = await read(job, 'wave.vcd', 'utf8');
      if (vcd) result.vcd = vcd.length > 8e6 ? vcd.slice(0, 8e6) : vcd;
      if (vcd?.length > 8e6) emit({ type: 'log', stage: 'sim', kind: 'err', text: 'WARNING: VCD truncated to 8 MB' });
    }
    emit({ type: 'result', ok: true, result });
  } catch (e) {
    emit({ type: 'result', ok: false, error: e.message });
  } finally {
    fs.rm(dir, { recursive: true, force: true });
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/flow') {
      let size = 0; const chunks = [];
      for await (const c of req) { size += c.length; if (size > MAX_BODY) { res.writeHead(413, { Connection: 'close' }).end('too large'); req.destroy(); return; } chunks.push(c); }
      let body; try { body = JSON.parse(Buffer.concat(chunks)); } catch { res.writeHead(400).end('bad json'); return; }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      const emit = ev => res.write(JSON.stringify(ev) + '\n');
      if (running >= MAX_JOBS) emit({ type: 'queued' });
      await acquire();
      try { await flow(req, body, emit); } finally { release(); res.end(); }
      return;
    }
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
  const missing = ['yosys', 'nextpnr-ice40', 'icepack', 'iverilog', 'vvp'].filter(c => !onPath(c));
  if (missing.length) console.log('WARNING: not found on PATH: ' + missing.join(', '));
});
