// Prints the mascot in this terminal the way the mod will draw it there: half-block text in
// 24-bit color, no image protocol. Run it inside Orca (or any terminal) to check the look.
//
//   node tools/term-demo.mjs                 every motion, frame by frame (claude theme)
//   node tools/term-demo.mjs --theme ocean   the same in another theme
//   node tools/term-demo.mjs --themes        every theme side by side
//   node tools/term-demo.mjs --live [motion] animated; Ctrl-C to stop
import { MOTION_NAMES, framesOf, frameAt, compose, W } from '../plugins/nunchi/hooks/mascot/sprite.js'
import { THEME_NAMES, theme, mascotPalette } from '../plugins/nunchi/hooks/mascot/themes.js'
import { toCells, toAnsi } from '../plugins/nunchi/hooks/mascot/render.js'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true)
}
const themeName = typeof opt('--theme') === 'string' ? opt('--theme') : 'claude'
const pal = mascotPalette(themeName)
const out = (s) => process.stdout.write(s + '\n')
const dim = (s) => '\x1b[2m' + s + '\x1b[0m'
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length))

// side by side: blocks of equal height, two spaces apart
function row(blocks) {
  const lines = []
  for (let i = 0; i < blocks[0].length; i++) lines.push(blocks.map((b) => b[i]).join('  '))
  return lines
}

if (opt('--themes')) {
  out(THEME_NAMES.map((n) => pad(theme(n).label, W)).join('  '))
  for (const l of row(THEME_NAMES.map((n) => toAnsi(toCells(compose({}), mascotPalette(n)))))) out(l)
  for (const l of row(THEME_NAMES.map((n) => toAnsi(toCells(compose({ arms: 'up', eyes: 'happy', props: [{ g: 'sparkle', x: 0, y: 0, c: 'a' }, { g: 'sparkle', x: 19, y: 3, c: 'c' }] }), mascotPalette(n)))))) out(l)
} else if (opt('--live')) {
  const only = typeof opt('--live') === 'string' ? opt('--live') : null
  const list = only ? [only] : MOTION_NAMES
  const start = Date.now()
  const SHOW_MS = 3500
  let drawn = 0
  process.stdout.write('\x1b[?25l')
  process.on('SIGINT', () => {
    process.stdout.write('\x1b[?25h\n')
    process.exit(0)
  })
  setInterval(() => {
    const t = Date.now() - start
    const motion = list[Math.floor(t / SHOW_MS) % list.length]
    const lines = [dim(pad(motion + ' · ' + themeName, W + 10)), ...toAnsi(toCells(frameAt(motion, t), pal))]
    if (drawn) process.stdout.write('\x1b[' + drawn + 'A')
    for (const l of lines) process.stdout.write('\x1b[2K' + l + '\n')
    drawn = lines.length
  }, 50)
} else {
  out(dim('theme ' + themeName + ' · ' + MOTION_NAMES.length + ' motions · each frame is ' + W + ' columns × ' + toCells(compose({}), pal).length + ' rows'))
  for (const m of MOTION_NAMES) {
    out('')
    out(m)
    for (const l of row(framesOf(m).map((f) => toAnsi(toCells(f.grid, pal))))) out(l)
  }
}
