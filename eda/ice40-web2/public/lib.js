// Pure helpers shared by the page and the Node tests (no DOM access here).

export function parseVCD(text) {
  const sig = [], byId = new Map(), scope = [];
  let timescale = '1ns', t = 0, end = 0, i = 0;
  const tok = text.split(/\s+/); // VCD is whitespace-delimited
  const upto = () => { const a = []; while (i < tok.length && tok[i] !== '$end') a.push(tok[i++]); i++; return a; };
  while (i < tok.length) {
    const w = tok[i++];
    if (w === '$timescale') timescale = upto().join('');
    else if (w === '$scope') { const a = upto(); scope.push(a[1]); }
    else if (w === '$upscope') { upto(); scope.pop(); }
    else if (w === '$var') {
      const a = upto(); // type size id name [range]
      const s = { name: [...scope, a[3]].join('.'), width: +a[1], id: a[2], changes: [] };
      sig.push(s); if (!byId.has(a[2])) byId.set(a[2], []); byId.get(a[2]).push(s);
    } else if (w === '$enddefinitions') { upto(); }
    else if (w[0] === '$') { if (!/^\$(end|dump(vars|all|on|off))$/.test(w)) upto(); } // $dump* only wrap value changes: keep their bodies
    else if (w[0] === '#') { t = +w.slice(1); if (t > end) end = t; }
    else if (w[0] === 'b' || w[0] === 'B') { const v = w.slice(1), id = tok[i++]; for (const s of byId.get(id) || []) s.changes.push([t, v]); }
    else if (w[0] === 'r' || w[0] === 'R') { i++; }
    else if ('01xXzZ'.includes(w[0]) && w.length > 1) { for (const s of byId.get(w.slice(1)) || []) s.changes.push([t, w[0].toLowerCase()]); }
  }
  return { timescale, end, signals: sig.filter(s => s.changes.length) };
}

export function busToHex(bits) {
  if (/[xz]/.test(bits)) return bits.length <= 4 ? bits : bits.replace(/[^xz]/g, '').length === bits.length ? bits[0] : '?';
  const n = parseInt(bits, 2); return isNaN(n) ? '?' : '0x' + n.toString(16);
}

// Value of a signal at time t (last change at or before t), by binary search.
export function valueAt(s, t) {
  const c = s.changes; let lo = 0, hi = c.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r < 0 ? 'x' : c[r][1];
}

// nextpnr report -> flat summary the UI can render without knowing its exact schema.
export function summarizeReport(rep) {
  const fmax = Object.entries(rep?.fmax || {}).map(([clock, v]) => ({ clock, achieved: v.achieved, constraint: v.constraint, pass: v.achieved >= v.constraint }));
  const util = Object.entries(rep?.utilization || {}).filter(([, v]) => v.available > 0).map(([name, v]) => ({ name: name.replace(/^ICESTORM_/, ''), used: v.used, available: v.available }));
  const path = (rep?.critical_paths?.[0]?.path || []).map(p => ({ type: p.type, delay: p.delay, from: p.from ? `${p.from.cell}.${p.from.port}` : '', to: p.to ? `${p.to.cell}.${p.to.port}` : '', fromCell: p.from?.cell, toCell: p.to?.cell, net: p.net }));
  return { fmax, util, path, criticalNets: new Set(path.map(p => p.net).filter(Boolean)) };
}

export function layoutBounds(layout) {
  let mx = 0, my = 0;
  for (const c of layout.cells) { mx = Math.max(mx, c.x); my = Math.max(my, c.y); }
  for (const n of layout.nets) for (const e of n.edges) { mx = Math.max(mx, e[0], e[2]); my = Math.max(my, e[1], e[3]); }
  return { maxX: mx, maxY: my };
}

// "design.v:12: ERROR: ..." or "ERROR: design.v:12: ..." -> {file, line}
export function errorLocation(line) {
  const m = /([A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:v|sv|vh|asm)):(\d+)/.exec(line);
  return m && /error/i.test(line) ? { file: m[1], line: +m[2] } : null;
}
