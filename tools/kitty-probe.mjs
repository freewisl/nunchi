// Checks what this terminal can do with kitty graphics, the way Claude Code draws an Image:
//   1. does it answer the kitty graphics query?
//   2. does it draw an image placed directly at the cursor?
//   3. does it draw an image through Unicode placeholders (what Claude Code's Image uses)?
// Run it straight in a terminal pane (in Orca: a new terminal tab), not through Claude Code's `!`.
//   node tools/kitty-probe.mjs
import { smoothScene, paint } from '../hooks/mascot/smooth.js'
import { rasterize } from '../hooks/mascot/raster.js'
import { mascotPalette } from '../hooks/mascot/themes.js'

const write = (s) => process.stdout.write(s)
const COLS = 16
const ROWS = 5
// the first row/column diacritics of kitty's placeholder table
const DIACRITICS = [0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346, 0x034a, 0x034b, 0x034c, 0x0350, 0x0351, 0x0352, 0x0357]

function transmit(img, keys) {
  const data = Buffer.from(img.rgba.buffer, img.rgba.byteOffset, img.rgba.byteLength).toString('base64')
  let out = ''
  for (let i = 0; i < data.length; i += 4096) {
    const more = i + 4096 < data.length ? 1 : 0
    out += `\x1b_G${i === 0 ? `${keys},f=32,s=${img.width},v=${img.height},q=2,m=${more}` : `m=${more},q=2`};${data.slice(i, i + 4096)}\x1b\\`
  }
  return out
}

// 1. the query, followed by DA1: a terminal that knows kitty graphics answers the query first
async function query() {
  if (!process.stdin.isTTY) return 'no TTY on stdin (run it directly in a terminal)'
  process.stdin.setRawMode(true)
  process.stdin.resume()
  let got = ''
  const onData = (d) => (got += d.toString('latin1'))
  process.stdin.on('data', onData)
  write('\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\\x1b[c')
  await new Promise((r) => setTimeout(r, 700))
  process.stdin.off('data', onData)
  process.stdin.setRawMode(false)
  process.stdin.pause()
  const kitty = /\x1b_Gi=31;([^\x1b]*)\x1b\\/.exec(got)
  const da1 = /\x1b\[\?[\d;]*c/.test(got)
  if (kitty) return 'answered: ' + kitty[1]
  return da1 ? 'no answer (the terminal answered DA1 but not the kitty query)' : 'no answer at all'
}

const img = rasterize(paint(smoothScene('wave', 140), mascotPalette('claude')), 2)

const answer = await query()
write('\n1. kitty graphics query: ' + answer + '\n')

write('\n2. direct placement (an image at the cursor):\n')
write('\n'.repeat(ROWS) + `\x1b[${ROWS}A\r` + transmit(img, `a=T,i=4241,c=${COLS},r=${ROWS},C=1`) + `\x1b[${ROWS}B\r`)

write('\n3. Unicode placeholders (how Claude Code draws an Image):\n')
write(transmit(img, 'a=t,i=42') + `\x1b_Ga=p,U=1,i=42,c=${COLS},r=${ROWS},q=2\x1b\\`)
for (let r = 0; r < ROWS; r++) {
  let line = '\x1b[38;5;42m'
  for (let c = 0; c < COLS; c++) line += '\u{10EEEE}' + String.fromCodePoint(DIACRITICS[r]) + String.fromCodePoint(DIACRITICS[c])
  write(line + '\x1b[39m\n')
}

write('\nSee the mascot in 2 and 3? Then Claude Code can draw it too (start it with CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1).\n')
write('Only in 2? The terminal draws images but not placeholders, so Claude Code\'s Image stays text there.\n')
write('In neither? Turn on Inline Images (Orca: Settings › Terminal) or use another terminal.\n\n')
write(`\x1b_Ga=d,d=I,i=4241,q=2\x1b\\`)
