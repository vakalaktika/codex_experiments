/**
 * Serves dist/ the way GitHub Pages does, so a build can be verified without
 * deploying.
 *
 * Two behaviours are what make this worth having over `vite preview`: the app
 * is mounted under the repo subpath, and any unmatched path returns 404.html
 * with a real 404 status. Both are how Pages actually behaves, and both are
 * where a subpath PWA breaks — see docs/ARCHITECTURE.md §6a.
 *
 *   node scripts/serve-pages.mjs        # http://localhost:4173/codex_experiments/
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const DIST = resolve('dist')
const BASE = '/codex_experiments/'
const PORT = Number(process.env.PORT ?? 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function readIfFile(path) {
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return await readFile(path)
  } catch {
    return null
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`)

  if (url.pathname === '/') {
    response.writeHead(302, { Location: BASE }).end()
    return
  }

  if (!url.pathname.startsWith(BASE)) {
    response.writeHead(404, { 'Content-Type': MIME['.html'] }).end('Not found — outside base')
    return
  }

  // normalize + prefix check keeps ../ out of the served tree
  const relative = normalize(url.pathname.slice(BASE.length))
  const target = join(DIST, relative)
  if (!target.startsWith(DIST)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  const body = (await readIfFile(target)) ?? (await readIfFile(join(target, 'index.html')))

  if (body) {
    const ext = extname(target) || '.html'
    response.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
    response.end(body)
    return
  }

  // The Pages behaviour that matters: unmatched paths get 404.html, with a
  // genuine 404 status. React Router reads the URL from there.
  const fallback = await readIfFile(join(DIST, '404.html'))
  response.writeHead(404, { 'Content-Type': MIME['.html'] })
  response.end(fallback ?? 'Not found (and no 404.html was built)')
})

server.listen(PORT, () => {
  console.log(`Serving dist/ as GitHub Pages would: http://localhost:${PORT}${BASE}`)
})
