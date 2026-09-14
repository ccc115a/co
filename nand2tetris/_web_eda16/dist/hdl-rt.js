/* hackeda 瀏覽器 fs/path shim（dist/hdl-rt.js）：把 HACKJS_CORPUS 當唯讀檔案系統，
   配上 overlay（run 過程寫出的 *.out 存在 mem）。載入順序：corpus.js → hdl-rt.js → embed.js。 */
(() => {
  'use strict';
  if (!window.HACKJS_CORPUS) window.HACKJS_CORPUS = {};

  const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

  window.HACKJS_PATH = {
    basename(p, ext) {
      let b = norm(p).split('/').pop();
      if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length);
      return b;
    },
    dirname(p) {
      const s = norm(p).split('/');
      s.pop();
      return s.join('/') || '.';
    },
    join(...ps) {
      return ps.filter((x) => x !== undefined && x !== null && x !== '').map(norm).join('/').replace(/\/+/g, '/');
    },
  };

  const P = (p) => norm(p);
  const mem = Object.create(null);
  const prefixOf = (dir) => (dir === '.' || dir === '' ? '' : norm(dir) + '/');

  const fsImpl = {
    readdirSync(dir, opts) {
      const pre = prefixOf(dir);
      const seen = new Map(); // name → isDir
      for (const key of Object.keys(window.HACKJS_CORPUS).concat(Object.keys(mem))) {
        if (!key.startsWith(pre)) continue;
        const rest = key.slice(pre.length);
        if (!rest) continue;
        const seg = rest.split('/')[0];
        if (!seen.has(seg)) {
          const rest2 = rest.slice(seg.length).replace(/^\//, '');
          seen.set(seg, rest2.length > 0); // 還有下一段 → 它是目錄
        }
      }
      const entries = [];
      for (const [name, isDir] of seen) {
        entries.push({ name, isDirectory: () => isDir, isFile: () => !isDir });
      }
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return entries;
    },
    readFileSync(p, enc) {
      const k = P(p);
      if (k in mem) return mem[k];
      if (k in window.HACKJS_CORPUS) return window.HACKJS_CORPUS[k];
      throw new Error(`ENOENT: 語料中沒有 ${k}`);
    },
    writeFileSync(p, text) {
      mem[P(p)] = String(text);
    },
    mkdirSync() { /* overlay 目錄透明，不需要實體 */ },
    read(p) {
      const k = P(p);
      if (k in mem) return mem[k];
      if (k in window.HACKJS_CORPUS) return window.HACKJS_CORPUS[k];
      return null;
    },
  };
  window.HACKJS_FS = fsImpl;
})();