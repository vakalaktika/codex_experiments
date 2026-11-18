# NES Sound Runner

Loads 6502 sound-engine source code and runs it: an assembler, a 6502 CPU and an
NES audio chip (APU) emulator in one dependency-free module.

It was written for the commented Mega Man disassemblies published at
<https://bisqwit.iki.fi/jutut/megamansource/> (`mm2music.txt` and `mmmusic2.txt`).
Those files are not included here; download them yourself.

## Use

```sh
node cli.js mm2music.txt --list                       # songs and sound effects
node cli.js mm2music.txt --song 16 -o password.wav    # by number
node cli.js mm2music.txt --song flashman --seconds 60 # by name
node cli.js mm2music.txt --all --out-dir out          # everything
node --test                                           # unit tests
```

In a browser, serve this folder and open `player.html`, or build a single file
that also works when opened from disk:

```sh
node build-standalone.js   # writes dist/player.html
```

## How it works

1. **Assemble.** `assemble()` reads the xa/Nescom-style source (`*=` origin,
   `#define`, `.byt`/`.word`, `+`/`-` anonymous labels, `:` statement separators)
   and produces the machine code. The disassemblies note the original address of
   many labels in comments; the assembler compares its result against them.
2. **Run.** `Machine` puts the code in a 64K address space and calls it the way
   the game does: `SoundCodeInit` once with the song number in A, then
   `SoundCodePlay` once per video frame (60.1 Hz).
3. **Listen.** Writes to `$4000-$4017` go to the APU emulation (two pulse
   channels, triangle, noise, envelopes, sweep, length and frame counters), which
   is clocked per CPU cycle and averaged down to 48 kHz.

## Known limits

- Only the 151 official 6502 opcodes, and no cycle-exact timing: each frame's
  register writes all land at the start of the frame.
- The sample (DMC) channel is not emulated; these engines do not use it.
- `mm2music.txt` assembles 2 bytes longer than the original from the pitch table
  onward, so its later address annotations differ by +2. Everything is referenced
  by label, so it runs the same. `mmmusic2.txt` matches all of its annotations.
- The source must provide `SoundCodeInit`, `SoundCodePlay` and, for the song
  list, an annotated `MusicAndSfxTable`.
