// 官方 HardwareSimulator 的輸出格式（逐字元對齊 .cmp）
// （對應 _eda/hackrt/src/fmt.rs）

export const Kind = { Bin: 'B', Dec: 'D', Hex: 'X', Sym: 'S' };

export class OutField {
  constructor(name, kind, a, b, c) {
    this.name = name;
    this.kind = kind;
    this.a = a;
    this.b = b;
    this.c = c;
  }
  width() { return this.a + this.b + this.c; }
}

/** 把文字置中到寬度 w（截斷到 w，奇數餘格放右邊） */
export function center(text, w) {
  if (text.length >= w) {
    return text.slice(0, w);
  }
  const left = Math.floor((w - text.length) / 2);
  const right = w - text.length - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

/** 值欄位：二進位零填補到寬度 b（超過則不放開；v 以 u32 呈現） */
export function binField(v, b) {
  let s = (v >>> 0).toString(2);
  if (s.length >= b) return s;
  return '0'.repeat(b - s.length) + s;
}

/**
 * 值欄位：有號十進位右對齊（寬度 b）。
 * w = 腳位/記憶體的實際位元寬度（32 → u32 語意；< 32 → 16-bit 有號語意，
 * 與教材 .cmp 的 hex/tst %D 一致。兩者位元相同，僅顯示語意不同）。
 */
export function decField(v, b, w) {
  let s;
  if (w === 32) {
    const u = v >>> 0;
    s = String(u > 0x7fffffff ? u - 0x100000000 : u);
  } else {
    const x = (v & 0xffff) > 0x7fff ? (v & 0xffff) - 0x10000 : (v & 0xffff);
    s = String(x);
  }
  if (s.length >= b) return s;
  return ' '.repeat(b - s.length) + s;
}

/** 值欄位：十六進位右對齊（寬度 b，w=32 → 8 位數、<32 → 4 位數） */
export function hexField(v, b, w) {
  let s = (v >>> 0).toString(16).toUpperCase().padStart(w === 32 ? 8 : 4, '0');
  if (s.length >= b) return s;
  return ' '.repeat(b - s.length) + s;
}

/** 產生表頭列（第一行） */
export function headerLine(fields) {
  const body = fields.map((f) => center(f.name, f.width()));
  return `|${body.join('|')}|`;
}

/**
 * 產生一列資料。
 * `get` 傳回一個欄位的取值：物件 `{ v, w }`（v=值、w=位元寬度）或 null（輸出 `***`）；
 * 純值（無 w）視為 32 位元。寬度決定十進位/十六進位的有號語意。
 * `timeStr` 在 `%S` 欄位（名稱 `time`）使用。
 */
export function dataLine(fields, timeStr, get) {
  const body = [];
  for (const f of fields) {
    if (f.kind === Kind.Sym) {
      const txt = f.name === 'time' ? timeStr : '';
      const cell = txt.length >= f.b ? txt : txt.padEnd(f.b);
      body.push(' '.repeat(f.a) + cell + ' '.repeat(f.c));
      continue;
    }
    const o = get(f.name);
    if (o === null || o === undefined) {
      body.push('*'.repeat(f.width()));
      continue;
    }
    const v = typeof o === 'object' ? o.v : o;
    const w = typeof o === 'object' && o.w !== undefined ? o.w : 32;
    const cell = f.kind === Kind.Bin ? binField(v, f.b)
      : f.kind === Kind.Dec ? decField(v, f.b, w)
      : hexField(v, f.b, w);
    body.push(' '.repeat(f.a) + cell + ' '.repeat(f.c));
  }
  return `|${body.join('|')}|`;
}