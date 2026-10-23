// WebEDA 引擎宿主：在 Web Worker 裡跑 YoWASP 的 yosys / nextpnr-ice40 / icepack。
// 訊息協定：
//   req: { id, tool: 'yosys'|'nextpnr-ice40'|'icepack', args: string[], files: {name: string|Uint8Array} }
//   resp: { id, ok, log: [{stream,text}], files: {name: string|Uint8Array}, error?: string }
let engines = {};

async function getEngine(tool) {
  if (engines[tool]) return engines[tool];
  let mod;
  if (tool === 'yosys') {
    mod = await import('../vendor/yowasp/yosys/bundle.js');
  } else {
    mod = await import('../vendor/yowasp/nextpnr-ice40/bundle.js');
  }
  const fn = {
    'yosys': mod.runYosys,
    'nextpnr-ice40': mod.runNextpnrIce40,
    'icepack': mod.runIcepack,
  }[tool];
  if (!fn) throw new Error(`未知工具: ${tool}`);
  engines[tool] = fn;
  return fn;
}

self.onmessage = async (ev) => {
  const { id, tool, args, files } = ev.data;
  const log = [];
  const push = (stream) => (chunk) => {
    if (chunk == null) return;
    const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    log.push({ stream, text });
    self.postMessage({ id, type: 'log', stream, text });
  };
  try {
    self.postMessage({ id, type: 'status', text: `載入 ${tool}（WebAssembly）…` });
    const fn = await getEngine(tool);
    const stdin = () => null;
    const out = await fn(args, files || {}, {
      stdin,
      stdout: push('out'),
      stderr: push('err'),
      fetchProgress: (e) => self.postMessage({
        id, type: 'fetch', doneLength: e.doneLength, totalLength: e.totalLength,
      }),
    });
    // 回傳的檔案可能含大 Uint8Array，直接 postMessage 交給結構化複製
    self.postMessage({ id, type: 'done', ok: true, log, files: out || {} });
  } catch (e) {
    const filesOut = e && e.files ? e.files : {};
    self.postMessage({
      id, type: 'done', ok: false,
      error: (e && e.message) || String(e),
      code: e && e.code,
      log,
      files: filesOut,
    });
  }
};
