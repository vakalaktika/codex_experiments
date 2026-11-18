import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble, Machine, render } from './core.js';

// A tiny engine in the same syntax as the real sources: init stores the song
// number, play writes a pulse-channel note when a song was requested.
const SOURCE = `
*= $048000
#define Song $E0
#define Volume $30 | $0F
SoundCodePlay ; at 8000
  jmp Play
SoundCodeInit ; at 8003
  sta Song
  rts
Play ; at 8006
  lda Song
  bne +
  rts
+ -
  asl
  tax
  lda #Volume : sta $4000
  lda PeriodTable+0,x
  sta $4002
  lda PeriodTable+1,x
  sta $4003
  lda #$00
  sta Song
  rts
PeriodTable:
  .word 0, $00FD      ; A-4
MusicAndSfxTable
  .word Play          ; $8006 ;0 Silence
  .word Missing       ; $8006 ;1 Beep
  .byt <(PeriodTable), >(PeriodTable), 1*2+3
`;

test('assembles labels, defines, anonymous labels and data', () => {
  const p = assemble(SOURCE);
  assert.equal(p.origin, 0x8000);
  assert.equal(p.bank, 4);
  assert.equal(p.checks.mismatches.length, 0);
  assert.equal(p.checks.total, 5);
  assert.deepEqual([...p.bytes.slice(0, 6)], [0x4c, 0x06, 0x80, 0x85, 0xe0, 0x60]); // jmp abs, sta zp, rts
  assert.deepEqual([...p.bytes.slice(6, 11)], [0xa5, 0xe0, 0xd0, 0x01, 0x60]); // lda zp, bne +1, rts
  const table = p.labels.get('PeriodTable');
  assert.deepEqual([...p.bytes.slice(-3)], [table & 0xff, table >> 8, 5]);
  assert.deepEqual(p.unresolved, [{ line: 29, name: 'Missing', alias: 'Play' }]);
});

test('runs the code and the audio chip plays the requested pitch', () => {
  const p = assemble(SOURCE);
  const m = new Machine(p);
  m.start(1);
  for (let i = 0; i < 30; i++) m.frame();
  assert.equal(m.apu.p1.period, 0xfd);
  const out = m.apu.out.slice(4800); // skip the start-up transient
  let crossings = 0;
  for (let i = 1; i < out.length; i++) if (out[i - 1] <= 0 && out[i] > 0) crossings++;
  const hz = crossings / (out.length / 48000);
  assert.ok(Math.abs(hz - 440) < 6, `expected about 440 Hz, got ${hz}`);
});

test('render stops when the engine stays silent', () => {
  const r = render(assemble(SOURCE), 0, { seconds: 30 });
  assert.equal(r.ended, true);
  assert.ok(r.samples.length < 48000 * 5);
});
