// 由 hackjs/hdl2js 自動產生，請勿手動編輯
// ---- 共用工具 ----
function setBits(w, lo, n, val) {
  const mask = n >= 16 ? 0xffff : ((1 << n) - 1);
  return (w & (~(mask << lo) & 0xffff)) | ((val & mask) << lo);
}

// ---- 內建 Nand ----
class NandChip {
  eval(a, b) { return { out: !(a !== 0 && b !== 0) ? 1 : 0 }; }
  tick() {} tock() {}
}

// ---- Not ----
class NotChip {
  constructor() {
    this._p0 = new NandChip();
  }
  eval(in_) {
    let w_out = 0;
    { // part 0: Nand (NandChip)
      let __i0 = ((in_ >> 0) & 0x1);
      let __i1 = ((in_ >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(in_) {
    let w_out = 0;
    { // part 0: Nand (NandChip)
      let __i0 = ((in_ >> 0) & 0x1);
      let __i1 = ((in_ >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
  }
  probe_whole(name) {
    // part 0: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // 遞迴 user parts
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // 遞迴 user parts
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Nand (NandChip)
    if (name === "Nand") {
      return false;
    }
    // 遞迴 user parts
    return false;
  }
  load_program(p) {
    return false;
  }
}

// ---- And ----
class AndChip {
  constructor() {
    this._p0 = new NandChip();
    this._p1 = new NandChip();
  }
  eval(a, b) {
    let w_AnandB = 0;
    let w_out = 0;
    { // part 0: Nand (NandChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_AnandB = setBits(w_AnandB, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Nand (NandChip)
      let __i0 = w_AnandB;
      let __i1 = w_AnandB;
      const __o = this._p1.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(a, b) {
    let w_AnandB = 0;
    let w_out = 0;
    { // part 0: Nand (NandChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_AnandB = setBits(w_AnandB, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Nand (NandChip)
      let __i0 = w_AnandB;
      let __i1 = w_AnandB;
      const __o = this._p1.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
  }
  probe_whole(name) {
    // part 0: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // part 1: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // 遞迴 user parts
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // part 1: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // 遞迴 user parts
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Nand (NandChip)
    if (name === "Nand") {
      return false;
    }
    // part 1: Nand (NandChip)
    if (name === "Nand") {
      return false;
    }
    // 遞迴 user parts
    return false;
  }
  load_program(p) {
    return false;
  }
}

// ---- Or ----
class OrChip {
  constructor() {
    this._p0 = new NotChip();
    this._p1 = new NotChip();
    this._p2 = new NandChip();
  }
  eval(a, b) {
    let w_nota = 0;
    let w_notb = 0;
    let w_out = 0;
    { // part 0: Not (NotChip)
      let __i0 = ((a >> 0) & 0x1);
      const __o = this._p0.eval(__i0);
      w_nota = setBits(w_nota, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Not (NotChip)
      let __i0 = ((b >> 0) & 0x1);
      const __o = this._p1.eval(__i0);
      w_notb = setBits(w_notb, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: Nand (NandChip)
      let __i0 = w_nota;
      let __i1 = w_notb;
      const __o = this._p2.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(a, b) {
    let w_nota = 0;
    let w_notb = 0;
    let w_out = 0;
    { // part 0: Not (NotChip)
      let __i0 = ((a >> 0) & 0x1);
      const __o = this._p0.eval(__i0);
      w_nota = setBits(w_nota, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Not (NotChip)
      let __i0 = ((b >> 0) & 0x1);
      const __o = this._p1.eval(__i0);
      w_notb = setBits(w_notb, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: Nand (NandChip)
      let __i0 = w_nota;
      let __i1 = w_notb;
      const __o = this._p2.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
  }
  probe_whole(name) {
    // part 0: Not (NotChip)
    if (name === "Not") {
      return this._p0.eval(0)["out"];
    }
    // part 1: Not (NotChip)
    if (name === "Not") {
      return this._p1.eval(0)["out"];
    }
    // part 2: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // 遞迴 user parts
    { const v = this._p0.probe_whole(name); if (v !== null) return v; }
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Not (NotChip)
    if (name === "Not") {
      return this._p0.eval(0)["out"];
    }
    // part 1: Not (NotChip)
    if (name === "Not") {
      return this._p1.eval(0)["out"];
    }
    // part 2: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // 遞迴 user parts
    { const v = this._p0.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p0.set_whole(name, val)) return true;
    if (this._p1.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 1: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 2: Nand (NandChip)
    if (name === "Nand") {
      return false;
    }
    // 遞迴 user parts
    if (this._p0.set_probe(name, i, val)) return true;
    if (this._p1.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p0.load_program(p)) return true;
    if (this._p1.load_program(p)) return true;
    return false;
  }
}

// ---- Mux ----
class MuxChip {
  constructor() {
    this._p0 = new NotChip();
    this._p1 = new AndChip();
    this._p2 = new AndChip();
    this._p3 = new OrChip();
  }
  eval(a, b, sel) {
    let w_nsel = 0;
    let w_o1 = 0;
    let w_o2 = 0;
    let w_out = 0;
    { // part 0: Not (NotChip)
      let __i0 = ((sel >> 0) & 0x1);
      const __o = this._p0.eval(__i0);
      w_nsel = setBits(w_nsel, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: And (AndChip)
      let __i0 = ((b >> 0) & 0x1);
      let __i1 = ((sel >> 0) & 0x1);
      const __o = this._p2.eval(__i0, __i1);
      w_o2 = setBits(w_o2, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: And (AndChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = w_nsel;
      const __o = this._p1.eval(__i0, __i1);
      w_o1 = setBits(w_o1, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: Or (OrChip)
      let __i0 = w_o1;
      let __i1 = w_o2;
      const __o = this._p3.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(a, b, sel) {
    let w_nsel = 0;
    let w_o1 = 0;
    let w_o2 = 0;
    let w_out = 0;
    { // part 0: Not (NotChip)
      let __i0 = ((sel >> 0) & 0x1);
      const __o = this._p0.eval(__i0);
      w_nsel = setBits(w_nsel, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: And (AndChip)
      let __i0 = ((b >> 0) & 0x1);
      let __i1 = ((sel >> 0) & 0x1);
      const __o = this._p2.eval(__i0, __i1);
      w_o2 = setBits(w_o2, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: And (AndChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = w_nsel;
      const __o = this._p1.eval(__i0, __i1);
      w_o1 = setBits(w_o1, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: Or (OrChip)
      let __i0 = w_o1;
      let __i1 = w_o2;
      const __o = this._p3.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
    this._p3.tock();
  }
  probe_whole(name) {
    // part 0: Not (NotChip)
    if (name === "Not") {
      return this._p0.eval(0)["out"];
    }
    // part 1: And (AndChip)
    if (name === "And") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return this._p2.eval(0, 0)["out"];
    }
    // part 3: Or (OrChip)
    if (name === "Or") {
      return this._p3.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_whole(name); if (v !== null) return v; }
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    { const v = this._p2.probe_whole(name); if (v !== null) return v; }
    { const v = this._p3.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Not (NotChip)
    if (name === "Not") {
      return this._p0.eval(0)["out"];
    }
    // part 1: And (AndChip)
    if (name === "And") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return this._p2.eval(0, 0)["out"];
    }
    // part 3: Or (OrChip)
    if (name === "Or") {
      return this._p3.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p2.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p3.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p0.set_whole(name, val)) return true;
    if (this._p1.set_whole(name, val)) return true;
    if (this._p2.set_whole(name, val)) return true;
    if (this._p3.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 1: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 3: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // 遞迴 user parts
    if (this._p0.set_probe(name, i, val)) return true;
    if (this._p1.set_probe(name, i, val)) return true;
    if (this._p2.set_probe(name, i, val)) return true;
    if (this._p3.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p0.load_program(p)) return true;
    if (this._p1.load_program(p)) return true;
    if (this._p2.load_program(p)) return true;
    if (this._p3.load_program(p)) return true;
    return false;
  }
}

// ---- Mux16 ----
class Mux16Chip {
  constructor() {
    this._p0 = new MuxChip();
    this._p1 = new MuxChip();
    this._p2 = new MuxChip();
    this._p3 = new MuxChip();
    this._p4 = new MuxChip();
    this._p5 = new MuxChip();
    this._p6 = new MuxChip();
    this._p7 = new MuxChip();
    this._p8 = new MuxChip();
    this._p9 = new MuxChip();
    this._p10 = new MuxChip();
    this._p11 = new MuxChip();
    this._p12 = new MuxChip();
    this._p13 = new MuxChip();
    this._p14 = new MuxChip();
    this._p15 = new MuxChip();
  }
  eval(a, b, sel) {
    let w_out = 0;
    { // part 0: Mux (MuxChip)
      let __i0 = ((a >> 15) & 0x1);
      let __i1 = ((b >> 15) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 15, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Mux (MuxChip)
      let __i0 = ((a >> 14) & 0x1);
      let __i1 = ((b >> 14) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p1.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 14, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: Mux (MuxChip)
      let __i0 = ((a >> 13) & 0x1);
      let __i1 = ((b >> 13) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p2.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 13, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: Mux (MuxChip)
      let __i0 = ((a >> 12) & 0x1);
      let __i1 = ((b >> 12) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p3.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 12, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: Mux (MuxChip)
      let __i0 = ((a >> 11) & 0x1);
      let __i1 = ((b >> 11) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p4.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 11, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: Mux (MuxChip)
      let __i0 = ((a >> 10) & 0x1);
      let __i1 = ((b >> 10) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p5.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 10, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: Mux (MuxChip)
      let __i0 = ((a >> 9) & 0x1);
      let __i1 = ((b >> 9) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p6.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 9, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 7: Mux (MuxChip)
      let __i0 = ((a >> 8) & 0x1);
      let __i1 = ((b >> 8) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p7.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 8, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 8: Mux (MuxChip)
      let __i0 = ((a >> 7) & 0x1);
      let __i1 = ((b >> 7) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p8.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 7, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 9: Mux (MuxChip)
      let __i0 = ((a >> 6) & 0x1);
      let __i1 = ((b >> 6) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p9.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 6, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 10: Mux (MuxChip)
      let __i0 = ((a >> 5) & 0x1);
      let __i1 = ((b >> 5) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p10.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 5, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 11: Mux (MuxChip)
      let __i0 = ((a >> 4) & 0x1);
      let __i1 = ((b >> 4) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p11.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 4, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 12: Mux (MuxChip)
      let __i0 = ((a >> 3) & 0x1);
      let __i1 = ((b >> 3) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p12.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 3, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 13: Mux (MuxChip)
      let __i0 = ((a >> 2) & 0x1);
      let __i1 = ((b >> 2) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p13.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 2, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 14: Mux (MuxChip)
      let __i0 = ((a >> 1) & 0x1);
      let __i1 = ((b >> 1) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p14.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 1, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 15: Mux (MuxChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p15.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(a, b, sel) {
    let w_out = 0;
    { // part 0: Mux (MuxChip)
      let __i0 = ((a >> 15) & 0x1);
      let __i1 = ((b >> 15) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 15, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Mux (MuxChip)
      let __i0 = ((a >> 14) & 0x1);
      let __i1 = ((b >> 14) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p1.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 14, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: Mux (MuxChip)
      let __i0 = ((a >> 13) & 0x1);
      let __i1 = ((b >> 13) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p2.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 13, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: Mux (MuxChip)
      let __i0 = ((a >> 12) & 0x1);
      let __i1 = ((b >> 12) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p3.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 12, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: Mux (MuxChip)
      let __i0 = ((a >> 11) & 0x1);
      let __i1 = ((b >> 11) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p4.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 11, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: Mux (MuxChip)
      let __i0 = ((a >> 10) & 0x1);
      let __i1 = ((b >> 10) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p5.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 10, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: Mux (MuxChip)
      let __i0 = ((a >> 9) & 0x1);
      let __i1 = ((b >> 9) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p6.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 9, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 7: Mux (MuxChip)
      let __i0 = ((a >> 8) & 0x1);
      let __i1 = ((b >> 8) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p7.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 8, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 8: Mux (MuxChip)
      let __i0 = ((a >> 7) & 0x1);
      let __i1 = ((b >> 7) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p8.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 7, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 9: Mux (MuxChip)
      let __i0 = ((a >> 6) & 0x1);
      let __i1 = ((b >> 6) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p9.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 6, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 10: Mux (MuxChip)
      let __i0 = ((a >> 5) & 0x1);
      let __i1 = ((b >> 5) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p10.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 5, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 11: Mux (MuxChip)
      let __i0 = ((a >> 4) & 0x1);
      let __i1 = ((b >> 4) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p11.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 4, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 12: Mux (MuxChip)
      let __i0 = ((a >> 3) & 0x1);
      let __i1 = ((b >> 3) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p12.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 3, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 13: Mux (MuxChip)
      let __i0 = ((a >> 2) & 0x1);
      let __i1 = ((b >> 2) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p13.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 2, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 14: Mux (MuxChip)
      let __i0 = ((a >> 1) & 0x1);
      let __i1 = ((b >> 1) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p14.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 1, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 15: Mux (MuxChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      let __i2 = ((sel >> 0) & 0x1);
      const __o = this._p15.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
    this._p3.tock();
    this._p4.tock();
    this._p5.tock();
    this._p6.tock();
    this._p7.tock();
    this._p8.tock();
    this._p9.tock();
    this._p10.tock();
    this._p11.tock();
    this._p12.tock();
    this._p13.tock();
    this._p14.tock();
    this._p15.tock();
  }
  probe_whole(name) {
    // part 0: Mux (MuxChip)
    if (name === "Mux") {
      return this._p0.eval(0, 0, 0)["out"];
    }
    // part 1: Mux (MuxChip)
    if (name === "Mux") {
      return this._p1.eval(0, 0, 0)["out"];
    }
    // part 2: Mux (MuxChip)
    if (name === "Mux") {
      return this._p2.eval(0, 0, 0)["out"];
    }
    // part 3: Mux (MuxChip)
    if (name === "Mux") {
      return this._p3.eval(0, 0, 0)["out"];
    }
    // part 4: Mux (MuxChip)
    if (name === "Mux") {
      return this._p4.eval(0, 0, 0)["out"];
    }
    // part 5: Mux (MuxChip)
    if (name === "Mux") {
      return this._p5.eval(0, 0, 0)["out"];
    }
    // part 6: Mux (MuxChip)
    if (name === "Mux") {
      return this._p6.eval(0, 0, 0)["out"];
    }
    // part 7: Mux (MuxChip)
    if (name === "Mux") {
      return this._p7.eval(0, 0, 0)["out"];
    }
    // part 8: Mux (MuxChip)
    if (name === "Mux") {
      return this._p8.eval(0, 0, 0)["out"];
    }
    // part 9: Mux (MuxChip)
    if (name === "Mux") {
      return this._p9.eval(0, 0, 0)["out"];
    }
    // part 10: Mux (MuxChip)
    if (name === "Mux") {
      return this._p10.eval(0, 0, 0)["out"];
    }
    // part 11: Mux (MuxChip)
    if (name === "Mux") {
      return this._p11.eval(0, 0, 0)["out"];
    }
    // part 12: Mux (MuxChip)
    if (name === "Mux") {
      return this._p12.eval(0, 0, 0)["out"];
    }
    // part 13: Mux (MuxChip)
    if (name === "Mux") {
      return this._p13.eval(0, 0, 0)["out"];
    }
    // part 14: Mux (MuxChip)
    if (name === "Mux") {
      return this._p14.eval(0, 0, 0)["out"];
    }
    // part 15: Mux (MuxChip)
    if (name === "Mux") {
      return this._p15.eval(0, 0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_whole(name); if (v !== null) return v; }
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    { const v = this._p2.probe_whole(name); if (v !== null) return v; }
    { const v = this._p3.probe_whole(name); if (v !== null) return v; }
    { const v = this._p4.probe_whole(name); if (v !== null) return v; }
    { const v = this._p5.probe_whole(name); if (v !== null) return v; }
    { const v = this._p6.probe_whole(name); if (v !== null) return v; }
    { const v = this._p7.probe_whole(name); if (v !== null) return v; }
    { const v = this._p8.probe_whole(name); if (v !== null) return v; }
    { const v = this._p9.probe_whole(name); if (v !== null) return v; }
    { const v = this._p10.probe_whole(name); if (v !== null) return v; }
    { const v = this._p11.probe_whole(name); if (v !== null) return v; }
    { const v = this._p12.probe_whole(name); if (v !== null) return v; }
    { const v = this._p13.probe_whole(name); if (v !== null) return v; }
    { const v = this._p14.probe_whole(name); if (v !== null) return v; }
    { const v = this._p15.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Mux (MuxChip)
    if (name === "Mux") {
      return this._p0.eval(0, 0, 0)["out"];
    }
    // part 1: Mux (MuxChip)
    if (name === "Mux") {
      return this._p1.eval(0, 0, 0)["out"];
    }
    // part 2: Mux (MuxChip)
    if (name === "Mux") {
      return this._p2.eval(0, 0, 0)["out"];
    }
    // part 3: Mux (MuxChip)
    if (name === "Mux") {
      return this._p3.eval(0, 0, 0)["out"];
    }
    // part 4: Mux (MuxChip)
    if (name === "Mux") {
      return this._p4.eval(0, 0, 0)["out"];
    }
    // part 5: Mux (MuxChip)
    if (name === "Mux") {
      return this._p5.eval(0, 0, 0)["out"];
    }
    // part 6: Mux (MuxChip)
    if (name === "Mux") {
      return this._p6.eval(0, 0, 0)["out"];
    }
    // part 7: Mux (MuxChip)
    if (name === "Mux") {
      return this._p7.eval(0, 0, 0)["out"];
    }
    // part 8: Mux (MuxChip)
    if (name === "Mux") {
      return this._p8.eval(0, 0, 0)["out"];
    }
    // part 9: Mux (MuxChip)
    if (name === "Mux") {
      return this._p9.eval(0, 0, 0)["out"];
    }
    // part 10: Mux (MuxChip)
    if (name === "Mux") {
      return this._p10.eval(0, 0, 0)["out"];
    }
    // part 11: Mux (MuxChip)
    if (name === "Mux") {
      return this._p11.eval(0, 0, 0)["out"];
    }
    // part 12: Mux (MuxChip)
    if (name === "Mux") {
      return this._p12.eval(0, 0, 0)["out"];
    }
    // part 13: Mux (MuxChip)
    if (name === "Mux") {
      return this._p13.eval(0, 0, 0)["out"];
    }
    // part 14: Mux (MuxChip)
    if (name === "Mux") {
      return this._p14.eval(0, 0, 0)["out"];
    }
    // part 15: Mux (MuxChip)
    if (name === "Mux") {
      return this._p15.eval(0, 0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p2.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p3.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p4.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p5.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p6.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p7.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p8.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p9.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p10.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p11.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p12.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p13.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p14.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p15.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p0.set_whole(name, val)) return true;
    if (this._p1.set_whole(name, val)) return true;
    if (this._p2.set_whole(name, val)) return true;
    if (this._p3.set_whole(name, val)) return true;
    if (this._p4.set_whole(name, val)) return true;
    if (this._p5.set_whole(name, val)) return true;
    if (this._p6.set_whole(name, val)) return true;
    if (this._p7.set_whole(name, val)) return true;
    if (this._p8.set_whole(name, val)) return true;
    if (this._p9.set_whole(name, val)) return true;
    if (this._p10.set_whole(name, val)) return true;
    if (this._p11.set_whole(name, val)) return true;
    if (this._p12.set_whole(name, val)) return true;
    if (this._p13.set_whole(name, val)) return true;
    if (this._p14.set_whole(name, val)) return true;
    if (this._p15.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 1: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 2: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 3: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 4: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 5: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 6: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 7: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 8: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 9: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 10: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 11: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 12: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 13: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 14: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // part 15: Mux (MuxChip)
    if (name === "Mux") {
      return false;
    }
    // 遞迴 user parts
    if (this._p0.set_probe(name, i, val)) return true;
    if (this._p1.set_probe(name, i, val)) return true;
    if (this._p2.set_probe(name, i, val)) return true;
    if (this._p3.set_probe(name, i, val)) return true;
    if (this._p4.set_probe(name, i, val)) return true;
    if (this._p5.set_probe(name, i, val)) return true;
    if (this._p6.set_probe(name, i, val)) return true;
    if (this._p7.set_probe(name, i, val)) return true;
    if (this._p8.set_probe(name, i, val)) return true;
    if (this._p9.set_probe(name, i, val)) return true;
    if (this._p10.set_probe(name, i, val)) return true;
    if (this._p11.set_probe(name, i, val)) return true;
    if (this._p12.set_probe(name, i, val)) return true;
    if (this._p13.set_probe(name, i, val)) return true;
    if (this._p14.set_probe(name, i, val)) return true;
    if (this._p15.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p0.load_program(p)) return true;
    if (this._p1.load_program(p)) return true;
    if (this._p2.load_program(p)) return true;
    if (this._p3.load_program(p)) return true;
    if (this._p4.load_program(p)) return true;
    if (this._p5.load_program(p)) return true;
    if (this._p6.load_program(p)) return true;
    if (this._p7.load_program(p)) return true;
    if (this._p8.load_program(p)) return true;
    if (this._p9.load_program(p)) return true;
    if (this._p10.load_program(p)) return true;
    if (this._p11.load_program(p)) return true;
    if (this._p12.load_program(p)) return true;
    if (this._p13.load_program(p)) return true;
    if (this._p14.load_program(p)) return true;
    if (this._p15.load_program(p)) return true;
    return false;
  }
}

// ---- Not16 ----
class Not16Chip {
  constructor() {
    this._p0 = new NotChip();
    this._p1 = new NotChip();
    this._p2 = new NotChip();
    this._p3 = new NotChip();
    this._p4 = new NotChip();
    this._p5 = new NotChip();
    this._p6 = new NotChip();
    this._p7 = new NotChip();
    this._p8 = new NotChip();
    this._p9 = new NotChip();
    this._p10 = new NotChip();
    this._p11 = new NotChip();
    this._p12 = new NotChip();
    this._p13 = new NotChip();
    this._p14 = new NotChip();
    this._p15 = new NotChip();
  }
  eval(in_) {
    let w_out = 0;
    { // part 0: Not (NotChip)
      let __i0 = ((in_ >> 15) & 0x1);
      const __o = this._p0.eval(__i0);
      w_out = setBits(w_out, 15, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Not (NotChip)
      let __i0 = ((in_ >> 14) & 0x1);
      const __o = this._p1.eval(__i0);
      w_out = setBits(w_out, 14, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: Not (NotChip)
      let __i0 = ((in_ >> 13) & 0x1);
      const __o = this._p2.eval(__i0);
      w_out = setBits(w_out, 13, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: Not (NotChip)
      let __i0 = ((in_ >> 12) & 0x1);
      const __o = this._p3.eval(__i0);
      w_out = setBits(w_out, 12, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: Not (NotChip)
      let __i0 = ((in_ >> 11) & 0x1);
      const __o = this._p4.eval(__i0);
      w_out = setBits(w_out, 11, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: Not (NotChip)
      let __i0 = ((in_ >> 10) & 0x1);
      const __o = this._p5.eval(__i0);
      w_out = setBits(w_out, 10, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: Not (NotChip)
      let __i0 = ((in_ >> 9) & 0x1);
      const __o = this._p6.eval(__i0);
      w_out = setBits(w_out, 9, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 7: Not (NotChip)
      let __i0 = ((in_ >> 8) & 0x1);
      const __o = this._p7.eval(__i0);
      w_out = setBits(w_out, 8, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 8: Not (NotChip)
      let __i0 = ((in_ >> 7) & 0x1);
      const __o = this._p8.eval(__i0);
      w_out = setBits(w_out, 7, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 9: Not (NotChip)
      let __i0 = ((in_ >> 6) & 0x1);
      const __o = this._p9.eval(__i0);
      w_out = setBits(w_out, 6, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 10: Not (NotChip)
      let __i0 = ((in_ >> 5) & 0x1);
      const __o = this._p10.eval(__i0);
      w_out = setBits(w_out, 5, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 11: Not (NotChip)
      let __i0 = ((in_ >> 4) & 0x1);
      const __o = this._p11.eval(__i0);
      w_out = setBits(w_out, 4, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 12: Not (NotChip)
      let __i0 = ((in_ >> 3) & 0x1);
      const __o = this._p12.eval(__i0);
      w_out = setBits(w_out, 3, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 13: Not (NotChip)
      let __i0 = ((in_ >> 2) & 0x1);
      const __o = this._p13.eval(__i0);
      w_out = setBits(w_out, 2, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 14: Not (NotChip)
      let __i0 = ((in_ >> 1) & 0x1);
      const __o = this._p14.eval(__i0);
      w_out = setBits(w_out, 1, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 15: Not (NotChip)
      let __i0 = ((in_ >> 0) & 0x1);
      const __o = this._p15.eval(__i0);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(in_) {
    let w_out = 0;
    { // part 0: Not (NotChip)
      let __i0 = ((in_ >> 15) & 0x1);
      const __o = this._p0.eval(__i0);
      w_out = setBits(w_out, 15, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Not (NotChip)
      let __i0 = ((in_ >> 14) & 0x1);
      const __o = this._p1.eval(__i0);
      w_out = setBits(w_out, 14, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: Not (NotChip)
      let __i0 = ((in_ >> 13) & 0x1);
      const __o = this._p2.eval(__i0);
      w_out = setBits(w_out, 13, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: Not (NotChip)
      let __i0 = ((in_ >> 12) & 0x1);
      const __o = this._p3.eval(__i0);
      w_out = setBits(w_out, 12, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: Not (NotChip)
      let __i0 = ((in_ >> 11) & 0x1);
      const __o = this._p4.eval(__i0);
      w_out = setBits(w_out, 11, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: Not (NotChip)
      let __i0 = ((in_ >> 10) & 0x1);
      const __o = this._p5.eval(__i0);
      w_out = setBits(w_out, 10, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: Not (NotChip)
      let __i0 = ((in_ >> 9) & 0x1);
      const __o = this._p6.eval(__i0);
      w_out = setBits(w_out, 9, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 7: Not (NotChip)
      let __i0 = ((in_ >> 8) & 0x1);
      const __o = this._p7.eval(__i0);
      w_out = setBits(w_out, 8, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 8: Not (NotChip)
      let __i0 = ((in_ >> 7) & 0x1);
      const __o = this._p8.eval(__i0);
      w_out = setBits(w_out, 7, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 9: Not (NotChip)
      let __i0 = ((in_ >> 6) & 0x1);
      const __o = this._p9.eval(__i0);
      w_out = setBits(w_out, 6, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 10: Not (NotChip)
      let __i0 = ((in_ >> 5) & 0x1);
      const __o = this._p10.eval(__i0);
      w_out = setBits(w_out, 5, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 11: Not (NotChip)
      let __i0 = ((in_ >> 4) & 0x1);
      const __o = this._p11.eval(__i0);
      w_out = setBits(w_out, 4, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 12: Not (NotChip)
      let __i0 = ((in_ >> 3) & 0x1);
      const __o = this._p12.eval(__i0);
      w_out = setBits(w_out, 3, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 13: Not (NotChip)
      let __i0 = ((in_ >> 2) & 0x1);
      const __o = this._p13.eval(__i0);
      w_out = setBits(w_out, 2, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 14: Not (NotChip)
      let __i0 = ((in_ >> 1) & 0x1);
      const __o = this._p14.eval(__i0);
      w_out = setBits(w_out, 1, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 15: Not (NotChip)
      let __i0 = ((in_ >> 0) & 0x1);
      const __o = this._p15.eval(__i0);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
    this._p3.tock();
    this._p4.tock();
    this._p5.tock();
    this._p6.tock();
    this._p7.tock();
    this._p8.tock();
    this._p9.tock();
    this._p10.tock();
    this._p11.tock();
    this._p12.tock();
    this._p13.tock();
    this._p14.tock();
    this._p15.tock();
  }
  probe_whole(name) {
    // part 0: Not (NotChip)
    if (name === "Not") {
      return this._p0.eval(0)["out"];
    }
    // part 1: Not (NotChip)
    if (name === "Not") {
      return this._p1.eval(0)["out"];
    }
    // part 2: Not (NotChip)
    if (name === "Not") {
      return this._p2.eval(0)["out"];
    }
    // part 3: Not (NotChip)
    if (name === "Not") {
      return this._p3.eval(0)["out"];
    }
    // part 4: Not (NotChip)
    if (name === "Not") {
      return this._p4.eval(0)["out"];
    }
    // part 5: Not (NotChip)
    if (name === "Not") {
      return this._p5.eval(0)["out"];
    }
    // part 6: Not (NotChip)
    if (name === "Not") {
      return this._p6.eval(0)["out"];
    }
    // part 7: Not (NotChip)
    if (name === "Not") {
      return this._p7.eval(0)["out"];
    }
    // part 8: Not (NotChip)
    if (name === "Not") {
      return this._p8.eval(0)["out"];
    }
    // part 9: Not (NotChip)
    if (name === "Not") {
      return this._p9.eval(0)["out"];
    }
    // part 10: Not (NotChip)
    if (name === "Not") {
      return this._p10.eval(0)["out"];
    }
    // part 11: Not (NotChip)
    if (name === "Not") {
      return this._p11.eval(0)["out"];
    }
    // part 12: Not (NotChip)
    if (name === "Not") {
      return this._p12.eval(0)["out"];
    }
    // part 13: Not (NotChip)
    if (name === "Not") {
      return this._p13.eval(0)["out"];
    }
    // part 14: Not (NotChip)
    if (name === "Not") {
      return this._p14.eval(0)["out"];
    }
    // part 15: Not (NotChip)
    if (name === "Not") {
      return this._p15.eval(0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_whole(name); if (v !== null) return v; }
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    { const v = this._p2.probe_whole(name); if (v !== null) return v; }
    { const v = this._p3.probe_whole(name); if (v !== null) return v; }
    { const v = this._p4.probe_whole(name); if (v !== null) return v; }
    { const v = this._p5.probe_whole(name); if (v !== null) return v; }
    { const v = this._p6.probe_whole(name); if (v !== null) return v; }
    { const v = this._p7.probe_whole(name); if (v !== null) return v; }
    { const v = this._p8.probe_whole(name); if (v !== null) return v; }
    { const v = this._p9.probe_whole(name); if (v !== null) return v; }
    { const v = this._p10.probe_whole(name); if (v !== null) return v; }
    { const v = this._p11.probe_whole(name); if (v !== null) return v; }
    { const v = this._p12.probe_whole(name); if (v !== null) return v; }
    { const v = this._p13.probe_whole(name); if (v !== null) return v; }
    { const v = this._p14.probe_whole(name); if (v !== null) return v; }
    { const v = this._p15.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Not (NotChip)
    if (name === "Not") {
      return this._p0.eval(0)["out"];
    }
    // part 1: Not (NotChip)
    if (name === "Not") {
      return this._p1.eval(0)["out"];
    }
    // part 2: Not (NotChip)
    if (name === "Not") {
      return this._p2.eval(0)["out"];
    }
    // part 3: Not (NotChip)
    if (name === "Not") {
      return this._p3.eval(0)["out"];
    }
    // part 4: Not (NotChip)
    if (name === "Not") {
      return this._p4.eval(0)["out"];
    }
    // part 5: Not (NotChip)
    if (name === "Not") {
      return this._p5.eval(0)["out"];
    }
    // part 6: Not (NotChip)
    if (name === "Not") {
      return this._p6.eval(0)["out"];
    }
    // part 7: Not (NotChip)
    if (name === "Not") {
      return this._p7.eval(0)["out"];
    }
    // part 8: Not (NotChip)
    if (name === "Not") {
      return this._p8.eval(0)["out"];
    }
    // part 9: Not (NotChip)
    if (name === "Not") {
      return this._p9.eval(0)["out"];
    }
    // part 10: Not (NotChip)
    if (name === "Not") {
      return this._p10.eval(0)["out"];
    }
    // part 11: Not (NotChip)
    if (name === "Not") {
      return this._p11.eval(0)["out"];
    }
    // part 12: Not (NotChip)
    if (name === "Not") {
      return this._p12.eval(0)["out"];
    }
    // part 13: Not (NotChip)
    if (name === "Not") {
      return this._p13.eval(0)["out"];
    }
    // part 14: Not (NotChip)
    if (name === "Not") {
      return this._p14.eval(0)["out"];
    }
    // part 15: Not (NotChip)
    if (name === "Not") {
      return this._p15.eval(0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p2.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p3.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p4.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p5.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p6.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p7.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p8.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p9.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p10.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p11.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p12.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p13.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p14.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p15.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p0.set_whole(name, val)) return true;
    if (this._p1.set_whole(name, val)) return true;
    if (this._p2.set_whole(name, val)) return true;
    if (this._p3.set_whole(name, val)) return true;
    if (this._p4.set_whole(name, val)) return true;
    if (this._p5.set_whole(name, val)) return true;
    if (this._p6.set_whole(name, val)) return true;
    if (this._p7.set_whole(name, val)) return true;
    if (this._p8.set_whole(name, val)) return true;
    if (this._p9.set_whole(name, val)) return true;
    if (this._p10.set_whole(name, val)) return true;
    if (this._p11.set_whole(name, val)) return true;
    if (this._p12.set_whole(name, val)) return true;
    if (this._p13.set_whole(name, val)) return true;
    if (this._p14.set_whole(name, val)) return true;
    if (this._p15.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 1: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 2: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 3: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 4: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 5: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 6: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 7: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 8: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 9: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 10: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 11: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 12: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 13: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 14: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // part 15: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // 遞迴 user parts
    if (this._p0.set_probe(name, i, val)) return true;
    if (this._p1.set_probe(name, i, val)) return true;
    if (this._p2.set_probe(name, i, val)) return true;
    if (this._p3.set_probe(name, i, val)) return true;
    if (this._p4.set_probe(name, i, val)) return true;
    if (this._p5.set_probe(name, i, val)) return true;
    if (this._p6.set_probe(name, i, val)) return true;
    if (this._p7.set_probe(name, i, val)) return true;
    if (this._p8.set_probe(name, i, val)) return true;
    if (this._p9.set_probe(name, i, val)) return true;
    if (this._p10.set_probe(name, i, val)) return true;
    if (this._p11.set_probe(name, i, val)) return true;
    if (this._p12.set_probe(name, i, val)) return true;
    if (this._p13.set_probe(name, i, val)) return true;
    if (this._p14.set_probe(name, i, val)) return true;
    if (this._p15.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p0.load_program(p)) return true;
    if (this._p1.load_program(p)) return true;
    if (this._p2.load_program(p)) return true;
    if (this._p3.load_program(p)) return true;
    if (this._p4.load_program(p)) return true;
    if (this._p5.load_program(p)) return true;
    if (this._p6.load_program(p)) return true;
    if (this._p7.load_program(p)) return true;
    if (this._p8.load_program(p)) return true;
    if (this._p9.load_program(p)) return true;
    if (this._p10.load_program(p)) return true;
    if (this._p11.load_program(p)) return true;
    if (this._p12.load_program(p)) return true;
    if (this._p13.load_program(p)) return true;
    if (this._p14.load_program(p)) return true;
    if (this._p15.load_program(p)) return true;
    return false;
  }
}

// ---- Xor ----
class XorChip {
  constructor() {
    this._p0 = new NandChip();
    this._p1 = new OrChip();
    this._p2 = new AndChip();
  }
  eval(a, b) {
    let w_AnandB = 0;
    let w_AorB = 0;
    let w_out = 0;
    { // part 0: Nand (NandChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_AnandB = setBits(w_AnandB, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Or (OrChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p1.eval(__i0, __i1);
      w_AorB = setBits(w_AorB, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: And (AndChip)
      let __i0 = w_AnandB;
      let __i1 = w_AorB;
      const __o = this._p2.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(a, b) {
    let w_AnandB = 0;
    let w_AorB = 0;
    let w_out = 0;
    { // part 0: Nand (NandChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_AnandB = setBits(w_AnandB, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Or (OrChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p1.eval(__i0, __i1);
      w_AorB = setBits(w_AorB, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: And (AndChip)
      let __i0 = w_AnandB;
      let __i1 = w_AorB;
      const __o = this._p2.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
  }
  probe_whole(name) {
    // part 0: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // part 1: Or (OrChip)
    if (name === "Or") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return this._p2.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    { const v = this._p2.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Nand (NandChip)
    if (name === "Nand") {
      return null;
    }
    // part 1: Or (OrChip)
    if (name === "Or") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return this._p2.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p2.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p1.set_whole(name, val)) return true;
    if (this._p2.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Nand (NandChip)
    if (name === "Nand") {
      return false;
    }
    // part 1: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return false;
    }
    // 遞迴 user parts
    if (this._p1.set_probe(name, i, val)) return true;
    if (this._p2.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p1.load_program(p)) return true;
    if (this._p2.load_program(p)) return true;
    return false;
  }
}

// ---- FullAdder ----
class FullAdderChip {
  constructor() {
    this._p0 = new XorChip();
    this._p1 = new XorChip();
    this._p2 = new AndChip();
    this._p3 = new AndChip();
    this._p4 = new AndChip();
    this._p5 = new OrChip();
    this._p6 = new OrChip();
  }
  eval(a, b, c) {
    let w_s1 = 0;
    let w_sum = 0;
    let w_ab = 0;
    let w_bc = 0;
    let w_ac = 0;
    let w_abORbc = 0;
    let w_carry = 0;
    { // part 0: Xor (XorChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_s1 = setBits(w_s1, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: And (AndChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p2.eval(__i0, __i1);
      w_ab = setBits(w_ab, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: And (AndChip)
      let __i0 = ((b >> 0) & 0x1);
      let __i1 = ((c >> 0) & 0x1);
      const __o = this._p3.eval(__i0, __i1);
      w_bc = setBits(w_bc, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: And (AndChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((c >> 0) & 0x1);
      const __o = this._p4.eval(__i0, __i1);
      w_ac = setBits(w_ac, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Xor (XorChip)
      let __i0 = w_s1;
      let __i1 = ((c >> 0) & 0x1);
      const __o = this._p1.eval(__i0, __i1);
      w_sum = setBits(w_sum, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: Or (OrChip)
      let __i0 = w_ab;
      let __i1 = w_bc;
      const __o = this._p5.eval(__i0, __i1);
      w_abORbc = setBits(w_abORbc, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: Or (OrChip)
      let __i0 = w_abORbc;
      let __i1 = w_ac;
      const __o = this._p6.eval(__i0, __i1);
      w_carry = setBits(w_carry, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      sum: w_sum,
      carry: w_carry,
    };
  }
  sample(a, b, c) {
    let w_s1 = 0;
    let w_sum = 0;
    let w_ab = 0;
    let w_bc = 0;
    let w_ac = 0;
    let w_abORbc = 0;
    let w_carry = 0;
    { // part 0: Xor (XorChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_s1 = setBits(w_s1, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: And (AndChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p2.eval(__i0, __i1);
      w_ab = setBits(w_ab, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: And (AndChip)
      let __i0 = ((b >> 0) & 0x1);
      let __i1 = ((c >> 0) & 0x1);
      const __o = this._p3.eval(__i0, __i1);
      w_bc = setBits(w_bc, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: And (AndChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((c >> 0) & 0x1);
      const __o = this._p4.eval(__i0, __i1);
      w_ac = setBits(w_ac, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Xor (XorChip)
      let __i0 = w_s1;
      let __i1 = ((c >> 0) & 0x1);
      const __o = this._p1.eval(__i0, __i1);
      w_sum = setBits(w_sum, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: Or (OrChip)
      let __i0 = w_ab;
      let __i1 = w_bc;
      const __o = this._p5.eval(__i0, __i1);
      w_abORbc = setBits(w_abORbc, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: Or (OrChip)
      let __i0 = w_abORbc;
      let __i1 = w_ac;
      const __o = this._p6.eval(__i0, __i1);
      w_carry = setBits(w_carry, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
    this._p3.tock();
    this._p4.tock();
    this._p5.tock();
    this._p6.tock();
  }
  probe_whole(name) {
    // part 0: Xor (XorChip)
    if (name === "Xor") {
      return this._p0.eval(0, 0)["out"];
    }
    // part 1: Xor (XorChip)
    if (name === "Xor") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return this._p2.eval(0, 0)["out"];
    }
    // part 3: And (AndChip)
    if (name === "And") {
      return this._p3.eval(0, 0)["out"];
    }
    // part 4: And (AndChip)
    if (name === "And") {
      return this._p4.eval(0, 0)["out"];
    }
    // part 5: Or (OrChip)
    if (name === "Or") {
      return this._p5.eval(0, 0)["out"];
    }
    // part 6: Or (OrChip)
    if (name === "Or") {
      return this._p6.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_whole(name); if (v !== null) return v; }
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    { const v = this._p2.probe_whole(name); if (v !== null) return v; }
    { const v = this._p3.probe_whole(name); if (v !== null) return v; }
    { const v = this._p4.probe_whole(name); if (v !== null) return v; }
    { const v = this._p5.probe_whole(name); if (v !== null) return v; }
    { const v = this._p6.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Xor (XorChip)
    if (name === "Xor") {
      return this._p0.eval(0, 0)["out"];
    }
    // part 1: Xor (XorChip)
    if (name === "Xor") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return this._p2.eval(0, 0)["out"];
    }
    // part 3: And (AndChip)
    if (name === "And") {
      return this._p3.eval(0, 0)["out"];
    }
    // part 4: And (AndChip)
    if (name === "And") {
      return this._p4.eval(0, 0)["out"];
    }
    // part 5: Or (OrChip)
    if (name === "Or") {
      return this._p5.eval(0, 0)["out"];
    }
    // part 6: Or (OrChip)
    if (name === "Or") {
      return this._p6.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p2.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p3.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p4.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p5.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p6.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p0.set_whole(name, val)) return true;
    if (this._p1.set_whole(name, val)) return true;
    if (this._p2.set_whole(name, val)) return true;
    if (this._p3.set_whole(name, val)) return true;
    if (this._p4.set_whole(name, val)) return true;
    if (this._p5.set_whole(name, val)) return true;
    if (this._p6.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Xor (XorChip)
    if (name === "Xor") {
      return false;
    }
    // part 1: Xor (XorChip)
    if (name === "Xor") {
      return false;
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 3: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 4: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 5: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // part 6: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // 遞迴 user parts
    if (this._p0.set_probe(name, i, val)) return true;
    if (this._p1.set_probe(name, i, val)) return true;
    if (this._p2.set_probe(name, i, val)) return true;
    if (this._p3.set_probe(name, i, val)) return true;
    if (this._p4.set_probe(name, i, val)) return true;
    if (this._p5.set_probe(name, i, val)) return true;
    if (this._p6.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p0.load_program(p)) return true;
    if (this._p1.load_program(p)) return true;
    if (this._p2.load_program(p)) return true;
    if (this._p3.load_program(p)) return true;
    if (this._p4.load_program(p)) return true;
    if (this._p5.load_program(p)) return true;
    if (this._p6.load_program(p)) return true;
    return false;
  }
}

// ---- Add16 ----
class Add16Chip {
  constructor() {
    this._p0 = new FullAdderChip();
    this._p1 = new FullAdderChip();
    this._p2 = new FullAdderChip();
    this._p3 = new FullAdderChip();
    this._p4 = new FullAdderChip();
    this._p5 = new FullAdderChip();
    this._p6 = new FullAdderChip();
    this._p7 = new FullAdderChip();
    this._p8 = new FullAdderChip();
    this._p9 = new FullAdderChip();
    this._p10 = new FullAdderChip();
    this._p11 = new FullAdderChip();
    this._p12 = new FullAdderChip();
    this._p13 = new FullAdderChip();
    this._p14 = new FullAdderChip();
    this._p15 = new FullAdderChip();
  }
  eval(a, b) {
    let w_out = 0;
    let w_c0 = 0;
    let w_c1 = 0;
    let w_c2 = 0;
    let w_c3 = 0;
    let w_c4 = 0;
    let w_c5 = 0;
    let w_c6 = 0;
    let w_c7 = 0;
    let w_c8 = 0;
    let w_c9 = 0;
    let w_c10 = 0;
    let w_c11 = 0;
    let w_c12 = 0;
    let w_c13 = 0;
    let w_c14 = 0;
    let w_c15 = 0;
    { // part 0: FullAdder (FullAdderChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      let __i2 = 0x0;
      const __o = this._p0.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 0, 1, ((__o.sum >> 0) & 0x1));
      w_c0 = setBits(w_c0, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 1: FullAdder (FullAdderChip)
      let __i0 = ((a >> 1) & 0x1);
      let __i1 = ((b >> 1) & 0x1);
      let __i2 = w_c0;
      const __o = this._p1.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 1, 1, ((__o.sum >> 0) & 0x1));
      w_c1 = setBits(w_c1, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 2: FullAdder (FullAdderChip)
      let __i0 = ((a >> 2) & 0x1);
      let __i1 = ((b >> 2) & 0x1);
      let __i2 = w_c1;
      const __o = this._p2.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 2, 1, ((__o.sum >> 0) & 0x1));
      w_c2 = setBits(w_c2, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 3: FullAdder (FullAdderChip)
      let __i0 = ((a >> 3) & 0x1);
      let __i1 = ((b >> 3) & 0x1);
      let __i2 = w_c2;
      const __o = this._p3.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 3, 1, ((__o.sum >> 0) & 0x1));
      w_c3 = setBits(w_c3, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 4: FullAdder (FullAdderChip)
      let __i0 = ((a >> 4) & 0x1);
      let __i1 = ((b >> 4) & 0x1);
      let __i2 = w_c3;
      const __o = this._p4.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 4, 1, ((__o.sum >> 0) & 0x1));
      w_c4 = setBits(w_c4, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 5: FullAdder (FullAdderChip)
      let __i0 = ((a >> 5) & 0x1);
      let __i1 = ((b >> 5) & 0x1);
      let __i2 = w_c4;
      const __o = this._p5.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 5, 1, ((__o.sum >> 0) & 0x1));
      w_c5 = setBits(w_c5, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 6: FullAdder (FullAdderChip)
      let __i0 = ((a >> 6) & 0x1);
      let __i1 = ((b >> 6) & 0x1);
      let __i2 = w_c5;
      const __o = this._p6.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 6, 1, ((__o.sum >> 0) & 0x1));
      w_c6 = setBits(w_c6, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 7: FullAdder (FullAdderChip)
      let __i0 = ((a >> 7) & 0x1);
      let __i1 = ((b >> 7) & 0x1);
      let __i2 = w_c6;
      const __o = this._p7.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 7, 1, ((__o.sum >> 0) & 0x1));
      w_c7 = setBits(w_c7, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 8: FullAdder (FullAdderChip)
      let __i0 = ((a >> 8) & 0x1);
      let __i1 = ((b >> 8) & 0x1);
      let __i2 = w_c7;
      const __o = this._p8.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 8, 1, ((__o.sum >> 0) & 0x1));
      w_c8 = setBits(w_c8, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 9: FullAdder (FullAdderChip)
      let __i0 = ((a >> 9) & 0x1);
      let __i1 = ((b >> 9) & 0x1);
      let __i2 = w_c8;
      const __o = this._p9.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 9, 1, ((__o.sum >> 0) & 0x1));
      w_c9 = setBits(w_c9, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 10: FullAdder (FullAdderChip)
      let __i0 = ((a >> 10) & 0x1);
      let __i1 = ((b >> 10) & 0x1);
      let __i2 = w_c9;
      const __o = this._p10.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 10, 1, ((__o.sum >> 0) & 0x1));
      w_c10 = setBits(w_c10, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 11: FullAdder (FullAdderChip)
      let __i0 = ((a >> 11) & 0x1);
      let __i1 = ((b >> 11) & 0x1);
      let __i2 = w_c10;
      const __o = this._p11.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 11, 1, ((__o.sum >> 0) & 0x1));
      w_c11 = setBits(w_c11, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 12: FullAdder (FullAdderChip)
      let __i0 = ((a >> 12) & 0x1);
      let __i1 = ((b >> 12) & 0x1);
      let __i2 = w_c11;
      const __o = this._p12.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 12, 1, ((__o.sum >> 0) & 0x1));
      w_c12 = setBits(w_c12, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 13: FullAdder (FullAdderChip)
      let __i0 = ((a >> 13) & 0x1);
      let __i1 = ((b >> 13) & 0x1);
      let __i2 = w_c12;
      const __o = this._p13.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 13, 1, ((__o.sum >> 0) & 0x1));
      w_c13 = setBits(w_c13, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 14: FullAdder (FullAdderChip)
      let __i0 = ((a >> 14) & 0x1);
      let __i1 = ((b >> 14) & 0x1);
      let __i2 = w_c13;
      const __o = this._p14.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 14, 1, ((__o.sum >> 0) & 0x1));
      w_c14 = setBits(w_c14, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 15: FullAdder (FullAdderChip)
      let __i0 = ((a >> 15) & 0x1);
      let __i1 = ((b >> 15) & 0x1);
      let __i2 = w_c14;
      const __o = this._p15.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 15, 1, ((__o.sum >> 0) & 0x1));
      w_c15 = setBits(w_c15, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(a, b) {
    let w_out = 0;
    let w_c0 = 0;
    let w_c1 = 0;
    let w_c2 = 0;
    let w_c3 = 0;
    let w_c4 = 0;
    let w_c5 = 0;
    let w_c6 = 0;
    let w_c7 = 0;
    let w_c8 = 0;
    let w_c9 = 0;
    let w_c10 = 0;
    let w_c11 = 0;
    let w_c12 = 0;
    let w_c13 = 0;
    let w_c14 = 0;
    let w_c15 = 0;
    { // part 0: FullAdder (FullAdderChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      let __i2 = 0x0;
      const __o = this._p0.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 0, 1, ((__o.sum >> 0) & 0x1));
      w_c0 = setBits(w_c0, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 1: FullAdder (FullAdderChip)
      let __i0 = ((a >> 1) & 0x1);
      let __i1 = ((b >> 1) & 0x1);
      let __i2 = w_c0;
      const __o = this._p1.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 1, 1, ((__o.sum >> 0) & 0x1));
      w_c1 = setBits(w_c1, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 2: FullAdder (FullAdderChip)
      let __i0 = ((a >> 2) & 0x1);
      let __i1 = ((b >> 2) & 0x1);
      let __i2 = w_c1;
      const __o = this._p2.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 2, 1, ((__o.sum >> 0) & 0x1));
      w_c2 = setBits(w_c2, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 3: FullAdder (FullAdderChip)
      let __i0 = ((a >> 3) & 0x1);
      let __i1 = ((b >> 3) & 0x1);
      let __i2 = w_c2;
      const __o = this._p3.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 3, 1, ((__o.sum >> 0) & 0x1));
      w_c3 = setBits(w_c3, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 4: FullAdder (FullAdderChip)
      let __i0 = ((a >> 4) & 0x1);
      let __i1 = ((b >> 4) & 0x1);
      let __i2 = w_c3;
      const __o = this._p4.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 4, 1, ((__o.sum >> 0) & 0x1));
      w_c4 = setBits(w_c4, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 5: FullAdder (FullAdderChip)
      let __i0 = ((a >> 5) & 0x1);
      let __i1 = ((b >> 5) & 0x1);
      let __i2 = w_c4;
      const __o = this._p5.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 5, 1, ((__o.sum >> 0) & 0x1));
      w_c5 = setBits(w_c5, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 6: FullAdder (FullAdderChip)
      let __i0 = ((a >> 6) & 0x1);
      let __i1 = ((b >> 6) & 0x1);
      let __i2 = w_c5;
      const __o = this._p6.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 6, 1, ((__o.sum >> 0) & 0x1));
      w_c6 = setBits(w_c6, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 7: FullAdder (FullAdderChip)
      let __i0 = ((a >> 7) & 0x1);
      let __i1 = ((b >> 7) & 0x1);
      let __i2 = w_c6;
      const __o = this._p7.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 7, 1, ((__o.sum >> 0) & 0x1));
      w_c7 = setBits(w_c7, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 8: FullAdder (FullAdderChip)
      let __i0 = ((a >> 8) & 0x1);
      let __i1 = ((b >> 8) & 0x1);
      let __i2 = w_c7;
      const __o = this._p8.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 8, 1, ((__o.sum >> 0) & 0x1));
      w_c8 = setBits(w_c8, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 9: FullAdder (FullAdderChip)
      let __i0 = ((a >> 9) & 0x1);
      let __i1 = ((b >> 9) & 0x1);
      let __i2 = w_c8;
      const __o = this._p9.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 9, 1, ((__o.sum >> 0) & 0x1));
      w_c9 = setBits(w_c9, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 10: FullAdder (FullAdderChip)
      let __i0 = ((a >> 10) & 0x1);
      let __i1 = ((b >> 10) & 0x1);
      let __i2 = w_c9;
      const __o = this._p10.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 10, 1, ((__o.sum >> 0) & 0x1));
      w_c10 = setBits(w_c10, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 11: FullAdder (FullAdderChip)
      let __i0 = ((a >> 11) & 0x1);
      let __i1 = ((b >> 11) & 0x1);
      let __i2 = w_c10;
      const __o = this._p11.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 11, 1, ((__o.sum >> 0) & 0x1));
      w_c11 = setBits(w_c11, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 12: FullAdder (FullAdderChip)
      let __i0 = ((a >> 12) & 0x1);
      let __i1 = ((b >> 12) & 0x1);
      let __i2 = w_c11;
      const __o = this._p12.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 12, 1, ((__o.sum >> 0) & 0x1));
      w_c12 = setBits(w_c12, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 13: FullAdder (FullAdderChip)
      let __i0 = ((a >> 13) & 0x1);
      let __i1 = ((b >> 13) & 0x1);
      let __i2 = w_c12;
      const __o = this._p13.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 13, 1, ((__o.sum >> 0) & 0x1));
      w_c13 = setBits(w_c13, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 14: FullAdder (FullAdderChip)
      let __i0 = ((a >> 14) & 0x1);
      let __i1 = ((b >> 14) & 0x1);
      let __i2 = w_c13;
      const __o = this._p14.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 14, 1, ((__o.sum >> 0) & 0x1));
      w_c14 = setBits(w_c14, 0, 1, ((__o.carry >> 0) & 0x1));
    }
    { // part 15: FullAdder (FullAdderChip)
      let __i0 = ((a >> 15) & 0x1);
      let __i1 = ((b >> 15) & 0x1);
      let __i2 = w_c14;
      const __o = this._p15.eval(__i0, __i1, __i2);
      w_out = setBits(w_out, 15, 1, ((__o.sum >> 0) & 0x1));
      w_c15 = setBits(w_c15, 0, 1, ((__o.carry >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
    this._p3.tock();
    this._p4.tock();
    this._p5.tock();
    this._p6.tock();
    this._p7.tock();
    this._p8.tock();
    this._p9.tock();
    this._p10.tock();
    this._p11.tock();
    this._p12.tock();
    this._p13.tock();
    this._p14.tock();
    this._p15.tock();
  }
  probe_whole(name) {
    // part 0: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p0.eval(0, 0, 0)["sum"];
    }
    // part 1: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p1.eval(0, 0, 0)["sum"];
    }
    // part 2: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p2.eval(0, 0, 0)["sum"];
    }
    // part 3: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p3.eval(0, 0, 0)["sum"];
    }
    // part 4: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p4.eval(0, 0, 0)["sum"];
    }
    // part 5: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p5.eval(0, 0, 0)["sum"];
    }
    // part 6: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p6.eval(0, 0, 0)["sum"];
    }
    // part 7: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p7.eval(0, 0, 0)["sum"];
    }
    // part 8: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p8.eval(0, 0, 0)["sum"];
    }
    // part 9: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p9.eval(0, 0, 0)["sum"];
    }
    // part 10: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p10.eval(0, 0, 0)["sum"];
    }
    // part 11: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p11.eval(0, 0, 0)["sum"];
    }
    // part 12: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p12.eval(0, 0, 0)["sum"];
    }
    // part 13: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p13.eval(0, 0, 0)["sum"];
    }
    // part 14: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p14.eval(0, 0, 0)["sum"];
    }
    // part 15: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p15.eval(0, 0, 0)["sum"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_whole(name); if (v !== null) return v; }
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    { const v = this._p2.probe_whole(name); if (v !== null) return v; }
    { const v = this._p3.probe_whole(name); if (v !== null) return v; }
    { const v = this._p4.probe_whole(name); if (v !== null) return v; }
    { const v = this._p5.probe_whole(name); if (v !== null) return v; }
    { const v = this._p6.probe_whole(name); if (v !== null) return v; }
    { const v = this._p7.probe_whole(name); if (v !== null) return v; }
    { const v = this._p8.probe_whole(name); if (v !== null) return v; }
    { const v = this._p9.probe_whole(name); if (v !== null) return v; }
    { const v = this._p10.probe_whole(name); if (v !== null) return v; }
    { const v = this._p11.probe_whole(name); if (v !== null) return v; }
    { const v = this._p12.probe_whole(name); if (v !== null) return v; }
    { const v = this._p13.probe_whole(name); if (v !== null) return v; }
    { const v = this._p14.probe_whole(name); if (v !== null) return v; }
    { const v = this._p15.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p0.eval(0, 0, 0)["sum"];
    }
    // part 1: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p1.eval(0, 0, 0)["sum"];
    }
    // part 2: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p2.eval(0, 0, 0)["sum"];
    }
    // part 3: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p3.eval(0, 0, 0)["sum"];
    }
    // part 4: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p4.eval(0, 0, 0)["sum"];
    }
    // part 5: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p5.eval(0, 0, 0)["sum"];
    }
    // part 6: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p6.eval(0, 0, 0)["sum"];
    }
    // part 7: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p7.eval(0, 0, 0)["sum"];
    }
    // part 8: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p8.eval(0, 0, 0)["sum"];
    }
    // part 9: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p9.eval(0, 0, 0)["sum"];
    }
    // part 10: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p10.eval(0, 0, 0)["sum"];
    }
    // part 11: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p11.eval(0, 0, 0)["sum"];
    }
    // part 12: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p12.eval(0, 0, 0)["sum"];
    }
    // part 13: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p13.eval(0, 0, 0)["sum"];
    }
    // part 14: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p14.eval(0, 0, 0)["sum"];
    }
    // part 15: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return this._p15.eval(0, 0, 0)["sum"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p2.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p3.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p4.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p5.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p6.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p7.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p8.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p9.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p10.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p11.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p12.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p13.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p14.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p15.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p0.set_whole(name, val)) return true;
    if (this._p1.set_whole(name, val)) return true;
    if (this._p2.set_whole(name, val)) return true;
    if (this._p3.set_whole(name, val)) return true;
    if (this._p4.set_whole(name, val)) return true;
    if (this._p5.set_whole(name, val)) return true;
    if (this._p6.set_whole(name, val)) return true;
    if (this._p7.set_whole(name, val)) return true;
    if (this._p8.set_whole(name, val)) return true;
    if (this._p9.set_whole(name, val)) return true;
    if (this._p10.set_whole(name, val)) return true;
    if (this._p11.set_whole(name, val)) return true;
    if (this._p12.set_whole(name, val)) return true;
    if (this._p13.set_whole(name, val)) return true;
    if (this._p14.set_whole(name, val)) return true;
    if (this._p15.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 1: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 2: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 3: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 4: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 5: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 6: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 7: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 8: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 9: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 10: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 11: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 12: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 13: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 14: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // part 15: FullAdder (FullAdderChip)
    if (name === "FullAdder") {
      return false;
    }
    // 遞迴 user parts
    if (this._p0.set_probe(name, i, val)) return true;
    if (this._p1.set_probe(name, i, val)) return true;
    if (this._p2.set_probe(name, i, val)) return true;
    if (this._p3.set_probe(name, i, val)) return true;
    if (this._p4.set_probe(name, i, val)) return true;
    if (this._p5.set_probe(name, i, val)) return true;
    if (this._p6.set_probe(name, i, val)) return true;
    if (this._p7.set_probe(name, i, val)) return true;
    if (this._p8.set_probe(name, i, val)) return true;
    if (this._p9.set_probe(name, i, val)) return true;
    if (this._p10.set_probe(name, i, val)) return true;
    if (this._p11.set_probe(name, i, val)) return true;
    if (this._p12.set_probe(name, i, val)) return true;
    if (this._p13.set_probe(name, i, val)) return true;
    if (this._p14.set_probe(name, i, val)) return true;
    if (this._p15.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p0.load_program(p)) return true;
    if (this._p1.load_program(p)) return true;
    if (this._p2.load_program(p)) return true;
    if (this._p3.load_program(p)) return true;
    if (this._p4.load_program(p)) return true;
    if (this._p5.load_program(p)) return true;
    if (this._p6.load_program(p)) return true;
    if (this._p7.load_program(p)) return true;
    if (this._p8.load_program(p)) return true;
    if (this._p9.load_program(p)) return true;
    if (this._p10.load_program(p)) return true;
    if (this._p11.load_program(p)) return true;
    if (this._p12.load_program(p)) return true;
    if (this._p13.load_program(p)) return true;
    if (this._p14.load_program(p)) return true;
    if (this._p15.load_program(p)) return true;
    return false;
  }
}

// ---- And16 ----
class And16Chip {
  constructor() {
    this._p0 = new AndChip();
    this._p1 = new AndChip();
    this._p2 = new AndChip();
    this._p3 = new AndChip();
    this._p4 = new AndChip();
    this._p5 = new AndChip();
    this._p6 = new AndChip();
    this._p7 = new AndChip();
    this._p8 = new AndChip();
    this._p9 = new AndChip();
    this._p10 = new AndChip();
    this._p11 = new AndChip();
    this._p12 = new AndChip();
    this._p13 = new AndChip();
    this._p14 = new AndChip();
    this._p15 = new AndChip();
  }
  eval(a, b) {
    let w_out = 0;
    { // part 0: And (AndChip)
      let __i0 = ((a >> 15) & 0x1);
      let __i1 = ((b >> 15) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_out = setBits(w_out, 15, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: And (AndChip)
      let __i0 = ((a >> 14) & 0x1);
      let __i1 = ((b >> 14) & 0x1);
      const __o = this._p1.eval(__i0, __i1);
      w_out = setBits(w_out, 14, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: And (AndChip)
      let __i0 = ((a >> 13) & 0x1);
      let __i1 = ((b >> 13) & 0x1);
      const __o = this._p2.eval(__i0, __i1);
      w_out = setBits(w_out, 13, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: And (AndChip)
      let __i0 = ((a >> 12) & 0x1);
      let __i1 = ((b >> 12) & 0x1);
      const __o = this._p3.eval(__i0, __i1);
      w_out = setBits(w_out, 12, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: And (AndChip)
      let __i0 = ((a >> 11) & 0x1);
      let __i1 = ((b >> 11) & 0x1);
      const __o = this._p4.eval(__i0, __i1);
      w_out = setBits(w_out, 11, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: And (AndChip)
      let __i0 = ((a >> 10) & 0x1);
      let __i1 = ((b >> 10) & 0x1);
      const __o = this._p5.eval(__i0, __i1);
      w_out = setBits(w_out, 10, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: And (AndChip)
      let __i0 = ((a >> 9) & 0x1);
      let __i1 = ((b >> 9) & 0x1);
      const __o = this._p6.eval(__i0, __i1);
      w_out = setBits(w_out, 9, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 7: And (AndChip)
      let __i0 = ((a >> 8) & 0x1);
      let __i1 = ((b >> 8) & 0x1);
      const __o = this._p7.eval(__i0, __i1);
      w_out = setBits(w_out, 8, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 8: And (AndChip)
      let __i0 = ((a >> 7) & 0x1);
      let __i1 = ((b >> 7) & 0x1);
      const __o = this._p8.eval(__i0, __i1);
      w_out = setBits(w_out, 7, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 9: And (AndChip)
      let __i0 = ((a >> 6) & 0x1);
      let __i1 = ((b >> 6) & 0x1);
      const __o = this._p9.eval(__i0, __i1);
      w_out = setBits(w_out, 6, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 10: And (AndChip)
      let __i0 = ((a >> 5) & 0x1);
      let __i1 = ((b >> 5) & 0x1);
      const __o = this._p10.eval(__i0, __i1);
      w_out = setBits(w_out, 5, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 11: And (AndChip)
      let __i0 = ((a >> 4) & 0x1);
      let __i1 = ((b >> 4) & 0x1);
      const __o = this._p11.eval(__i0, __i1);
      w_out = setBits(w_out, 4, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 12: And (AndChip)
      let __i0 = ((a >> 3) & 0x1);
      let __i1 = ((b >> 3) & 0x1);
      const __o = this._p12.eval(__i0, __i1);
      w_out = setBits(w_out, 3, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 13: And (AndChip)
      let __i0 = ((a >> 2) & 0x1);
      let __i1 = ((b >> 2) & 0x1);
      const __o = this._p13.eval(__i0, __i1);
      w_out = setBits(w_out, 2, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 14: And (AndChip)
      let __i0 = ((a >> 1) & 0x1);
      let __i1 = ((b >> 1) & 0x1);
      const __o = this._p14.eval(__i0, __i1);
      w_out = setBits(w_out, 1, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 15: And (AndChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p15.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(a, b) {
    let w_out = 0;
    { // part 0: And (AndChip)
      let __i0 = ((a >> 15) & 0x1);
      let __i1 = ((b >> 15) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_out = setBits(w_out, 15, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: And (AndChip)
      let __i0 = ((a >> 14) & 0x1);
      let __i1 = ((b >> 14) & 0x1);
      const __o = this._p1.eval(__i0, __i1);
      w_out = setBits(w_out, 14, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: And (AndChip)
      let __i0 = ((a >> 13) & 0x1);
      let __i1 = ((b >> 13) & 0x1);
      const __o = this._p2.eval(__i0, __i1);
      w_out = setBits(w_out, 13, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: And (AndChip)
      let __i0 = ((a >> 12) & 0x1);
      let __i1 = ((b >> 12) & 0x1);
      const __o = this._p3.eval(__i0, __i1);
      w_out = setBits(w_out, 12, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: And (AndChip)
      let __i0 = ((a >> 11) & 0x1);
      let __i1 = ((b >> 11) & 0x1);
      const __o = this._p4.eval(__i0, __i1);
      w_out = setBits(w_out, 11, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: And (AndChip)
      let __i0 = ((a >> 10) & 0x1);
      let __i1 = ((b >> 10) & 0x1);
      const __o = this._p5.eval(__i0, __i1);
      w_out = setBits(w_out, 10, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: And (AndChip)
      let __i0 = ((a >> 9) & 0x1);
      let __i1 = ((b >> 9) & 0x1);
      const __o = this._p6.eval(__i0, __i1);
      w_out = setBits(w_out, 9, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 7: And (AndChip)
      let __i0 = ((a >> 8) & 0x1);
      let __i1 = ((b >> 8) & 0x1);
      const __o = this._p7.eval(__i0, __i1);
      w_out = setBits(w_out, 8, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 8: And (AndChip)
      let __i0 = ((a >> 7) & 0x1);
      let __i1 = ((b >> 7) & 0x1);
      const __o = this._p8.eval(__i0, __i1);
      w_out = setBits(w_out, 7, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 9: And (AndChip)
      let __i0 = ((a >> 6) & 0x1);
      let __i1 = ((b >> 6) & 0x1);
      const __o = this._p9.eval(__i0, __i1);
      w_out = setBits(w_out, 6, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 10: And (AndChip)
      let __i0 = ((a >> 5) & 0x1);
      let __i1 = ((b >> 5) & 0x1);
      const __o = this._p10.eval(__i0, __i1);
      w_out = setBits(w_out, 5, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 11: And (AndChip)
      let __i0 = ((a >> 4) & 0x1);
      let __i1 = ((b >> 4) & 0x1);
      const __o = this._p11.eval(__i0, __i1);
      w_out = setBits(w_out, 4, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 12: And (AndChip)
      let __i0 = ((a >> 3) & 0x1);
      let __i1 = ((b >> 3) & 0x1);
      const __o = this._p12.eval(__i0, __i1);
      w_out = setBits(w_out, 3, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 13: And (AndChip)
      let __i0 = ((a >> 2) & 0x1);
      let __i1 = ((b >> 2) & 0x1);
      const __o = this._p13.eval(__i0, __i1);
      w_out = setBits(w_out, 2, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 14: And (AndChip)
      let __i0 = ((a >> 1) & 0x1);
      let __i1 = ((b >> 1) & 0x1);
      const __o = this._p14.eval(__i0, __i1);
      w_out = setBits(w_out, 1, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 15: And (AndChip)
      let __i0 = ((a >> 0) & 0x1);
      let __i1 = ((b >> 0) & 0x1);
      const __o = this._p15.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
    this._p3.tock();
    this._p4.tock();
    this._p5.tock();
    this._p6.tock();
    this._p7.tock();
    this._p8.tock();
    this._p9.tock();
    this._p10.tock();
    this._p11.tock();
    this._p12.tock();
    this._p13.tock();
    this._p14.tock();
    this._p15.tock();
  }
  probe_whole(name) {
    // part 0: And (AndChip)
    if (name === "And") {
      return this._p0.eval(0, 0)["out"];
    }
    // part 1: And (AndChip)
    if (name === "And") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return this._p2.eval(0, 0)["out"];
    }
    // part 3: And (AndChip)
    if (name === "And") {
      return this._p3.eval(0, 0)["out"];
    }
    // part 4: And (AndChip)
    if (name === "And") {
      return this._p4.eval(0, 0)["out"];
    }
    // part 5: And (AndChip)
    if (name === "And") {
      return this._p5.eval(0, 0)["out"];
    }
    // part 6: And (AndChip)
    if (name === "And") {
      return this._p6.eval(0, 0)["out"];
    }
    // part 7: And (AndChip)
    if (name === "And") {
      return this._p7.eval(0, 0)["out"];
    }
    // part 8: And (AndChip)
    if (name === "And") {
      return this._p8.eval(0, 0)["out"];
    }
    // part 9: And (AndChip)
    if (name === "And") {
      return this._p9.eval(0, 0)["out"];
    }
    // part 10: And (AndChip)
    if (name === "And") {
      return this._p10.eval(0, 0)["out"];
    }
    // part 11: And (AndChip)
    if (name === "And") {
      return this._p11.eval(0, 0)["out"];
    }
    // part 12: And (AndChip)
    if (name === "And") {
      return this._p12.eval(0, 0)["out"];
    }
    // part 13: And (AndChip)
    if (name === "And") {
      return this._p13.eval(0, 0)["out"];
    }
    // part 14: And (AndChip)
    if (name === "And") {
      return this._p14.eval(0, 0)["out"];
    }
    // part 15: And (AndChip)
    if (name === "And") {
      return this._p15.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_whole(name); if (v !== null) return v; }
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    { const v = this._p2.probe_whole(name); if (v !== null) return v; }
    { const v = this._p3.probe_whole(name); if (v !== null) return v; }
    { const v = this._p4.probe_whole(name); if (v !== null) return v; }
    { const v = this._p5.probe_whole(name); if (v !== null) return v; }
    { const v = this._p6.probe_whole(name); if (v !== null) return v; }
    { const v = this._p7.probe_whole(name); if (v !== null) return v; }
    { const v = this._p8.probe_whole(name); if (v !== null) return v; }
    { const v = this._p9.probe_whole(name); if (v !== null) return v; }
    { const v = this._p10.probe_whole(name); if (v !== null) return v; }
    { const v = this._p11.probe_whole(name); if (v !== null) return v; }
    { const v = this._p12.probe_whole(name); if (v !== null) return v; }
    { const v = this._p13.probe_whole(name); if (v !== null) return v; }
    { const v = this._p14.probe_whole(name); if (v !== null) return v; }
    { const v = this._p15.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: And (AndChip)
    if (name === "And") {
      return this._p0.eval(0, 0)["out"];
    }
    // part 1: And (AndChip)
    if (name === "And") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return this._p2.eval(0, 0)["out"];
    }
    // part 3: And (AndChip)
    if (name === "And") {
      return this._p3.eval(0, 0)["out"];
    }
    // part 4: And (AndChip)
    if (name === "And") {
      return this._p4.eval(0, 0)["out"];
    }
    // part 5: And (AndChip)
    if (name === "And") {
      return this._p5.eval(0, 0)["out"];
    }
    // part 6: And (AndChip)
    if (name === "And") {
      return this._p6.eval(0, 0)["out"];
    }
    // part 7: And (AndChip)
    if (name === "And") {
      return this._p7.eval(0, 0)["out"];
    }
    // part 8: And (AndChip)
    if (name === "And") {
      return this._p8.eval(0, 0)["out"];
    }
    // part 9: And (AndChip)
    if (name === "And") {
      return this._p9.eval(0, 0)["out"];
    }
    // part 10: And (AndChip)
    if (name === "And") {
      return this._p10.eval(0, 0)["out"];
    }
    // part 11: And (AndChip)
    if (name === "And") {
      return this._p11.eval(0, 0)["out"];
    }
    // part 12: And (AndChip)
    if (name === "And") {
      return this._p12.eval(0, 0)["out"];
    }
    // part 13: And (AndChip)
    if (name === "And") {
      return this._p13.eval(0, 0)["out"];
    }
    // part 14: And (AndChip)
    if (name === "And") {
      return this._p14.eval(0, 0)["out"];
    }
    // part 15: And (AndChip)
    if (name === "And") {
      return this._p15.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p2.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p3.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p4.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p5.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p6.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p7.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p8.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p9.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p10.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p11.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p12.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p13.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p14.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p15.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p0.set_whole(name, val)) return true;
    if (this._p1.set_whole(name, val)) return true;
    if (this._p2.set_whole(name, val)) return true;
    if (this._p3.set_whole(name, val)) return true;
    if (this._p4.set_whole(name, val)) return true;
    if (this._p5.set_whole(name, val)) return true;
    if (this._p6.set_whole(name, val)) return true;
    if (this._p7.set_whole(name, val)) return true;
    if (this._p8.set_whole(name, val)) return true;
    if (this._p9.set_whole(name, val)) return true;
    if (this._p10.set_whole(name, val)) return true;
    if (this._p11.set_whole(name, val)) return true;
    if (this._p12.set_whole(name, val)) return true;
    if (this._p13.set_whole(name, val)) return true;
    if (this._p14.set_whole(name, val)) return true;
    if (this._p15.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 1: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 2: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 3: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 4: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 5: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 6: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 7: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 8: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 9: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 10: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 11: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 12: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 13: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 14: And (AndChip)
    if (name === "And") {
      return false;
    }
    // part 15: And (AndChip)
    if (name === "And") {
      return false;
    }
    // 遞迴 user parts
    if (this._p0.set_probe(name, i, val)) return true;
    if (this._p1.set_probe(name, i, val)) return true;
    if (this._p2.set_probe(name, i, val)) return true;
    if (this._p3.set_probe(name, i, val)) return true;
    if (this._p4.set_probe(name, i, val)) return true;
    if (this._p5.set_probe(name, i, val)) return true;
    if (this._p6.set_probe(name, i, val)) return true;
    if (this._p7.set_probe(name, i, val)) return true;
    if (this._p8.set_probe(name, i, val)) return true;
    if (this._p9.set_probe(name, i, val)) return true;
    if (this._p10.set_probe(name, i, val)) return true;
    if (this._p11.set_probe(name, i, val)) return true;
    if (this._p12.set_probe(name, i, val)) return true;
    if (this._p13.set_probe(name, i, val)) return true;
    if (this._p14.set_probe(name, i, val)) return true;
    if (this._p15.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p0.load_program(p)) return true;
    if (this._p1.load_program(p)) return true;
    if (this._p2.load_program(p)) return true;
    if (this._p3.load_program(p)) return true;
    if (this._p4.load_program(p)) return true;
    if (this._p5.load_program(p)) return true;
    if (this._p6.load_program(p)) return true;
    if (this._p7.load_program(p)) return true;
    if (this._p8.load_program(p)) return true;
    if (this._p9.load_program(p)) return true;
    if (this._p10.load_program(p)) return true;
    if (this._p11.load_program(p)) return true;
    if (this._p12.load_program(p)) return true;
    if (this._p13.load_program(p)) return true;
    if (this._p14.load_program(p)) return true;
    if (this._p15.load_program(p)) return true;
    return false;
  }
}

// ---- Or8Way ----
class Or8WayChip {
  constructor() {
    this._p0 = new OrChip();
    this._p1 = new OrChip();
    this._p2 = new OrChip();
    this._p3 = new OrChip();
    this._p4 = new OrChip();
    this._p5 = new OrChip();
    this._p6 = new OrChip();
  }
  eval(in_) {
    let w_or76 = 0;
    let w_or54 = 0;
    let w_or32 = 0;
    let w_or10 = 0;
    let w_or74 = 0;
    let w_or30 = 0;
    let w_out = 0;
    { // part 0: Or (OrChip)
      let __i0 = ((in_ >> 7) & 0x1);
      let __i1 = ((in_ >> 6) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_or76 = setBits(w_or76, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Or (OrChip)
      let __i0 = ((in_ >> 5) & 0x1);
      let __i1 = ((in_ >> 4) & 0x1);
      const __o = this._p1.eval(__i0, __i1);
      w_or54 = setBits(w_or54, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: Or (OrChip)
      let __i0 = ((in_ >> 3) & 0x1);
      let __i1 = ((in_ >> 2) & 0x1);
      const __o = this._p2.eval(__i0, __i1);
      w_or32 = setBits(w_or32, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: Or (OrChip)
      let __i0 = ((in_ >> 1) & 0x1);
      let __i1 = ((in_ >> 0) & 0x1);
      const __o = this._p3.eval(__i0, __i1);
      w_or10 = setBits(w_or10, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: Or (OrChip)
      let __i0 = w_or76;
      let __i1 = w_or54;
      const __o = this._p4.eval(__i0, __i1);
      w_or74 = setBits(w_or74, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: Or (OrChip)
      let __i0 = w_or32;
      let __i1 = w_or10;
      const __o = this._p5.eval(__i0, __i1);
      w_or30 = setBits(w_or30, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: Or (OrChip)
      let __i0 = w_or74;
      let __i1 = w_or30;
      const __o = this._p6.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
    };
  }
  sample(in_) {
    let w_or76 = 0;
    let w_or54 = 0;
    let w_or32 = 0;
    let w_or10 = 0;
    let w_or74 = 0;
    let w_or30 = 0;
    let w_out = 0;
    { // part 0: Or (OrChip)
      let __i0 = ((in_ >> 7) & 0x1);
      let __i1 = ((in_ >> 6) & 0x1);
      const __o = this._p0.eval(__i0, __i1);
      w_or76 = setBits(w_or76, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 1: Or (OrChip)
      let __i0 = ((in_ >> 5) & 0x1);
      let __i1 = ((in_ >> 4) & 0x1);
      const __o = this._p1.eval(__i0, __i1);
      w_or54 = setBits(w_or54, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 2: Or (OrChip)
      let __i0 = ((in_ >> 3) & 0x1);
      let __i1 = ((in_ >> 2) & 0x1);
      const __o = this._p2.eval(__i0, __i1);
      w_or32 = setBits(w_or32, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 3: Or (OrChip)
      let __i0 = ((in_ >> 1) & 0x1);
      let __i1 = ((in_ >> 0) & 0x1);
      const __o = this._p3.eval(__i0, __i1);
      w_or10 = setBits(w_or10, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 4: Or (OrChip)
      let __i0 = w_or76;
      let __i1 = w_or54;
      const __o = this._p4.eval(__i0, __i1);
      w_or74 = setBits(w_or74, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 5: Or (OrChip)
      let __i0 = w_or32;
      let __i1 = w_or10;
      const __o = this._p5.eval(__i0, __i1);
      w_or30 = setBits(w_or30, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 6: Or (OrChip)
      let __i0 = w_or74;
      let __i1 = w_or30;
      const __o = this._p6.eval(__i0, __i1);
      w_out = setBits(w_out, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
    this._p3.tock();
    this._p4.tock();
    this._p5.tock();
    this._p6.tock();
  }
  probe_whole(name) {
    // part 0: Or (OrChip)
    if (name === "Or") {
      return this._p0.eval(0, 0)["out"];
    }
    // part 1: Or (OrChip)
    if (name === "Or") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: Or (OrChip)
    if (name === "Or") {
      return this._p2.eval(0, 0)["out"];
    }
    // part 3: Or (OrChip)
    if (name === "Or") {
      return this._p3.eval(0, 0)["out"];
    }
    // part 4: Or (OrChip)
    if (name === "Or") {
      return this._p4.eval(0, 0)["out"];
    }
    // part 5: Or (OrChip)
    if (name === "Or") {
      return this._p5.eval(0, 0)["out"];
    }
    // part 6: Or (OrChip)
    if (name === "Or") {
      return this._p6.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_whole(name); if (v !== null) return v; }
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    { const v = this._p2.probe_whole(name); if (v !== null) return v; }
    { const v = this._p3.probe_whole(name); if (v !== null) return v; }
    { const v = this._p4.probe_whole(name); if (v !== null) return v; }
    { const v = this._p5.probe_whole(name); if (v !== null) return v; }
    { const v = this._p6.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Or (OrChip)
    if (name === "Or") {
      return this._p0.eval(0, 0)["out"];
    }
    // part 1: Or (OrChip)
    if (name === "Or") {
      return this._p1.eval(0, 0)["out"];
    }
    // part 2: Or (OrChip)
    if (name === "Or") {
      return this._p2.eval(0, 0)["out"];
    }
    // part 3: Or (OrChip)
    if (name === "Or") {
      return this._p3.eval(0, 0)["out"];
    }
    // part 4: Or (OrChip)
    if (name === "Or") {
      return this._p4.eval(0, 0)["out"];
    }
    // part 5: Or (OrChip)
    if (name === "Or") {
      return this._p5.eval(0, 0)["out"];
    }
    // part 6: Or (OrChip)
    if (name === "Or") {
      return this._p6.eval(0, 0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p2.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p3.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p4.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p5.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p6.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p0.set_whole(name, val)) return true;
    if (this._p1.set_whole(name, val)) return true;
    if (this._p2.set_whole(name, val)) return true;
    if (this._p3.set_whole(name, val)) return true;
    if (this._p4.set_whole(name, val)) return true;
    if (this._p5.set_whole(name, val)) return true;
    if (this._p6.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // part 1: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // part 2: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // part 3: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // part 4: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // part 5: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // part 6: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // 遞迴 user parts
    if (this._p0.set_probe(name, i, val)) return true;
    if (this._p1.set_probe(name, i, val)) return true;
    if (this._p2.set_probe(name, i, val)) return true;
    if (this._p3.set_probe(name, i, val)) return true;
    if (this._p4.set_probe(name, i, val)) return true;
    if (this._p5.set_probe(name, i, val)) return true;
    if (this._p6.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p0.load_program(p)) return true;
    if (this._p1.load_program(p)) return true;
    if (this._p2.load_program(p)) return true;
    if (this._p3.load_program(p)) return true;
    if (this._p4.load_program(p)) return true;
    if (this._p5.load_program(p)) return true;
    if (this._p6.load_program(p)) return true;
    return false;
  }
}

// ---- ALU ----
class ALUChip {
  constructor() {
    this._p0 = new Mux16Chip();
    this._p1 = new Not16Chip();
    this._p2 = new Mux16Chip();
    this._p3 = new Mux16Chip();
    this._p4 = new Not16Chip();
    this._p5 = new Mux16Chip();
    this._p6 = new Add16Chip();
    this._p7 = new And16Chip();
    this._p8 = new Mux16Chip();
    this._p9 = new Not16Chip();
    this._p10 = new Mux16Chip();
    this._p11 = new Or8WayChip();
    this._p12 = new Or8WayChip();
    this._p13 = new OrChip();
    this._p14 = new NotChip();
  }
  eval(x, y, zx, nx, zy, ny, f, no) {
    let w_x1 = 0;
    let w_notx1 = 0;
    let w_x2 = 0;
    let w_y1 = 0;
    let w_noty1 = 0;
    let w_y2 = 0;
    let w_addxy = 0;
    let w_andxy = 0;
    let w_o1 = 0;
    let w_noto1 = 0;
    let w_o2 = 0;
    let w_out = 0;
    let w_outLow = 0;
    let w_outHigh = 0;
    let w_ng = 0;
    let w_orLow = 0;
    let w_orHigh = 0;
    let w_notzr = 0;
    let w_zr = 0;
    { // part 0: Mux16 (Mux16Chip)
      let __i0 = x;
      let __i1 = 0x0;
      let __i2 = ((zx >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1, __i2);
      w_x1 = setBits(w_x1, 0, 16, __o.out);
    }
    { // part 3: Mux16 (Mux16Chip)
      let __i0 = y;
      let __i1 = 0x0;
      let __i2 = ((zy >> 0) & 0x1);
      const __o = this._p3.eval(__i0, __i1, __i2);
      w_y1 = setBits(w_y1, 0, 16, __o.out);
    }
    { // part 1: Not16 (Not16Chip)
      let __i0 = w_x1;
      const __o = this._p1.eval(__i0);
      w_notx1 = setBits(w_notx1, 0, 16, __o.out);
    }
    { // part 4: Not16 (Not16Chip)
      let __i0 = w_y1;
      const __o = this._p4.eval(__i0);
      w_noty1 = setBits(w_noty1, 0, 16, __o.out);
    }
    { // part 2: Mux16 (Mux16Chip)
      let __i0 = w_x1;
      let __i1 = w_notx1;
      let __i2 = ((nx >> 0) & 0x1);
      const __o = this._p2.eval(__i0, __i1, __i2);
      w_x2 = setBits(w_x2, 0, 16, __o.out);
    }
    { // part 5: Mux16 (Mux16Chip)
      let __i0 = w_y1;
      let __i1 = w_noty1;
      let __i2 = ((ny >> 0) & 0x1);
      const __o = this._p5.eval(__i0, __i1, __i2);
      w_y2 = setBits(w_y2, 0, 16, __o.out);
    }
    { // part 6: Add16 (Add16Chip)
      let __i0 = w_x2;
      let __i1 = w_y2;
      const __o = this._p6.eval(__i0, __i1);
      w_addxy = setBits(w_addxy, 0, 16, __o.out);
    }
    { // part 7: And16 (And16Chip)
      let __i0 = w_x2;
      let __i1 = w_y2;
      const __o = this._p7.eval(__i0, __i1);
      w_andxy = setBits(w_andxy, 0, 16, __o.out);
    }
    { // part 8: Mux16 (Mux16Chip)
      let __i0 = w_andxy;
      let __i1 = w_addxy;
      let __i2 = ((f >> 0) & 0x1);
      const __o = this._p8.eval(__i0, __i1, __i2);
      w_o1 = setBits(w_o1, 0, 16, __o.out);
    }
    { // part 9: Not16 (Not16Chip)
      let __i0 = w_o1;
      const __o = this._p9.eval(__i0);
      w_noto1 = setBits(w_noto1, 0, 16, __o.out);
    }
    { // part 10: Mux16 (Mux16Chip)
      let __i0 = w_o1;
      let __i1 = w_noto1;
      let __i2 = ((no >> 0) & 0x1);
      const __o = this._p10.eval(__i0, __i1, __i2);
      w_o2 = setBits(w_o2, 0, 16, __o.out);
      w_out = setBits(w_out, 0, 16, __o.out);
      w_outLow = setBits(w_outLow, 0, 8, ((__o.out >> 0) & 0xff));
      w_outHigh = setBits(w_outHigh, 0, 8, ((__o.out >> 8) & 0xff));
      w_ng = setBits(w_ng, 0, 1, ((__o.out >> 15) & 0x1));
    }
    { // part 11: Or8Way (Or8WayChip)
      let __i0 = w_outLow;
      const __o = this._p11.eval(__i0);
      w_orLow = setBits(w_orLow, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 12: Or8Way (Or8WayChip)
      let __i0 = w_outHigh;
      const __o = this._p12.eval(__i0);
      w_orHigh = setBits(w_orHigh, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 13: Or (OrChip)
      let __i0 = w_orLow;
      let __i1 = w_orHigh;
      const __o = this._p13.eval(__i0, __i1);
      w_notzr = setBits(w_notzr, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 14: Not (NotChip)
      let __i0 = w_notzr;
      const __o = this._p14.eval(__i0);
      w_zr = setBits(w_zr, 0, 1, ((__o.out >> 0) & 0x1));
    }
    return {
      out: w_out,
      zr: w_zr,
      ng: w_ng,
    };
  }
  sample(x, y, zx, nx, zy, ny, f, no) {
    let w_x1 = 0;
    let w_notx1 = 0;
    let w_x2 = 0;
    let w_y1 = 0;
    let w_noty1 = 0;
    let w_y2 = 0;
    let w_addxy = 0;
    let w_andxy = 0;
    let w_o1 = 0;
    let w_noto1 = 0;
    let w_o2 = 0;
    let w_out = 0;
    let w_outLow = 0;
    let w_outHigh = 0;
    let w_ng = 0;
    let w_orLow = 0;
    let w_orHigh = 0;
    let w_notzr = 0;
    let w_zr = 0;
    { // part 0: Mux16 (Mux16Chip)
      let __i0 = x;
      let __i1 = 0x0;
      let __i2 = ((zx >> 0) & 0x1);
      const __o = this._p0.eval(__i0, __i1, __i2);
      w_x1 = setBits(w_x1, 0, 16, __o.out);
    }
    { // part 3: Mux16 (Mux16Chip)
      let __i0 = y;
      let __i1 = 0x0;
      let __i2 = ((zy >> 0) & 0x1);
      const __o = this._p3.eval(__i0, __i1, __i2);
      w_y1 = setBits(w_y1, 0, 16, __o.out);
    }
    { // part 1: Not16 (Not16Chip)
      let __i0 = w_x1;
      const __o = this._p1.eval(__i0);
      w_notx1 = setBits(w_notx1, 0, 16, __o.out);
    }
    { // part 4: Not16 (Not16Chip)
      let __i0 = w_y1;
      const __o = this._p4.eval(__i0);
      w_noty1 = setBits(w_noty1, 0, 16, __o.out);
    }
    { // part 2: Mux16 (Mux16Chip)
      let __i0 = w_x1;
      let __i1 = w_notx1;
      let __i2 = ((nx >> 0) & 0x1);
      const __o = this._p2.eval(__i0, __i1, __i2);
      w_x2 = setBits(w_x2, 0, 16, __o.out);
    }
    { // part 5: Mux16 (Mux16Chip)
      let __i0 = w_y1;
      let __i1 = w_noty1;
      let __i2 = ((ny >> 0) & 0x1);
      const __o = this._p5.eval(__i0, __i1, __i2);
      w_y2 = setBits(w_y2, 0, 16, __o.out);
    }
    { // part 6: Add16 (Add16Chip)
      let __i0 = w_x2;
      let __i1 = w_y2;
      const __o = this._p6.eval(__i0, __i1);
      w_addxy = setBits(w_addxy, 0, 16, __o.out);
    }
    { // part 7: And16 (And16Chip)
      let __i0 = w_x2;
      let __i1 = w_y2;
      const __o = this._p7.eval(__i0, __i1);
      w_andxy = setBits(w_andxy, 0, 16, __o.out);
    }
    { // part 8: Mux16 (Mux16Chip)
      let __i0 = w_andxy;
      let __i1 = w_addxy;
      let __i2 = ((f >> 0) & 0x1);
      const __o = this._p8.eval(__i0, __i1, __i2);
      w_o1 = setBits(w_o1, 0, 16, __o.out);
    }
    { // part 9: Not16 (Not16Chip)
      let __i0 = w_o1;
      const __o = this._p9.eval(__i0);
      w_noto1 = setBits(w_noto1, 0, 16, __o.out);
    }
    { // part 10: Mux16 (Mux16Chip)
      let __i0 = w_o1;
      let __i1 = w_noto1;
      let __i2 = ((no >> 0) & 0x1);
      const __o = this._p10.eval(__i0, __i1, __i2);
      w_o2 = setBits(w_o2, 0, 16, __o.out);
      w_out = setBits(w_out, 0, 16, __o.out);
      w_outLow = setBits(w_outLow, 0, 8, ((__o.out >> 0) & 0xff));
      w_outHigh = setBits(w_outHigh, 0, 8, ((__o.out >> 8) & 0xff));
      w_ng = setBits(w_ng, 0, 1, ((__o.out >> 15) & 0x1));
    }
    { // part 11: Or8Way (Or8WayChip)
      let __i0 = w_outLow;
      const __o = this._p11.eval(__i0);
      w_orLow = setBits(w_orLow, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 12: Or8Way (Or8WayChip)
      let __i0 = w_outHigh;
      const __o = this._p12.eval(__i0);
      w_orHigh = setBits(w_orHigh, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 13: Or (OrChip)
      let __i0 = w_orLow;
      let __i1 = w_orHigh;
      const __o = this._p13.eval(__i0, __i1);
      w_notzr = setBits(w_notzr, 0, 1, ((__o.out >> 0) & 0x1));
    }
    { // part 14: Not (NotChip)
      let __i0 = w_notzr;
      const __o = this._p14.eval(__i0);
      w_zr = setBits(w_zr, 0, 1, ((__o.out >> 0) & 0x1));
    }
  }
  tock() {
    this._p0.tock();
    this._p1.tock();
    this._p2.tock();
    this._p3.tock();
    this._p4.tock();
    this._p5.tock();
    this._p6.tock();
    this._p7.tock();
    this._p8.tock();
    this._p9.tock();
    this._p10.tock();
    this._p11.tock();
    this._p12.tock();
    this._p13.tock();
    this._p14.tock();
  }
  probe_whole(name) {
    // part 0: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p0.eval(0, 0, 0)["out"];
    }
    // part 1: Not16 (Not16Chip)
    if (name === "Not16") {
      return this._p1.eval(0)["out"];
    }
    // part 2: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p2.eval(0, 0, 0)["out"];
    }
    // part 3: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p3.eval(0, 0, 0)["out"];
    }
    // part 4: Not16 (Not16Chip)
    if (name === "Not16") {
      return this._p4.eval(0)["out"];
    }
    // part 5: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p5.eval(0, 0, 0)["out"];
    }
    // part 6: Add16 (Add16Chip)
    if (name === "Add16") {
      return this._p6.eval(0, 0)["out"];
    }
    // part 7: And16 (And16Chip)
    if (name === "And16") {
      return this._p7.eval(0, 0)["out"];
    }
    // part 8: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p8.eval(0, 0, 0)["out"];
    }
    // part 9: Not16 (Not16Chip)
    if (name === "Not16") {
      return this._p9.eval(0)["out"];
    }
    // part 10: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p10.eval(0, 0, 0)["out"];
    }
    // part 11: Or8Way (Or8WayChip)
    if (name === "Or8Way") {
      return this._p11.eval(0)["out"];
    }
    // part 12: Or8Way (Or8WayChip)
    if (name === "Or8Way") {
      return this._p12.eval(0)["out"];
    }
    // part 13: Or (OrChip)
    if (name === "Or") {
      return this._p13.eval(0, 0)["out"];
    }
    // part 14: Not (NotChip)
    if (name === "Not") {
      return this._p14.eval(0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_whole(name); if (v !== null) return v; }
    { const v = this._p1.probe_whole(name); if (v !== null) return v; }
    { const v = this._p2.probe_whole(name); if (v !== null) return v; }
    { const v = this._p3.probe_whole(name); if (v !== null) return v; }
    { const v = this._p4.probe_whole(name); if (v !== null) return v; }
    { const v = this._p5.probe_whole(name); if (v !== null) return v; }
    { const v = this._p6.probe_whole(name); if (v !== null) return v; }
    { const v = this._p7.probe_whole(name); if (v !== null) return v; }
    { const v = this._p8.probe_whole(name); if (v !== null) return v; }
    { const v = this._p9.probe_whole(name); if (v !== null) return v; }
    { const v = this._p10.probe_whole(name); if (v !== null) return v; }
    { const v = this._p11.probe_whole(name); if (v !== null) return v; }
    { const v = this._p12.probe_whole(name); if (v !== null) return v; }
    { const v = this._p13.probe_whole(name); if (v !== null) return v; }
    { const v = this._p14.probe_whole(name); if (v !== null) return v; }
    return null;
  }
  probe_indexed(name, i) {
    // part 0: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p0.eval(0, 0, 0)["out"];
    }
    // part 1: Not16 (Not16Chip)
    if (name === "Not16") {
      return this._p1.eval(0)["out"];
    }
    // part 2: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p2.eval(0, 0, 0)["out"];
    }
    // part 3: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p3.eval(0, 0, 0)["out"];
    }
    // part 4: Not16 (Not16Chip)
    if (name === "Not16") {
      return this._p4.eval(0)["out"];
    }
    // part 5: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p5.eval(0, 0, 0)["out"];
    }
    // part 6: Add16 (Add16Chip)
    if (name === "Add16") {
      return this._p6.eval(0, 0)["out"];
    }
    // part 7: And16 (And16Chip)
    if (name === "And16") {
      return this._p7.eval(0, 0)["out"];
    }
    // part 8: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p8.eval(0, 0, 0)["out"];
    }
    // part 9: Not16 (Not16Chip)
    if (name === "Not16") {
      return this._p9.eval(0)["out"];
    }
    // part 10: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return this._p10.eval(0, 0, 0)["out"];
    }
    // part 11: Or8Way (Or8WayChip)
    if (name === "Or8Way") {
      return this._p11.eval(0)["out"];
    }
    // part 12: Or8Way (Or8WayChip)
    if (name === "Or8Way") {
      return this._p12.eval(0)["out"];
    }
    // part 13: Or (OrChip)
    if (name === "Or") {
      return this._p13.eval(0, 0)["out"];
    }
    // part 14: Not (NotChip)
    if (name === "Not") {
      return this._p14.eval(0)["out"];
    }
    // 遞迴 user parts
    { const v = this._p0.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p1.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p2.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p3.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p4.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p5.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p6.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p7.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p8.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p9.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p10.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p11.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p12.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p13.probe_indexed(name, i); if (v !== null) return v; }
    { const v = this._p14.probe_indexed(name, i); if (v !== null) return v; }
    return null;
  }
  set_whole(name, val) {
    // 遞迴 user parts
    if (this._p0.set_whole(name, val)) return true;
    if (this._p1.set_whole(name, val)) return true;
    if (this._p2.set_whole(name, val)) return true;
    if (this._p3.set_whole(name, val)) return true;
    if (this._p4.set_whole(name, val)) return true;
    if (this._p5.set_whole(name, val)) return true;
    if (this._p6.set_whole(name, val)) return true;
    if (this._p7.set_whole(name, val)) return true;
    if (this._p8.set_whole(name, val)) return true;
    if (this._p9.set_whole(name, val)) return true;
    if (this._p10.set_whole(name, val)) return true;
    if (this._p11.set_whole(name, val)) return true;
    if (this._p12.set_whole(name, val)) return true;
    if (this._p13.set_whole(name, val)) return true;
    if (this._p14.set_whole(name, val)) return true;
    return false;
  }
  set_probe(name, i, val) {
    // part 0: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return false;
    }
    // part 1: Not16 (Not16Chip)
    if (name === "Not16") {
      return false;
    }
    // part 2: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return false;
    }
    // part 3: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return false;
    }
    // part 4: Not16 (Not16Chip)
    if (name === "Not16") {
      return false;
    }
    // part 5: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return false;
    }
    // part 6: Add16 (Add16Chip)
    if (name === "Add16") {
      return false;
    }
    // part 7: And16 (And16Chip)
    if (name === "And16") {
      return false;
    }
    // part 8: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return false;
    }
    // part 9: Not16 (Not16Chip)
    if (name === "Not16") {
      return false;
    }
    // part 10: Mux16 (Mux16Chip)
    if (name === "Mux16") {
      return false;
    }
    // part 11: Or8Way (Or8WayChip)
    if (name === "Or8Way") {
      return false;
    }
    // part 12: Or8Way (Or8WayChip)
    if (name === "Or8Way") {
      return false;
    }
    // part 13: Or (OrChip)
    if (name === "Or") {
      return false;
    }
    // part 14: Not (NotChip)
    if (name === "Not") {
      return false;
    }
    // 遞迴 user parts
    if (this._p0.set_probe(name, i, val)) return true;
    if (this._p1.set_probe(name, i, val)) return true;
    if (this._p2.set_probe(name, i, val)) return true;
    if (this._p3.set_probe(name, i, val)) return true;
    if (this._p4.set_probe(name, i, val)) return true;
    if (this._p5.set_probe(name, i, val)) return true;
    if (this._p6.set_probe(name, i, val)) return true;
    if (this._p7.set_probe(name, i, val)) return true;
    if (this._p8.set_probe(name, i, val)) return true;
    if (this._p9.set_probe(name, i, val)) return true;
    if (this._p10.set_probe(name, i, val)) return true;
    if (this._p11.set_probe(name, i, val)) return true;
    if (this._p12.set_probe(name, i, val)) return true;
    if (this._p13.set_probe(name, i, val)) return true;
    if (this._p14.set_probe(name, i, val)) return true;
    return false;
  }
  load_program(p) {
    if (this._p0.load_program(p)) return true;
    if (this._p1.load_program(p)) return true;
    if (this._p2.load_program(p)) return true;
    if (this._p3.load_program(p)) return true;
    if (this._p4.load_program(p)) return true;
    if (this._p5.load_program(p)) return true;
    if (this._p6.load_program(p)) return true;
    if (this._p7.load_program(p)) return true;
    if (this._p8.load_program(p)) return true;
    if (this._p9.load_program(p)) return true;
    if (this._p10.load_program(p)) return true;
    if (this._p11.load_program(p)) return true;
    if (this._p12.load_program(p)) return true;
    if (this._p13.load_program(p)) return true;
    if (this._p14.load_program(p)) return true;
    return false;
  }
}

export { ALUChip };
