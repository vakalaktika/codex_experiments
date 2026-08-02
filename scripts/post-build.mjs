/**
 * GitHub Pages has no rewrite rules, so a cold load of a deep link like
 * /codex_experiments/projects hits the CDN and gets a real 404 before the app
 * ever boots. Pages serves 404.html for any unmatched path, so shipping a copy
 * of index.html under that name hands control to React Router instead.
 *
 * The service worker's navigateFallback covers this too — but only on repeat
 * visits, which means it fails precisely for a link opened cold on a phone.
 */
import { copyFile } from 'node:fs/promises'

await copyFile('dist/index.html', 'dist/404.html')
console.log('wrote dist/404.html (SPA fallback for GitHub Pages)')
