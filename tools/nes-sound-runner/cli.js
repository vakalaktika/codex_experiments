#!/usr/bin/env node
// Assemble a sound-engine source file and run it on the emulated console.
//
//   node cli.js <source.txt> --list
//   node cli.js <source.txt> --song <number|name> [--seconds 90] [-o out.wav]
//   node cli.js <source.txt> --all [--out-dir dir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assemble, listSounds, render, encodeWav } from './core.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const source = args.find((a, i) => !a.startsWith('-') && !['--song', '--seconds', '-o', '--out-dir'].includes(args[i - 1]));
if (!source) {
  console.error('usage: node cli.js <source.txt> (--list | --song <number|name> [-o out.wav] | --all [--out-dir dir]) [--seconds N]');
  process.exit(2);
}

const program = assemble(readFileSync(source, 'utf8'));
const end = program.origin + program.bytes.length;
const hex = (n) => '$' + n.toString(16).toUpperCase().padStart(4, '0');
console.error(`assembled ${program.bytes.length} bytes at ${hex(program.origin)}-${hex(end - 1)} (bank ${program.bank})`);
const { total, mismatches } = program.checks;
console.error(`address annotations in the source: ${total - mismatches.length}/${total} match`);
const byDelta = new Map();
for (const m of mismatches) { const d = m.actual - m.expected; byDelta.set(d, [...(byDelta.get(d) || []), m]); }
for (const [d, list] of byDelta) {
  const m = list[0];
  console.error(`  ${list.length} off by ${d > 0 ? '+' : ''}${d} bytes, first at line ${m.line}: ${m.what} is ${hex(m.actual)}, comment says ${hex(m.expected)}`);
}
if (program.unresolved.length) console.error(`${program.unresolved.length} undefined table entries resolved from their comments (e.g. ${program.unresolved[0].name} -> ${program.unresolved[0].alias})`);

const sounds = listSounds(program);
const seconds = Number(opt('--seconds', 90));
const renderOne = (s, path) => {
  const r = render(program, s.index, { seconds });
  writeFileSync(path, encodeWav(r.samples, r.sampleRate));
  console.error(`${String(s.index).padStart(3)} ${s.name.padEnd(28)} ${(r.samples.length / r.sampleRate).toFixed(1).padStart(6)}s ${r.ended ? 'ended' : 'looping, faded out'} -> ${path}`);
};

if (args.includes('--list')) {
  for (const s of sounds) console.log(`${String(s.index).padStart(3)}  ${s.name.padEnd(28)} ${s.note}`);
} else if (args.includes('--all')) {
  const dir = opt('--out-dir', 'out');
  mkdirSync(dir, { recursive: true });
  const seen = new Set();
  for (const s of sounds) {
    if (seen.has(s.addr)) continue; // skip aliases of the same data
    seen.add(s.addr);
    renderOne(s, join(dir, `${String(s.index).padStart(2, '0')}_${s.name}.wav`));
  }
} else {
  const want = opt('--song');
  if (want === undefined) { console.error('nothing to do: pass --list, --song or --all'); process.exit(2); }
  const s = /^\d+$/.test(want) ? sounds[Number(want)] : sounds.find((x) => x.name.toLowerCase().includes(want.toLowerCase()));
  if (!s) { console.error(`no such song: ${want}`); process.exit(1); }
  renderOne(s, opt('-o', `${s.name}.wav`));
}
