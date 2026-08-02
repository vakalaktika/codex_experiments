/**
 * Renders the app icons from one SVG source so the set stays consistent.
 *
 * Run: npm run icons   (output is committed; CI does not regenerate)
 *
 * The maskable variant keeps the glyph inside the 80% safe zone Android crops
 * to — reusing the `any` icon as maskable is what produces clipped icons.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'

const BG = '#0b0b0f'
const ACCENT = '#7c5cff'

/** @param {number} inset fraction of the canvas to keep clear at the edges */
function svg(inset) {
  const s = 512
  const scale = 1 - inset * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="${BG}"/>
  <g transform="translate(${s / 2} ${s / 2}) scale(${scale}) translate(${-s / 2} ${-s / 2})">
    <circle cx="256" cy="256" r="196" fill="${ACCENT}" opacity="0.16"/>
    <path d="M256 132a44 44 0 0 1 44 44v76a44 44 0 0 1-88 0v-76a44 44 0 0 1 44-44Z" fill="${ACCENT}"/>
    <path d="M160 244a96 96 0 0 0 192 0" fill="none" stroke="${ACCENT}" stroke-width="26" stroke-linecap="round"/>
    <path d="M256 340v44" fill="none" stroke="${ACCENT}" stroke-width="26" stroke-linecap="round"/>
  </g>
</svg>`
}

async function render(source, size, path) {
  const resvg = new Resvg(source, { fitTo: { mode: 'width', value: size } })
  await writeFile(path, resvg.render().asPng())
  console.log(`wrote ${path} (${size}px)`)
}

await mkdir('public/icons', { recursive: true })

const standard = svg(0.08)
await render(standard, 192, 'public/icons/icon-192.png')
await render(standard, 512, 'public/icons/icon-512.png')
await render(standard, 180, 'public/icons/apple-touch-icon-180.png')
// 20% padding all round: Android may crop to a circle.
await render(svg(0.2), 512, 'public/icons/icon-512-maskable.png')
