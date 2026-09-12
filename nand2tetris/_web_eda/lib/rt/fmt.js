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

/** 值欄位：二進位零填補到寬度 b（超過則不放開） */
export function binField(v, b) {
  let s = (v & 0xffff).toString(2);
  if (s.length >= b) return s;
  return '0'.repeat(b - s.length) + s;
}

/** 值欄位：有號十進位右對齊（寬度 b） */
export function decField(v, b) {
  let s = String((v & 0xffff) > 0x7fff ? (v & 0xffff) - 0x10000 : (v & 0xffff));
  if (s.length >= b) return s;
  return ' '.repeat(b - s.length) + s;
}

/** 值欄位：十六進位右對齊（寬度 b） */
export function hexField(v, b) {
  let s = (v & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  if (s.length >= b) return s;
  return ' '.repeat(b - s.length) + s;
}

/** 產生表頭列（第一行） */
export function headerLine(fields) {
  const body = fields.map((f) => center(f.name, f.width()));
  return `|${body.join('|')}|`;
}

/**
 * 由目前值產生一列資料。
 * `get` 傳回該名稱的值；null 表示未定義（輸出 `***`）。
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
    const v = get(f.name);
    if (v === null || v === undefined) {
      body.push('*'.repeat(f.width()));
      continue;
    }
    const cell = f.kind === Kind.Bin ? binField(v, f.b)
      : f.kind === Kind.Dec ? decField(v, f.b)
      : hexField(v, f.b);
    body.push(' '.repeat(f.a) + cell + ' '.repeat(f.c));
  }
  return `|${body.join('|')}|`;
}