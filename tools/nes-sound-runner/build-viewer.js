// Build the single-file viewer page: inlines core.js and a small original
// example program (so the page has something to show before a file is loaded).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble, CPU_HZ } from './core.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'dist', 'viewer.html');

// --- Example program -------------------------------------------------------
const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteIndex = (n) => NAMES.indexOf(n.slice(0, 2)) + 12 * (Number(n[2]) - 3) + 1; // 1 = C-3
const periods = Array.from({ length: 37 }, (_, i) => Math.round(CPU_HZ / (16 * 130.8128 * 2 ** (i / 12))) - 1);
const stream = (events) => events.map(([n, len]) => (n === 'rest'
  ? ` .byt REST, ${String(len).padStart(2)}      ;Pause       (length ${len})`
  : ` .byt ${String(noteIndex(n)).padStart(4)}, ${String(len).padStart(2)}      ;note ${n}    (length ${len})`)).join('\n');
const arp = (a, b, c, d) => [a, b, c, d, c, b, c, b].map((n) => [n, 8]);
const songs = [
  { name: 'Demo_Arpeggio', note: 'Looping arpeggio with bass', end: 'LOOP',
    pulse: [...arp('C-4', 'E-4', 'G-4', 'C-5'), ...arp('G-3', 'B-3', 'D-4', 'G-4'), ...arp('A-3', 'C-4', 'E-4', 'A-4'), ...arp('F-3', 'A-3', 'C-4', 'F-4')],
    tri: [['C-4', 56], ['rest', 8], ['G-3', 56], ['rest', 8], ['A-3', 56], ['rest', 8], ['F-3', 56], ['rest', 8]] },
  { name: 'Demo_Scale', note: 'One-shot scale', end: 'END',
    pulse: ['C-4', 'D-4', 'E-4', 'F-4', 'G-4', 'A-4', 'B-4', 'C-5'].map((n) => [n, 12]),
    tri: [['C-4', 48], ['G-3', 48]] },
  { name: 'Demo_Blip', note: 'Short sound effect', end: 'END',
    pulse: [['C-6', 3], ['G-5', 3], ['C-6', 6]], tri: [] },
];

const demoSource = (addr) => `*= $008000
;---------------------------------------------------------------------------
; Example sound engine for the NES Sound Runner viewer.
; Written for this page in the same syntax as the real disassemblies.
;
; The console calls SoundCodeInit once with the song number in A,
; then SoundCodePlay once per video frame.
;---------------------------------------------------------------------------

#define PtrLo    $10   ; current data pointer, low byte   (one per channel)
#define PtrHi    $12   ; current data pointer, high byte
#define StartLo  $14   ; where the stream began, for looping
#define StartHi  $16
#define Wait     $18   ; frames left on the current note
#define Active   $1A   ; 1 while the channel is playing
#define Temp     $1C   ; 1C,1D

#define REST     $00
#define LOOP     $FE
#define END      $FF

SoundCodePlay ; at 8000
  jmp Update

SoundCodeInit ; at 8003
  asl
  tax
  lda MusicAndSfxTable+0,x
  sta Temp+0
  lda MusicAndSfxTable+1,x
  sta Temp+1
; The song header is two pointers: pulse stream, triangle stream
  ldy #$00
  ldx #$00
-
  lda (Temp),y
  sta PtrLo,x
  sta StartLo,x
  iny
  lda (Temp),y
  sta PtrHi,x
  sta StartHi,x
  iny
  lda #$01
  sta Wait,x
  sta Active,x
  inx
  cpx #$02
  bne -
  lda #$05          ; enable pulse 1 and triangle
  sta $4015
  rts

Update:
  ldx #$00
  jsr TickChannel
  ldx #$01

TickChannel:
  lda Active,x
  bne +
  rts
+
  dec Wait,x
  beq NextEvent
  rts

NextEvent:
  lda PtrLo,x : sta Temp+0
  lda PtrHi,x : sta Temp+1
  ldy #$00
  lda (Temp),y
  cmp #END
  bne +
  lda #$00
  sta Active,x
  jmp Silence
+
  cmp #LOOP
  bne +
  lda StartLo,x : sta PtrLo,x
  lda StartHi,x : sta PtrHi,x
  jmp NextEvent
+
  pha               ; note number
  iny
  lda (Temp),y
  sta Wait,x        ; note length in frames
  clc
  lda PtrLo,x
  adc #$02
  sta PtrLo,x
  bcc +
  inc PtrHi,x
+
  pla
  bne PlayNote

Silence:
  cpx #$00
  bne +
  lda #$30          ; pulse: constant volume 0
  sta $4000
  rts
+
  lda #$80          ; triangle: linear counter 0
  sta $4008
  rts

PlayNote:
  asl
  tay
  cpx #$00
  bne +
  lda #$84          ; pulse: 50% duty, decaying envelope
  sta $4000
  lda #$08          ; sweep off
  sta $4001
  lda PeriodTable+0,y
  sta $4002
  lda PeriodTable+1,y
  ora #$08
  sta $4003
  rts
+
  lda #$FF          ; triangle sounds one octave below the same period
  sta $4008
  lda PeriodTable+0,y
  sta $400A
  lda PeriodTable+1,y
  ora #$08
  sta $400B
  rts

PeriodTable:
  .word 0
${[0, 12, 24].map((o) => `  .word ${periods.slice(o, o + 12).map((p) => '$' + p.toString(16).toUpperCase().padStart(4, '0')).join(',')} ;Octave ${3 + o / 12}`).join('\n')}
  .word $${periods[36].toString(16).toUpperCase().padStart(4, '0')}

MusicAndSfxTable
${songs.map((s, i) => ` .word ${s.name.padEnd(30)} ; $${addr(s.name)} ;${i} ${s.note}`).join('\n')}

${songs.map((s) => `${s.name}
 .word ${s.name}_pulse, ${s.name}_tri
${s.name}_pulse
${stream(s.pulse)}
 .byt ${s.end}
${s.name}_tri
${stream(s.tri)}
 .byt ${s.end}
`).join('\n')}`;

// Two passes: assemble once to learn the addresses the table comments should carry.
const first = assemble(demoSource(() => '0000'));
const demo = demoSource((name) => first.labels.get(name).toString(16).toUpperCase().padStart(4, '0'));
const check = assemble(demo);
if (check.checks.mismatches.length) throw new Error('example program annotations do not match');

// --- Page ------------------------------------------------------------------
const core = readFileSync(join(here, 'core.js'), 'utf8').replace(/^export /gm, '');
if (core.includes('</script')) throw new Error('core.js cannot be inlined');
const html = readFileSync(join(here, 'viewer.template.html'), 'utf8')
  .replace('/*__CORE__*/', () => core)
  .replace('"__DEMO__"', () => JSON.stringify(demo).replace(/</g, '\\u003c'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes, example program ${check.bytes.length} bytes)`);
