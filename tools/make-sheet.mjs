// Writes tools/sheet.svg: every motion's frames in one theme, and the idle mascot in every theme.
// node tools/make-sheet.mjs [theme]
import { writeFileSync } from 'fs'
import { MOTION_NAMES, framesOf, compose, W, H } from '../hooks/mascot/sprite.js'
import { THEME_NAMES, theme, mascotPalette } from '../hooks/mascot/themes.js'
import { toSvgBody } from '../hooks/mascot/render.js'

const name = process.argv[2] ?? 'claude'
const t = theme(name)
const pal = mascotPalette(name)
const PX = 5
const CELL_W = W * PX + 16
const LABEL_W = 110
const ROW_H = H * PX + 22
const maxFrames = Math.max(...MOTION_NAMES.map((m) => framesOf(m).length))
const COLS = 2
const PER_COL = Math.ceil(MOTION_NAMES.length / COLS)
const COL_W = LABEL_W + maxFrames * CELL_W + 20
const width = COLS * COL_W
const font = 'font:500 13px ui-sans-serif,system-ui,sans-serif'

let body = ''
MOTION_NAMES.forEach((m, k) => {
  const r = k % PER_COL
  const ox = Math.floor(k / PER_COL) * COL_W
  const y = 20 + r * ROW_H
  body += `<text x="${ox + 16}" y="${y + (H * PX) / 2 + 5}" style="${font};fill:${t.text}">${m}</text>`
  framesOf(m).forEach((f, i) => {
    const x = ox + LABEL_W + i * CELL_W
    body += `<rect x="${x - 4}" y="${y - 4}" width="${W * PX + 8}" height="${H * PX + 8}" rx="4" fill="${t.track}" fill-opacity=".35"/>`
    body += `<g transform="translate(${x} ${y})">${toSvgBody(f.grid, pal, PX)}</g>`
    body += `<text x="${x + W * PX}" y="${y + H * PX + 14}" text-anchor="end" style="font:400 10px ui-monospace,monospace;fill:${t.dim}">${f.ms}ms</text>`
  })
})

// every theme, idle and celebrate
const ty = 20 + PER_COL * ROW_H + 20
THEME_NAMES.forEach((n, i) => {
  const th = theme(n)
  const x = 16 + i * (W * 4 + 40)
  body += `<rect x="${x - 6}" y="${ty - 6}" width="${W * 4 + 12}" height="${H * 4 * 2 + 40}" rx="6" fill="${th.bg}" stroke="${th.track}"/>`
  body += `<g transform="translate(${x} ${ty})">${toSvgBody(compose({}), mascotPalette(n), 4)}</g>`
  body += `<g transform="translate(${x} ${ty + H * 4 + 4})">${toSvgBody(compose({ arms: 'up', eyes: 'happy', props: [{ g: 'sparkle', x: 0, y: 0, c: 'a' }, { g: 'sparkle', x: 19, y: 3, c: 'c' }] }), mascotPalette(n), 4)}</g>`
  body += `<text x="${x}" y="${ty + H * 8 + 24}" style="font:500 11px ui-sans-serif,system-ui,sans-serif;fill:${th.text}">${th.label}</text>`
})
const height = ty + H * 8 + 50

writeFileSync(
  new URL('./sheet.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="${t.bg}"/>${body}</svg>`,
)
console.log('wrote sheet.svg', width + 'x' + height)
