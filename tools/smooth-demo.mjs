// Shows the smooth mascot in this terminal with the kitty graphics protocol: what the mod draws
// as an Image where the terminal can show pictures (kitty, Ghostty, WezTerm, Orca with Inline
// Images on). Run it straight in a terminal pane, not through Claude Code's `!`.
//
//   node tools/smooth-demo.mjs                  every motion, four moments each
//   node tools/smooth-demo.mjs --theme ocean    another theme
//   node tools/smooth-demo.mjs --live [motion]  animated at 12 fps; Ctrl-C to stop
import { SMOOTH_MOTION_NAMES, SMOOTH_MOTIONS, smoothScene, paint } from '../plugins/nunchi/hooks/mascot/smooth.js'
import { rasterize } from '../plugins/nunchi/hooks/mascot/raster.js'
import { mascotPalette } from '../plugins/nunchi/hooks/mascot/themes.js'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i < 0 ? null : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true
}
const themeName = typeof opt('--theme') === 'string' ? opt('--theme') : 'claude'
const pal = mascotPalette(themeName)
const COLS = 16
const ROWS = 5
const SCALE = 2
const write = (s) => process.stdout.write(s)
const dim = (s) => '\x1b[2m' + s + '\x1b[0m'

// one image, transmitted and placed at the cursor without moving it
function kitty(img, cols, rows, id) {
  const data = Buffer.from(img.rgba.buffer, img.rgba.byteOffset, img.rgba.byteLength).toString('base64')
  let out = ''
  for (let i = 0; i < data.length; i += 4096) {
    const more = i + 4096 < data.length ? 1 : 0
    const keys = i === 0 ? `a=T,f=32,s=${img.width},v=${img.height},c=${cols},r=${rows},C=1,q=2,i=${id},m=${more}` : `m=${more},q=2`
    out += `\x1b_G${keys};${data.slice(i, i + 4096)}\x1b\\`
  }
  return out
}
const forget = (id) => `\x1b_Ga=d,d=I,i=${id},q=2\x1b\\`

// frames side by side in one image
function strip(frames) {
  const w = frames[0].width
  const h = frames[0].height
  const gap = Math.round(w / 8)
  const W = frames.length * w + (frames.length - 1) * gap
  const rgba = new Uint8Array(W * h * 4)
  frames.forEach((f, k) => {
    for (let y = 0; y < h; y++) rgba.set(f.rgba.subarray(y * w * 4, (y + 1) * w * 4), (y * W + k * (w + gap)) * 4)
  })
  return { rgba, width: W, height: h }
}

const frame = (motion, t) => rasterize(paint(smoothScene(motion, t), pal), SCALE)

// make room for an image below the cursor, place it, and step past it
function placeBelow(img, cols, id) {
  write('\n'.repeat(ROWS) + `\x1b[${ROWS}A\r` + kitty(img, cols, ROWS, id) + `\x1b[${ROWS}B\r`)
}

const env = [process.env.TERM_PROGRAM, process.env.ORCA_IMAGE_PROTOCOL && 'ORCA_IMAGE_PROTOCOL=' + process.env.ORCA_IMAGE_PROTOCOL].filter(Boolean).join(' · ')
write(dim(`smooth mascot · theme ${themeName} · ${env || 'unknown terminal'} · nothing below? this terminal has no kitty graphics (in Orca: Settings › Terminal › Inline Images)`) + '\n')

if (opt('--live')) {
  const only = typeof opt('--live') === 'string' ? opt('--live') : null
  const list = only ? [only] : SMOOTH_MOTION_NAMES
  const SHOW_MS = 4000
  const start = Date.now()
  let id = 900
  write('\x1b[?25l\n' + '\n'.repeat(ROWS))
  const quit = () => {
    write(forget(900) + forget(901) + '\x1b[?25h\n')
    process.exit(0)
  }
  process.on('SIGINT', quit)
  setInterval(() => {
    const t = Date.now() - start
    const motion = list[Math.floor(t / SHOW_MS) % list.length]
    const next = id === 900 ? 901 : 900
    write(`\x1b[${ROWS + 1}A\r\x1b[2K` + dim(motion) + '\n\r' + kitty(frame(motion, t), COLS, ROWS, next) + forget(id) + `\x1b[${ROWS}B\r`)
    id = next
  }, 83)
} else {
  let id = 100
  for (const m of SMOOTH_MOTION_NAMES) {
    write('\n' + m + '\n')
    const loop = SMOOTH_MOTIONS[m].loop
    placeBelow(strip([0, 1, 2, 3].map((i) => frame(m, (loop * i) / 4))), COLS * 4 + 6, id++)
  }
  write('\n')
}
