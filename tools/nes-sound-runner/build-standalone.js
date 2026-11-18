// Inline core.js into player.html so the page works as a single file (e.g. opened from disk).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'dist', 'player.html');
const core = readFileSync(join(here, 'core.js'), 'utf8').replace(/^export /gm, '');
const html = readFileSync(join(here, 'player.html'), 'utf8').replace(/^import .* from '\.\/core\.js';$/m, () => core);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log('wrote ' + out);
