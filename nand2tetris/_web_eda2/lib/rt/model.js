// 頂層晶片的 runtime 包裝（對應 _eda/hackrt/src/main.rs 的 Wrap<Top>）
// 負責：輸入/輸出以 pin 名稱操作、tick/tock、outM/writeM 特例、
//        PinRef 探測（RAM/螢幕等記憶體對映腳位）、load_program。
import { pinSan } from '../hdl/codegen.js';
import { PinRef } from './tst.js';

export class TopModel {
  /**
   * @param {Function} TopClass 產出的 top 晶片 class
   * @param {object} chip ElabChip（提供 inPins/outPins/hasState）
   * @param {Function} evalInRaw evaluate 用的參考實作（測試用，可省略）
   */
  constructor(TopClass, chip) {
    this.chip = new TopClass();
    this.inPins = chip.inPins.map((p) => p.name);
    this.outPins = chip.outPins.map((p) => p.name);
    this.ins = Object.fromEntries(this.inPins.map((n) => [n, 0]));
    this.outs = Object.fromEntries(this.outPins.map((n) => [n, undefined]));
    this.hasState = chip.hasState;
    this.time = 0;
  }

  /** 由輸入 pin 名稱取值（未定義回 0） */
  getIn(name) {
    return (this.ins[name] ?? 0) & 0xffff;
  }

  getInNames() {
    return this.inPins;
  }

  getOutNames() {
    return this.outPins;
  }

  /** 由輸出 pin 名稱取值；outM 特例：writeM==0 時回 undefined */
  getOut(name) {
    if (name === 'outM' && this.outPins.includes('writeM')) {
      if (this.getOut('writeM') === 0) return undefined;
    }
    return this.outs[name] ?? 0;
  }

  /** 設定：outM 特例寫入（writeM==1） */
  setOut(name, val) {
    if (name !== 'outM') return;
    if (this.getOut('writeM') !== 1 && this.outPins.includes('writeM')) {
      throw new Error(`${name}: 試圖寫入，但 writeM 不是 1`);
    }
    this.outs[name] = val & 0xffff;
  }

  /** 把 `<pin> = val` 寫進輸入：支援 PinRef 或純字串（`a`、`RAM[3]`） */
  setInput(pin, val) {
    const name = typeof pin === 'string' ? pin : pin.raw();
    if (name.includes('[')) {
      return this.setIdx(name, val);
    }
    if (this.inPins.includes(name)) {
      this.ins[name] = val & 0xffff;
      return true;
    }
    return this.chip.set_whole ? this.chip.set_whole(name, val) ?? false : false;
  }

  setIdx(raw, val) {
    const m = raw.match(/^(\w+)\[(\d+)\]$/);
    if (!m) return false;
    const name = m[1];
    const idx = Number(m[2]);
    if (this.inPins.includes(name)) {
      const bitMask = 1 << idx;
      this.ins[name] = ((this.ins[name] ?? 0) & ~bitMask) | ((val & 1) << idx);
      return true;
    }
    return this.chip.set_probe ? this.chip.set_probe(name, idx, val) ?? false : false;
  }

  /** evaluate：算出組合輸出 */
  doEval() {
    const args = this.inPins.map((n) => this.getIn(n));
    this.outs = this.chip.eval(...args);
  }

  /** tick：master 半週期──取樣有狀態晶片，然後重新求值組合輸出（DFF 仍是舊值） */
  tick() {
    if (this.hasState) {
      const args = this.inPins.map((n) => this.getIn(n));
      this.chip.sample(...args);
    }
    this.doEval();
  }

  /** tock：slave 半週期──提交狀態，然後重新求值輸出 */
  tock() {
    if (this.chip.tock) this.chip.tock();
    this.doEval();
    this.time += 1;
  }

  /** 寫入程式（ROM32K load）；回傳原本成功與否 */
  loadRom(p) {
    if (!this.chip.load_program) return false;
    try {
      return this.chip.load_program(p);
    } catch (e) {
      return false;
    }
  }

  /** 由 pin 名稱取值：輸出、輸入、探測（RAM/Screen/Keyboard 記憶體對映）。對應 Rust Wrap::get_output */
  getOutput(name) {
    const pr = PinRef.parse(name);
    if (pr.idx.kind === 'Whole') {
      if (this.outPins.includes(pr.name)) return this.getOut(pr.name);
      if (this.inPins.includes(pr.name)) return this.getIn(pr.name);
      return this.chip.probe_whole ? this.chip.probe_whole(pr.name) ?? undefined : undefined;
    }
    // Bit(i)：探測（`RAM16K[0]`、`ARegister[0]`、`PC[]` 整根）
    return this.chip.probe_indexed ? this.chip.probe_indexed(pr.name, pr.idx.i) ?? undefined : undefined;
  }

  now() {
    return this.time;
  }
}