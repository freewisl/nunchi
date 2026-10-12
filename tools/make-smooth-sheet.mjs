// Writes tools/smooth-sheet.png: every smooth motion at six moments, rasterized exactly as a
// kitty-graphics terminal will get it, over the theme's background.
// node tools/make-smooth-sheet.mjs [theme]
import { writeFileSync } from 'fs'
import { SMOOTH_MOTION_NAMES, SMOOTH_MOTIONS, smoothScene, paint } from '../plugins/nunchi/hooks/mascot/smooth.js'
import { rasterize } from '../plugins/nunchi/hooks/mascot/raster.js'
import { theme, mascotPalette } from '../plugins/nunchi/hooks/mascot/themes.js'
import { png } from './png.mjs'

const name = process.argv[2] ?? 'claude'
const pal = mascotPalette(name)
const bg = theme(name).bg
const SCALE = 2
const SAMPLES = 6
const PAD = 8
const sample = rasterize(paint(smoothScene('idle', 0), pal), SCALE)
const FW = sample.width
const FH = sample.height
const COLS = 2
const PER_COL = Math.ceil(SMOOTH_MOTION_NAMES.length / COLS)
const W = COLS * (SAMPLES * (FW + PAD) + PAD * 3)
const H = PER_COL * (FH + PAD) + PAD
const img = new Uint8Array(W * H * 4)
const [br, bgc, bb] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16))
for (let i = 0; i < img.length; i += 4) img.set([br, bgc, bb, 255], i)

function blit(src, ox, oy) {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const s = (y * src.width + x) * 4
      const a = src.rgba[s + 3] / 255
      if (!a) continue
      const d = ((oy + y) * W + ox + x) * 4
      for (let k = 0; k < 3; k++) img[d + k] = Math.round(src.rgba[s + k] * a + img[d + k] * (1 - a))
    }
}

SMOOTH_MOTION_NAMES.forEach((m, k) => {
  const ox = Math.floor(k / PER_COL) * (SAMPLES * (FW + PAD) + PAD * 3) + PAD
  const oy = (k % PER_COL) * (FH + PAD) + PAD
  const loop = SMOOTH_MOTIONS[m].loop
  for (let i = 0; i < SAMPLES; i++) blit(rasterize(paint(smoothScene(m, (loop * i) / SAMPLES), pal), SCALE), ox + i * (FW + PAD), oy)
})

writeFileSync(new URL('./smooth-sheet.png', import.meta.url), png(W, H, img))
console.log('wrote smooth-sheet.png', W + 'x' + H, '· frame', FW + 'x' + FH)
