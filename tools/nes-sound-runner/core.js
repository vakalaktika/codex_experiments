// Loads and runs 6502 sound-engine source (xa/Nescom syntax) on an emulated
// NES CPU + audio chip. No dependencies; works in Node and in the browser.

// ---------------------------------------------------------------------------
// 6502 opcode table (official opcodes), shared by the assembler and the CPU.
// ---------------------------------------------------------------------------
const G1 = (b) => ({ imm: b + 9, zp: b + 5, zpx: b + 0x15, abs: b + 0xd, absx: b + 0x1d, absy: b + 0x19, indx: b + 1, indy: b + 0x11 });
const SH = (b) => ({ acc: b + 0xa, zp: b + 6, zpx: b + 0x16, abs: b + 0xe, absx: b + 0x1e });
const OPS = {
  ora: G1(0x00), and: G1(0x20), eor: G1(0x40), adc: G1(0x60), lda: G1(0xa0), cmp: G1(0xc0), sbc: G1(0xe0),
  sta: { zp: 0x85, zpx: 0x95, abs: 0x8d, absx: 0x9d, absy: 0x99, indx: 0x81, indy: 0x91 },
  asl: SH(0x00), rol: SH(0x20), lsr: SH(0x40), ror: SH(0x60),
  dec: { zp: 0xc6, zpx: 0xd6, abs: 0xce, absx: 0xde }, inc: { zp: 0xe6, zpx: 0xf6, abs: 0xee, absx: 0xfe },
  ldx: { imm: 0xa2, zp: 0xa6, zpy: 0xb6, abs: 0xae, absy: 0xbe },
  ldy: { imm: 0xa0, zp: 0xa4, zpx: 0xb4, abs: 0xac, absx: 0xbc },
  stx: { zp: 0x86, zpy: 0x96, abs: 0x8e }, sty: { zp: 0x84, zpx: 0x94, abs: 0x8c },
  cpx: { imm: 0xe0, zp: 0xe4, abs: 0xec }, cpy: { imm: 0xc0, zp: 0xc4, abs: 0xcc },
  bit: { zp: 0x24, abs: 0x2c }, jmp: { abs: 0x4c, ind: 0x6c }, jsr: { abs: 0x20 },
  bpl: { rel: 0x10 }, bmi: { rel: 0x30 }, bvc: { rel: 0x50 }, bvs: { rel: 0x70 },
  bcc: { rel: 0x90 }, bcs: { rel: 0xb0 }, bne: { rel: 0xd0 }, beq: { rel: 0xf0 },
};
for (const [m, op] of Object.entries({
  brk: 0x00, clc: 0x18, cld: 0xd8, cli: 0x58, clv: 0xb8, dex: 0xca, dey: 0x88, inx: 0xe8, iny: 0xc8, nop: 0xea,
  pha: 0x48, php: 0x08, pla: 0x68, plp: 0x28, rti: 0x40, rts: 0x60, sec: 0x38, sed: 0xf8, sei: 0x78,
  tax: 0xaa, tay: 0xa8, tsx: 0xba, txa: 0x8a, txs: 0x9a, tya: 0x98,
})) OPS[m] = { imp: op };
const MODE_SIZE = { imp: 1, acc: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, indx: 2, indy: 2, rel: 2, abs: 3, absx: 3, absy: 3, ind: 3 };

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------
function evalExpr(text, sym, anon) {
  const src = text.trim();
  if (/^[+-]+$/.test(src)) return anon(src); // anonymous label reference
  let i = 0;
  const ws = () => { while (src[i] === ' ' || src[i] === '\t') i++; };
  const primary = () => {
    ws();
    const c = src[i];
    if (c === '(') { i++; const v = bitor(); ws(); if (src[i++] !== ')') throw new Error(`missing ) in "${src}"`); return v; }
    if (c === '-') { i++; return -primary(); }
    if (c === '<') { i++; return primary() & 0xff; }
    if (c === '>') { i++; return (primary() >> 8) & 0xff; }
    let m;
    if ((m = /^\$([0-9A-Fa-f]+)/.exec(src.slice(i)))) { i += m[0].length; return parseInt(m[1], 16); }
    if ((m = /^[0-9]+/.exec(src.slice(i)))) { i += m[0].length; return parseInt(m[0], 10); }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)))) {
      i += m[0].length;
      const v = sym(m[0]);
      if (v === undefined) throw new UndefinedSymbol(m[0]);
      return v;
    }
    throw new Error(`cannot parse expression "${src}"`);
  };
  const mul = () => { let v = primary(); for (;;) { ws(); if (src[i] === '*') { i++; v *= primary(); } else if (src[i] === '/') { i++; v = Math.trunc(v / primary()); } else return v; } };
  const add = () => { let v = mul(); for (;;) { ws(); if (src[i] === '+') { i++; v += mul(); } else if (src[i] === '-') { i++; v -= mul(); } else return v; } };
  const band = () => { let v = add(); for (;;) { ws(); if (src[i] === '&') { i++; v &= add(); } else return v; } };
  function bitor() { let v = band(); for (;;) { ws(); if (src[i] === '|') { i++; v |= band(); } else return v; } }
  const v = bitor();
  ws();
  if (i !== src.length) throw new Error(`trailing junk in expression "${src}"`);
  return v;
}
class UndefinedSymbol extends Error {
  constructor(name) { super(`undefined symbol ${name}`); this.symbol = name; }
}

function parseOperand(mnem, operand) {
  const modes = OPS[mnem];
  let s = operand.trim();
  if (s === '' || /^a$/i.test(s)) return { mode: modes.acc !== undefined ? 'acc' : 'imp' };
  if (modes.rel !== undefined) return { mode: 'rel', expr: s };
  if (s[0] === '#') return { mode: 'imm', expr: s.slice(1) };
  let m;
  if ((m = /^\((.*)\)\s*,\s*y$/i.exec(s))) return { mode: 'indy', expr: m[1] };
  if ((m = /^\((.*),\s*x\s*\)$/i.exec(s))) return { mode: 'indx', expr: m[1] };
  if (mnem === 'jmp' && (m = /^\((.*)\)$/.exec(s))) return { mode: 'ind', expr: m[1] };
  let index = '';
  if ((m = /^(.*),\s*([xy])$/i.exec(s))) { s = m[1]; index = m[2].toLowerCase(); }
  return { mode: 'abs' + index, zpMode: 'zp' + index, expr: s, wide: /^\$[0-9A-Fa-f]{4}$/.test(s.trim()) };
}

/**
 * Assemble xa/Nescom-style 6502 source.
 * Returns { origin, bank, bytes, labels, tables, checks } where `checks` compares
 * the result against the address annotations the disassembly carries in comments.
 */
export function assemble(text) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const symbols = new Map();
  const anonDefs = []; // { name, index, addr }
  const stmts = [];
  let origin = null, bank = 0;

  for (const [n, raw] of text.split(/\r?\n/).entries()) {
    const sc = raw.indexOf(';');
    const comment = sc >= 0 ? raw.slice(sc + 1) : '';
    let line = (sc >= 0 ? raw.slice(0, sc) : raw).replace(/\s+$/, '');
    if (!line.trim()) continue;
    const lineNo = n + 1;
    let m;
    if ((m = /^#define\s+(\w+)\s+(.+)$/.exec(line))) { symbols.set(m[1], evalExpr(m[2], (k) => symbols.get(k))); continue; }
    if ((m = /^\s*\*=\s*(.+)$/.exec(line))) {
      const v = evalExpr(m[1], (k) => symbols.get(k));
      if (origin !== null) throw new Error(`line ${lineNo}: only one origin is supported`);
      origin = v & 0xffff; bank = v >> 16;
      continue;
    }
    if (/^\s*\.[()]\s*$/.test(line)) continue; // scope markers; labels are unique anyway
    // Label: anonymous (+, --, ...) anywhere, or a name starting in column 0.
    // Several labels may share a line ("+ -").
    while ((m = /^\s*([+-]+)(?=\s|$)/.exec(line)) || (m = /^([A-Za-z_]\w*):?/.exec(line))) {
      if (OPS[m[1].toLowerCase()]) break;
      stmts.push({ kind: 'label', name: m[1], lineNo, comment });
      line = ' ' + line.slice(m[0].length);
    }
    for (const part of line.split(':')) {
      const s = part.trim();
      if (!s) continue;
      if ((m = /^\.(byt|word)\s+(.*)$/i.exec(s))) {
        // The source also writes "NAME  $43" (no comma) for two consecutive bytes.
        const exprs = m[2].split(',').flatMap((e) => { const j = /^\s*(\w+)\s+(\$[0-9A-Fa-f]+)\s*$/.exec(e); return j ? [j[1], j[2]] : [e]; });
        stmts.push({ kind: m[1].toLowerCase(), exprs, lineNo, comment });
      } else if ((m = /^([A-Za-z]{3})(?:\s+(.*))?$/.exec(s)) && OPS[m[1].toLowerCase()]) {
        const mnem = m[1].toLowerCase();
        stmts.push({ kind: 'op', mnem, ...parseOperand(mnem, m[2] || ''), lineNo });
      } else {
        throw new Error(`line ${lineNo}: cannot parse "${s}"`);
      }
    }
  }
  if (origin === null) throw new Error('source has no "*=" origin');

  // Pass 1: sizes and label addresses.
  let pc = origin;
  const known = (k) => symbols.get(k);
  stmts.forEach((st, index) => {
    st.addr = pc;
    if (st.kind === 'label') {
      if (/^[+-]/.test(st.name)) anonDefs.push({ name: st.name, index, addr: pc });
      else {
        if (symbols.has(st.name)) throw new Error(`line ${st.lineNo}: duplicate label ${st.name}`);
        symbols.set(st.name, pc);
      }
    } else if (st.kind === 'byt') pc += st.exprs.length;
    else if (st.kind === 'word') pc += st.exprs.length * 2;
    else {
      if (st.zpMode) {
        // Zero-page form when the operand is already known to fit in a byte.
        let v;
        try { v = evalExpr(st.expr, known, () => 0x8000); } catch (e) { if (!(e instanceof UndefinedSymbol)) throw e; }
        if (v !== undefined && v < 0x100 && !st.wide && OPS[st.mnem][st.zpMode] !== undefined) st.mode = st.zpMode;
      }
      if (OPS[st.mnem][st.mode] === undefined) throw new Error(`line ${st.lineNo}: ${st.mnem} has no ${st.mode} form`);
      pc += MODE_SIZE[st.mode];
    }
  });

  // Pass 2: emit.
  const bytes = new Uint8Array(pc - origin);
  const checks = { total: 0, mismatches: [] };
  const check = (st, expected, actual, what) => {
    checks.total++;
    if (expected !== actual) checks.mismatches.push({ line: st.lineNo, what, expected, actual });
  };
  const tables = {};
  const unresolved = [];
  let currentLabel = null;
  stmts.forEach((st, index) => {
    const anon = (name) => {
      const back = name[0] === '-';
      const cands = anonDefs.filter((d) => d.name === name && (back ? d.index < index : d.index > index));
      if (!cands.length) throw new Error(`line ${st.lineNo}: no matching "${name}" label`);
      return (back ? cands[cands.length - 1] : cands[0]).addr;
    };
    const ev = (e) => {
      try { return evalExpr(e, known, anon); } catch (err) { throw new Error(`line ${st.lineNo}: ${err.message}`); }
    };
    let o = st.addr - origin;
    if (st.kind === 'label') {
      currentLabel = st.name;
      const m = /^\s*at \$?([0-9A-Fa-f]{4})\b/.exec(st.comment);
      if (m) check(st, parseInt(m[1], 16), st.addr, `label ${st.name}`);
    } else if (st.kind === 'byt') {
      for (const e of st.exprs) bytes[o++] = ev(e) & 0xff;
    } else if (st.kind === 'word') {
      const m = /^\s*\$([0-9A-Fa-f]{4})\b\s*;?\s*(.*)$/.exec(st.comment);
      const vals = st.exprs.map((e) => {
        // A few table entries name labels the source never defines (aliases);
        // their address is only given in the trailing comment.
        if (m && st.exprs.length === 1 && /^\s*[A-Za-z_]\w*\s*$/.test(e) && known(e.trim()) === undefined) {
          // Prefer the label annotated with that address, so the alias follows it if the code moved.
          const noted = parseInt(m[1], 16);
          const target = stmts.find((t) => t.kind === 'label' && new RegExp(`^\\s*at \\$?${m[1]}\\b`, 'i').test(t.comment));
          unresolved.push({ line: st.lineNo, name: e.trim(), alias: target ? target.name : null });
          return target ? target.addr : noted;
        }
        return ev(e) & 0xffff;
      });
      for (const v of vals) { bytes[o++] = v & 0xff; bytes[o++] = v >> 8; }
      if (m && vals.length === 1) {
        check(st, parseInt(m[1], 16), vals[0], `.word ${st.exprs[0].trim()}`);
        // Remember annotated pointer tables (e.g. the song list) with their descriptions.
        (tables[currentLabel] ||= []).push({ name: st.exprs[0].trim(), addr: vals[0], note: m[2].replace(/^[0-9A-Fa-f]+\s+/, '').trim() });
      }
    } else {
      bytes[o++] = OPS[st.mnem][st.mode];
      if (st.mode === 'rel') {
        const d = ev(st.expr) - (st.addr + 2);
        if (d < -128 || d > 127) throw new Error(`line ${st.lineNo}: branch out of range`);
        bytes[o++] = d & 0xff;
      } else if (MODE_SIZE[st.mode] === 2) bytes[o++] = ev(st.expr) & 0xff;
      else if (MODE_SIZE[st.mode] === 3) { const v = ev(st.expr); bytes[o++] = v & 0xff; bytes[o++] = (v >> 8) & 0xff; }
    }
  });
  // One entry per label / instruction / data statement, for showing the code next to its bytes.
  const listing = stmts.map((st) => ({
    line: st.lineNo, addr: st.addr, kind: st.kind, name: st.kind === 'label' ? st.name : undefined,
    size: st.kind === 'label' ? 0 : st.kind === 'byt' ? st.exprs.length : st.kind === 'word' ? st.exprs.length * 2 : MODE_SIZE[st.mode],
  }));
  return { origin, bank, bytes, labels: symbols, tables, checks, unresolved, listing };
}

// ---------------------------------------------------------------------------
// 6502 CPU (NES variant: no decimal mode)
// ---------------------------------------------------------------------------
const DECODE = new Array(256).fill(null);
for (const [mnem, modes] of Object.entries(OPS)) for (const [mode, op] of Object.entries(modes)) DECODE[op] = [mnem, mode];

export class CPU {
  constructor(read, write) {
    this.read = read; this.write = write;
    this.a = this.x = this.y = 0; this.sp = 0xfd; this.pc = 0;
    this.c = this.z = this.i = this.d = this.v = this.n = 0;
  }
  push(v) { this.write(0x100 | this.sp, v); this.sp = (this.sp - 1) & 0xff; }
  pop() { this.sp = (this.sp + 1) & 0xff; return this.read(0x100 | this.sp); }
  nz(v) { this.z = v === 0 ? 1 : 0; this.n = v >> 7; return v; }
  status() { return this.c | (this.z << 1) | (this.i << 2) | (this.d << 3) | 0x20 | (this.v << 6) | (this.n << 7); }
  setStatus(p) { this.c = p & 1; this.z = (p >> 1) & 1; this.i = (p >> 2) & 1; this.d = (p >> 3) & 1; this.v = (p >> 6) & 1; this.n = (p >> 7) & 1; }
  adc(v) { const r = this.a + v + this.c; this.v = (~(this.a ^ v) & (this.a ^ r) & 0x80) >> 7; this.c = r >> 8; this.a = this.nz(r & 0xff); }
  cmp(r, v) { const d = (r - v) & 0xff; this.c = r >= v ? 1 : 0; this.nz(d); }

  step() {
    const read = this.read;
    const op = read(this.pc);
    const dec = DECODE[op];
    if (!dec) throw new Error(`unsupported opcode $${op.toString(16)} at $${this.pc.toString(16)}`);
    const [mnem, mode] = dec;
    const b1 = read((this.pc + 1) & 0xffff);
    let ea = -1;
    switch (mode) {
      case 'imm': ea = (this.pc + 1) & 0xffff; break;
      case 'zp': ea = b1; break;
      case 'zpx': ea = (b1 + this.x) & 0xff; break;
      case 'zpy': ea = (b1 + this.y) & 0xff; break;
      case 'abs': ea = b1 | (read((this.pc + 2) & 0xffff) << 8); break;
      case 'absx': ea = ((b1 | (read((this.pc + 2) & 0xffff) << 8)) + this.x) & 0xffff; break;
      case 'absy': ea = ((b1 | (read((this.pc + 2) & 0xffff) << 8)) + this.y) & 0xffff; break;
      case 'indx': { const p = (b1 + this.x) & 0xff; ea = read(p) | (read((p + 1) & 0xff) << 8); break; }
      case 'indy': ea = ((read(b1) | (read((b1 + 1) & 0xff) << 8)) + this.y) & 0xffff; break;
      case 'ind': { const p = b1 | (read((this.pc + 2) & 0xffff) << 8); ea = read(p) | (read((p & 0xff00) | ((p + 1) & 0xff)) << 8); break; }
      case 'rel': ea = (this.pc + 2 + (b1 < 0x80 ? b1 : b1 - 256)) & 0xffff; break;
    }
    this.pc = (this.pc + MODE_SIZE[mode]) & 0xffff;
    const acc = mode === 'acc';
    let v;
    switch (mnem) {
      case 'lda': this.a = this.nz(read(ea)); break;
      case 'ldx': this.x = this.nz(read(ea)); break;
      case 'ldy': this.y = this.nz(read(ea)); break;
      case 'sta': this.write(ea, this.a); break;
      case 'stx': this.write(ea, this.x); break;
      case 'sty': this.write(ea, this.y); break;
      case 'ora': this.a = this.nz(this.a | read(ea)); break;
      case 'and': this.a = this.nz(this.a & read(ea)); break;
      case 'eor': this.a = this.nz(this.a ^ read(ea)); break;
      case 'adc': this.adc(read(ea)); break;
      case 'sbc': this.adc(read(ea) ^ 0xff); break;
      case 'cmp': this.cmp(this.a, read(ea)); break;
      case 'cpx': this.cmp(this.x, read(ea)); break;
      case 'cpy': this.cmp(this.y, read(ea)); break;
      case 'bit': v = read(ea); this.z = (v & this.a) === 0 ? 1 : 0; this.n = v >> 7; this.v = (v >> 6) & 1; break;
      case 'asl': v = acc ? this.a : read(ea); this.c = v >> 7; v = this.nz((v << 1) & 0xff); if (acc) this.a = v; else this.write(ea, v); break;
      case 'lsr': v = acc ? this.a : read(ea); this.c = v & 1; v = this.nz(v >> 1); if (acc) this.a = v; else this.write(ea, v); break;
      case 'rol': { v = acc ? this.a : read(ea); const c = v >> 7; v = this.nz(((v << 1) | this.c) & 0xff); this.c = c; if (acc) this.a = v; else this.write(ea, v); break; }
      case 'ror': { v = acc ? this.a : read(ea); const c = v & 1; v = this.nz((v >> 1) | (this.c << 7)); this.c = c; if (acc) this.a = v; else this.write(ea, v); break; }
      case 'inc': this.write(ea, this.nz((read(ea) + 1) & 0xff)); break;
      case 'dec': this.write(ea, this.nz((read(ea) - 1) & 0xff)); break;
      case 'inx': this.x = this.nz((this.x + 1) & 0xff); break;
      case 'iny': this.y = this.nz((this.y + 1) & 0xff); break;
      case 'dex': this.x = this.nz((this.x - 1) & 0xff); break;
      case 'dey': this.y = this.nz((this.y - 1) & 0xff); break;
      case 'tax': this.x = this.nz(this.a); break;
      case 'tay': this.y = this.nz(this.a); break;
      case 'txa': this.a = this.nz(this.x); break;
      case 'tya': this.a = this.nz(this.y); break;
      case 'tsx': this.x = this.nz(this.sp); break;
      case 'txs': this.sp = this.x; break;
      case 'pha': this.push(this.a); break;
      case 'pla': this.a = this.nz(this.pop()); break;
      case 'php': this.push(this.status() | 0x10); break;
      case 'plp': this.setStatus(this.pop()); break;
      case 'clc': this.c = 0; break;
      case 'sec': this.c = 1; break;
      case 'cli': this.i = 0; break;
      case 'sei': this.i = 1; break;
      case 'cld': this.d = 0; break;
      case 'sed': this.d = 1; break;
      case 'clv': this.v = 0; break;
      case 'nop': break;
      case 'jmp': this.pc = ea; break;
      case 'jsr': { const r = (this.pc - 1) & 0xffff; this.push(r >> 8); this.push(r & 0xff); this.pc = ea; break; }
      case 'rts': this.pc = ((this.pop() | (this.pop() << 8)) + 1) & 0xffff; break;
      case 'rti': this.setStatus(this.pop()); this.pc = this.pop() | (this.pop() << 8); break;
      case 'bpl': if (!this.n) this.pc = ea; break;
      case 'bmi': if (this.n) this.pc = ea; break;
      case 'bvc': if (!this.v) this.pc = ea; break;
      case 'bvs': if (this.v) this.pc = ea; break;
      case 'bcc': if (!this.c) this.pc = ea; break;
      case 'bcs': if (this.c) this.pc = ea; break;
      case 'bne': if (!this.z) this.pc = ea; break;
      case 'beq': if (this.z) this.pc = ea; break;
      case 'brk': throw new Error(`BRK at $${((this.pc - 1) & 0xffff).toString(16)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// NES audio chip (2A03 APU): two pulse channels, triangle, noise.
// ---------------------------------------------------------------------------
const LENGTH_TABLE = [10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30];
const DUTY = [[0, 1, 0, 0, 0, 0, 0, 0], [0, 1, 1, 0, 0, 0, 0, 0], [0, 1, 1, 1, 1, 0, 0, 0], [1, 0, 0, 1, 1, 1, 1, 1]];
const NOISE_PERIOD = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const TRI_SEQ = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const PULSE_MIX = Float32Array.from({ length: 31 }, (_, n) => (n ? 95.52 / (8128 / n + 100) : 0));
const TND_MIX = Float32Array.from({ length: 203 }, (_, n) => (n ? 163.67 / (24329 / n + 100) : 0));
export const CPU_HZ = 1789772.7272;

class Envelope {
  constructor() { this.start = false; this.loop = false; this.constant = false; this.param = 0; this.divider = 0; this.decay = 0; }
  clock() {
    if (this.start) { this.start = false; this.decay = 15; this.divider = this.param; }
    else if (this.divider === 0) { this.divider = this.param; if (this.decay) this.decay--; else if (this.loop) this.decay = 15; }
    else this.divider--;
  }
  get volume() { return this.constant ? this.param : this.decay; }
}

class Pulse {
  constructor(onesComplement) {
    this.onesComplement = onesComplement; this.env = new Envelope(); this.enabled = false;
    this.duty = 0; this.step = 0; this.period = 0; this.timer = 0; this.length = 0;
    this.sweepEnabled = false; this.sweepPeriod = 0; this.sweepNegate = false; this.sweepShift = 0; this.sweepDivider = 0; this.sweepReload = false;
  }
  write(reg, v) {
    if (reg === 0) { this.duty = v >> 6; this.env.loop = !!(v & 0x20); this.env.constant = !!(v & 0x10); this.env.param = v & 15; }
    else if (reg === 1) { this.sweepEnabled = !!(v & 0x80); this.sweepPeriod = (v >> 4) & 7; this.sweepNegate = !!(v & 8); this.sweepShift = v & 7; this.sweepReload = true; }
    else if (reg === 2) this.period = (this.period & 0x700) | v;
    else { this.period = (this.period & 0xff) | ((v & 7) << 8); if (this.enabled) this.length = LENGTH_TABLE[v >> 3]; this.step = 0; this.env.start = true; }
  }
  target() {
    const delta = this.period >> this.sweepShift;
    return this.sweepNegate ? this.period - delta - (this.onesComplement ? 1 : 0) : this.period + delta;
  }
  clockHalf() {
    if (this.length && !this.env.loop) this.length--;
    const t = this.target();
    if (this.sweepDivider === 0 && this.sweepEnabled && this.sweepShift && this.period >= 8 && t <= 0x7ff) this.period = Math.max(t, 0);
    if (this.sweepDivider === 0 || this.sweepReload) { this.sweepDivider = this.sweepPeriod; this.sweepReload = false; } else this.sweepDivider--;
  }
  tick() { // one CPU cycle
    if (this.timer === 0) { this.timer = (this.period + 1) * 2 - 1; this.step = (this.step + 1) & 7; } else this.timer--;
  }
  output() {
    if (!this.length || this.period < 8 || this.target() > 0x7ff || !DUTY[this.duty][this.step]) return 0;
    return this.env.volume;
  }
}

class Triangle {
  constructor() { this.enabled = false; this.control = false; this.linearLoad = 0; this.linear = 0; this.linearReload = false; this.period = 0; this.timer = 0; this.length = 0; this.step = 0; }
  write(reg, v) {
    if (reg === 0) { this.control = !!(v & 0x80); this.linearLoad = v & 0x7f; }
    else if (reg === 2) this.period = (this.period & 0x700) | v;
    else if (reg === 3) { this.period = (this.period & 0xff) | ((v & 7) << 8); if (this.enabled) this.length = LENGTH_TABLE[v >> 3]; this.linearReload = true; }
  }
  clockQuarter() { if (this.linearReload) this.linear = this.linearLoad; else if (this.linear) this.linear--; if (!this.control) this.linearReload = false; }
  clockHalf() { if (this.length && !this.control) this.length--; }
  tick() {
    if (this.timer === 0) { this.timer = this.period; if (this.length && this.linear && this.period >= 2) this.step = (this.step + 1) & 31; } else this.timer--;
  }
  output() { return TRI_SEQ[this.step]; }
}

class Noise {
  constructor() { this.env = new Envelope(); this.enabled = false; this.mode = false; this.period = NOISE_PERIOD[0]; this.timer = 0; this.length = 0; this.lfsr = 1; }
  write(reg, v) {
    if (reg === 0) { this.env.loop = !!(v & 0x20); this.env.constant = !!(v & 0x10); this.env.param = v & 15; }
    else if (reg === 2) { this.mode = !!(v & 0x80); this.period = NOISE_PERIOD[v & 15]; }
    else if (reg === 3) { if (this.enabled) this.length = LENGTH_TABLE[v >> 3]; this.env.start = true; }
  }
  clockHalf() { if (this.length && !this.env.loop) this.length--; }
  tick() {
    if (this.timer === 0) {
      this.timer = this.period - 1;
      const fb = (this.lfsr ^ (this.lfsr >> (this.mode ? 6 : 1))) & 1;
      this.lfsr = (this.lfsr >> 1) | (fb << 14);
    } else this.timer--;
  }
  output() { return !this.length || (this.lfsr & 1) ? 0 : this.env.volume; }
}

export class APU {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.p1 = new Pulse(true); this.p2 = new Pulse(false); this.tri = new Triangle(); this.noise = new Noise();
    this.dmc = 0; this.fiveStep = false; this.frameCycle = 0;
    this.sampleAcc = 0; this.sampleSum = 0; this.sampleCount = 0;
    this.hpPrevIn = 0; this.hpPrevOut = 0;
    this.out = [];
    this.mute = [false, false, false, false];
  }
  write(addr, v) {
    if (addr < 0x4004) this.p1.write(addr & 3, v);
    else if (addr < 0x4008) this.p2.write(addr & 3, v);
    else if (addr < 0x400c) this.tri.write(addr & 3, v);
    else if (addr < 0x4010) this.noise.write(addr & 3, v);
    else if (addr === 0x4011) this.dmc = v & 0x7f;
    else if (addr === 0x4015) {
      const ch = [this.p1, this.p2, this.tri, this.noise];
      ch.forEach((c, i) => { c.enabled = !!(v & (1 << i)); if (!c.enabled) c.length = 0; });
    } else if (addr === 0x4017) {
      this.fiveStep = !!(v & 0x80); this.frameCycle = 0;
      if (this.fiveStep) { this.quarter(); this.half(); }
    }
  }
  readStatus() { return (this.p1.length ? 1 : 0) | (this.p2.length ? 2 : 0) | (this.tri.length ? 4 : 0) | (this.noise.length ? 8 : 0); }
  quarter() { this.p1.env.clock(); this.p2.env.clock(); this.noise.env.clock(); this.tri.clockQuarter(); }
  half() { this.p1.clockHalf(); this.p2.clockHalf(); this.tri.clockHalf(); this.noise.clockHalf(); }
  /** Advance the chip by `cycles` CPU cycles, appending samples to `this.out`. */
  run(cycles) {
    const { p1, p2, tri, noise, mute } = this;
    const perSample = CPU_HZ / this.sampleRate;
    for (let n = 0; n < cycles; n++) {
      const fc = ++this.frameCycle;
      if (fc === 7457 || fc === 22371) this.quarter();
      else if (fc === 14913) { this.quarter(); this.half(); }
      else if (fc === (this.fiveStep ? 37281 : 29829)) { this.quarter(); this.half(); this.frameCycle = this.fiveStep ? -1 : 0; }
      p1.tick(); p2.tick(); tri.tick(); noise.tick();
      this.sampleSum += PULSE_MIX[(mute[0] ? 0 : p1.output()) + (mute[1] ? 0 : p2.output())]
        + TND_MIX[3 * (mute[2] ? 0 : tri.output()) + 2 * (mute[3] ? 0 : noise.output()) + this.dmc];
      this.sampleCount++;
      if (++this.sampleAcc >= perSample) {
        this.sampleAcc -= perSample;
        const x = this.sampleSum / this.sampleCount;
        this.sampleSum = 0; this.sampleCount = 0;
        // High-pass filter (~40 Hz) to remove the DC offset, as the console's output stage does.
        const y = 0.9948 * (this.hpPrevOut + x - this.hpPrevIn);
        this.hpPrevIn = x; this.hpPrevOut = y;
        this.out.push(y);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Machine: memory + CPU + APU, driven like the game's 60 Hz interrupt would.
// ---------------------------------------------------------------------------
const RETURN_ADDR = 0xfff0;
export const FRAME_HZ = 60.0988;

export class Machine {
  constructor(program, { sampleRate = 48000 } = {}) {
    this.program = program;
    this.mem = new Uint8Array(0x10000);
    this.mem.set(program.bytes, program.origin);
    this.apu = new APU(sampleRate);
    this.cpu = new CPU(
      (a) => (a === 0x4015 ? this.apu.readStatus() : this.mem[a]),
      (a, v) => {
        if (a >= 0x4000 && a <= 0x4017) this.apu.write(a, v);
        else if (a < 0x800) this.mem[a] = v; // 2K of console RAM; ROM is read-only
      },
    );
    this.cycleDebt = 0;
    this.apu.write(0x4015, 0x0f);
    this.apu.write(0x4017, 0x40);
  }
  /** Call a subroutine with the given accumulator value and run it until it returns. */
  call(addr, a = 0) {
    const cpu = this.cpu;
    cpu.a = a & 0xff; cpu.sp = 0xfd;
    const r = RETURN_ADDR - 1;
    cpu.push(r >> 8); cpu.push(r & 0xff);
    cpu.pc = addr;
    for (let n = 0; cpu.pc !== RETURN_ADDR; n++) {
      if (n > 200000) throw new Error(`routine at $${addr.toString(16)} did not return`);
      cpu.step();
    }
  }
  label(name) {
    const v = this.program.labels.get(name);
    if (v === undefined) throw new Error(`source has no label ${name}`);
    return v;
  }
  /** Ask the engine to start a song or sound effect. */
  start(index) { this.call(this.label('SoundCodeInit'), index); }
  /** Run one video frame: the engine's per-frame update, then a frame of audio. */
  frame() {
    this.call(this.label('SoundCodePlay'));
    this.cycleDebt += CPU_HZ / FRAME_HZ;
    const whole = Math.floor(this.cycleDebt);
    this.cycleDebt -= whole;
    this.apu.run(whole);
  }
}

/** The song / sound-effect list, read from the annotated pointer table in the source. */
export function listSounds(program) {
  const table = program.tables.MusicAndSfxTable || [];
  return table.map((e, index) => ({ index, name: e.name, note: e.note, addr: e.addr }));
}

/**
 * Render one song or sound effect to mono float samples.
 * Stops early once the engine falls silent (jingles and sound effects);
 * looping songs are cut at `seconds` with a fade-out.
 */
export function render(program, index, { seconds = 90, fade = 3, sampleRate = 48000 } = {}) {
  const m = new Machine(program, { sampleRate });
  m.start(index);
  const out = m.apu.out;
  const frames = Math.ceil(seconds * FRAME_HZ);
  let heard = false, quietFrames = 0, ended = false;
  for (let f = 0; f < frames; f++) {
    const from = out.length;
    m.frame();
    let peak = 0;
    for (let i = from; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak > 0.002) { heard = true; quietFrames = 0; } else quietFrames++;
    if ((heard && quietFrames > 45) || (!heard && quietFrames > 180)) { ended = true; break; }
  }
  let n = out.length;
  if (ended) n = Math.max(0, n - Math.floor((quietFrames - 12) / FRAME_HZ * sampleRate));
  const samples = Float32Array.from(out.slice(0, n));
  if (!ended) {
    const fadeN = Math.min(n, Math.floor(fade * sampleRate));
    for (let i = 0; i < fadeN; i++) samples[n - fadeN + i] *= 1 - i / fadeN;
  }
  return { samples, sampleRate, ended };
}

/** Encode mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples, sampleRate, gain = 1.6) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * gain)) * 32767, true);
  return new Uint8Array(buf);
}
