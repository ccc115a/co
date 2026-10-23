// 波形檢視器：canvas 繪製，支援縮放（滾輪）、平移（拖曳）、游標檢視。
// 用法：
//   const wv = createWaveViewer(canvas, signals);
//   wv.setData(signals)  // signals: [{name,width,values, isPort, direction}]
export function createWaveViewer(canvas, signals = []) {
  const ctx = canvas.getContext('2d');
  const ROW_H = 26, NAME_W = 170;
  let pxPerStep = 8;
  let offset = 0; // 起始 step
  let steps = 0;
  let drag = null;
  let hoverStep = -1;

  const fmtVal = (sig, v) => {
    if (v === 'x') return 'x';
    if (sig.width === 1) return v ? '1' : '0';
    return '0x' + v.toString(16);
  };

  function totalSteps() {
    return signals.length ? signals[0].values.length : 0;
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    steps = totalSteps();
    if (!signals.length || !steps) {
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.fillText('（尚無波形，先執行「模擬」）', 20, 30);
      return;
    }
    // 背景
    ctx.fillStyle = '#141821';
    ctx.fillRect(0, 0, w, h);
    // 名稱欄
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(0, 0, NAME_W, h);
    // 游標
    if (hoverStep >= 0) {
      const x = NAME_W + (hoverStep - offset) * pxPerStep;
      if (x >= NAME_W) {
        ctx.strokeStyle = '#e0b040';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
    }
    ctx.font = '12px ui-monospace, monospace';
    signals.forEach((sig, i) => {
      const y = 14 + i * ROW_H;
      if (y > h) return;
      // 名稱
      ctx.fillStyle = sig.isPort ? '#9ecbff' : '#8a93a8';
      ctx.fillText(sig.name.length > 22 ? sig.name.slice(0, 21) + '…' : sig.name, 6, y + 12);
      ctx.fillStyle = '#5a6478';
      ctx.fillText(`[${sig.width}]`, NAME_W - 40, y + 12);
      // 軌道分隔
      ctx.strokeStyle = '#232a3a';
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H - 8); ctx.lineTo(w, y + ROW_H - 8); ctx.stroke();
      drawSignal(sig, y, h);
    });
    // 狀態列
    if (hoverStep >= 0) {
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(NAME_W, h - 18, w - NAME_W, 18);
      ctx.fillStyle = '#e0b040';
      ctx.fillText(`t=${hoverStep}`, NAME_W + 6, h - 5);
    }
  }

  function drawSignal(sig, y, h) {
    const half = ROW_H / 2 - 6;
    const x0 = (step) => NAME_W + (step - offset) * pxPerStep;
    const first = Math.max(0, Math.floor(offset));
    const last = Math.min(steps - 1, Math.ceil(offset + (canvas.clientWidth - NAME_W) / pxPerStep));
    if (sig.width === 1) {
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#4ec9b0';
      ctx.beginPath();
      let pen = false;
      for (let s = first; s <= last + 1 && s < steps; s++) {
        const v = sig.values[s];
        const x = x0(s);
        const hi = v === 1;
        if (!pen) { ctx.moveTo(x, y + (hi ? 4 : 4 + half)); pen = true; }
        else ctx.lineTo(x, y + (hi ? 4 : 4 + half));
        if (s + 1 < steps && sig.values[s + 1] !== v) {
          ctx.lineTo(x0(s + 1), y + (hi ? 4 : 4 + half));
          ctx.moveTo(x0(s + 1), y + (sig.values[s + 1] === 1 ? 4 : 4 + half));
        }
      }
      ctx.stroke();
      // x 值用紅色
      ctx.strokeStyle = '#e06c75';
      for (let s = first; s <= last && s < steps; s++) {
        if (sig.values[s] === 'x') {
          const x = x0(s);
          ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + pxPerStep, y + 4 + half); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y + 4 + half); ctx.lineTo(x + pxPerStep, y + 4); ctx.stroke();
        }
      }
    } else {
      // 匯流排：值改變處畫六角形
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#c586c0';
      ctx.fillStyle = '#c586c0';
      let segStart = first;
      for (let s = first + 1; s <= last + 1; s++) {
        const prev = sig.values[s - 1], cur = s < steps ? sig.values[s] : null;
        const changed = s < steps && cur !== prev;
        if (!changed && s <= last) continue;
        const xa = x0(segStart), xb = Math.min(x0(s), canvas.clientWidth);
        const v = sig.values[segStart];
        const yc = y + 4 + half;
        if (v === 'x') {
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(xa + 1, yc - half / 2, Math.max(2, xb - xa - 2), half);
          ctx.setLineDash([]);
          ctx.fillText('x', xa + 4, yc + 4);
        } else {
          ctx.beginPath();
          ctx.moveTo(xa, yc - half / 2);
          ctx.lineTo(xb - 4, yc - half / 2);
          ctx.lineTo(xb, yc);
          ctx.lineTo(xb - 4, yc + half / 2);
          ctx.lineTo(xa, yc + half / 2);
          ctx.closePath();
          ctx.stroke();
          const txt = fmtVal(sig, v);
          if (xb - xa > txt.length * 7 + 8) ctx.fillText(txt, xa + 5, yc + 4);
        }
        segStart = s;
      }
    }
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - NAME_W;
    const stepAt = offset + mx / pxPerStep;
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    pxPerStep = Math.min(64, Math.max(0.5, pxPerStep * factor));
    offset = Math.max(0, stepAt - mx / pxPerStep);
    draw();
  }, { passive: false });
  canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, offset }; });
  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (drag) {
      offset = Math.max(0, drag.offset - (e.clientX - drag.x) / pxPerStep);
      draw();
    }
    if (e.clientY >= rect.top && e.clientY <= rect.bottom && e.clientX >= rect.left && e.clientX <= rect.right) {
      const mx = e.clientX - rect.left - NAME_W;
      hoverStep = Math.round(offset + mx / pxPerStep);
      if (hoverStep < 0 || hoverStep >= steps) hoverStep = -1;
      draw();
    }
  });
  window.addEventListener('mouseup', () => { drag = null; });

  draw();
  return {
    setData(newSignals) { signals = newSignals; offset = 0; pxPerStep = 8; draw(); },
    redraw: draw,
  };
}
