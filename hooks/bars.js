// Bars drawn with the terminal's own glyphs and colors, one per style. Pure, no $.
//
// A bar is a list of spans { text, tone?, bg? }; tones are theme keys, with a shade after `~`
// (mascot/themes.js `color`: lo, lite, mid, hi, deep, bg). `fill` is the lit part as [from, to]
// fractions of the width: [0, p] for progress, a window moving along for an activity sweep. `label`
// is spans too; solid and pixel carry it inside the bar, the others after it. `frame` moves the
// animations (one per FRAME_MS, 100 ms, in register.js); an `active` bar shimmers and pulses where
// the others keep still (every bar, under motion all). `marks` are the fractions ticks go at: the
// plan's step boundaries, else the quarters.
//
//   solid     a filled bar with its label inside; a light band sweeps the filled part
//   pixel     braille dots each twinkling on its own, brighter toward the head ⣟, a pill label
//   segments  ▰▰▰▰▰▱▱▱, the segment after the fill blinking
//   line      ━━━━━╸──┼──, the head pulsing
//   blocks    ██████▍░░░, a light band sweeping the blocks, the edge pulsing
//   dots      ●─●─◉┄○ a dot per step, the current one twinkling; ● ● ◐ ○ ○ for a meter, its edge
//   spark     ━━──── and ▁▂▃▅▇ the readings so far, the newest pulsing

export const BAR_STYLES = ['solid', 'pixel', 'segments', 'line', 'blocks', 'dots', 'spark']

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const LEVELS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const QUARTERS = [0.25, 0.5, 0.75]
const level = (pct) => LEVELS[Math.max(0, Math.min(7, Math.floor((pct / 100) * 8)))]
const textOf = (spans) => spans.map((s) => s.text).join('')
// cells a character or a string takes: wide (CJK, Hangul, fullwidth) characters take two
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/
export const cellsOf = (c) => (WIDE.test(c) ? 2 : 1)
export const widthOf = (s) => [...String(s)].reduce((n, c) => n + cellsOf(c), 0)

// a well-mixed number for cell i (and a salt), the same every time
function hash(i, salt = 0) {
  let x = Math.imul(i * 7919 + salt * 104729 + 12345, 2654435761) >>> 0
  x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0
  return (x ^ (x >>> 13)) >>> 0
}

// cell i's braille dots: fixed, two to five of the eight
function dotsOf(i) {
  const x = hash(i, 1)
  let bits = 0
  for (let k = 0; k < 8; k++) if (((x >>> (k * 4)) & 15) < 6) bits |= 1 << k
  return String.fromCodePoint(0x2800 + (bits || 1 << (x % 8)))
}

// how dim cell i is at `frame`, 0 (bright) to 1: each cell twinkles on a period of its own (1.9
// to 3.3 s), easing in and out, so the bar shimmers unevenly instead of blinking as one
const PERIODS = [22, 28, 19, 33]
function dimness(i, frame) {
  const p = PERIODS[hash(i, 7) % PERIODS.length]
  const at = ((frame + (hash(i, 3) % p)) % p) / p
  return (1 - Math.cos(2 * Math.PI * at)) / 2
}
// a dimness as a shade: none, mid or lo
const shadeOf = (d) => (d > 0.42 ? '~lo' : d > 0.14 ? '~mid' : '')

// a pulse, on for half of `period` frames (1.2 s by default)
const pulse = (frame, period = 12) => frame % period < period / 2

// a light band sweeping cells [x, y): its middle at `frame`, two cells a frame, with a pause
// after each pass; the cells by it lighter, brightest at the middle
function sweep(frame, x, y) {
  if (y - x < 2) return () => ''
  const period = Math.ceil((y - x + 6) / 2) + 4
  const c = x - 3 + 2 * (frame % period)
  return (i) => (Math.abs(i - c) <= 1 ? '~hi' : Math.abs(i - c) === 2 ? '~lite' : '')
}

// the cells [a, b) of `width` that `fill` lights
function litCells(fill, width) {
  const a = Math.max(0, Math.min(width, Math.round(fill[0] * width)))
  const b = Math.max(a, Math.min(width, Math.round(fill[1] * width)))
  return [a, b]
}

// spans for cells [0, n), cell i drawn by draw(i); neighbours alike share a span
function run(n, draw) {
  const out = []
  for (let i = 0; i < n; i++) {
    const s = draw(i)
    const last = out[out.length - 1]
    if (last && last.tone === s.tone && last.bg === s.bg && last.bold === s.bold) last.text += s.text
    else out.push({ ...s })
  }
  return out
}

// the cells of `width` the marks fall on
const markCells = (marks, width) => new Set((marks ?? QUARTERS).map((f) => Math.round(f * width)).filter((c) => c > 0 && c < width))

export function drawBar(style, { fill, tone, label = [], width = 24, hist = [], steps = null, frame = 0, active = false, marks = null }) {
  const [a, b] = litCells(fill, width)
  const after = label.length ? [{ text: ' ' }, ...label] : []
  const ticks = markCells(marks, width)
  switch (style) {
    case 'solid': {
      // the label rides inside; the lit part is the tone with a deep shade of it as ink, the rest
      // the track with the label in its own colors; while active a lighter band sweeps the lit part
      // the track; a wide character (Hangul, CJK) takes two of the width's cells
      const inks = [' ', ...label.flatMap((s) => [...s.text].map(() => s.tone || 'text')), ' ']
      const chars = [...(' ' + textOf(label) + ' ')]
      for (let used = widthOf(chars.join('')); used < width; used++) chars.push(' ')
      const at = [] // the cell each character starts at
      const w = chars.reduce((cell, c, i) => ((at[i] = cell), cell + cellsOf(c)), 0)
      const [x, y] = litCells(fill, w)
      const glow = active ? sweep(frame, x, y) : () => ''
      return run(chars.length, (i) => {
        if (at[i] < x || at[i] >= y) return { text: chars[i], tone: inks[i] && inks[i] !== ' ' ? inks[i] : 'dim', bg: 'track' }
        return { text: chars[i], tone: tone + '~deep', bg: tone + glow(at[i]) }
      })
    }
    case 'pixel': {
      // dots over the lit part, dimmer toward the tail and each twinkling on its own, a dense head
      // where the fill ends; the label as a pill right after; the track runs on to the width with
      // its ticks, the whole bar the same width whatever the label
      const pill = ' ' + textOf(label) + ' '
      const pillW = widthOf(pill)
      const head = fill[0] === 0 && b > a && b < width ? b - 1 : -1
      const lit = run(b, (i) => {
        if (i < a) return { text: ' ', bg: 'track' }
        if (ticks.has(i) && i !== head) return { text: '╎', tone: 'text', bg: 'track' }
        if (i === head) return { text: '⣟', tone: tone + '~hi', bg: 'track' }
        const rel = (i - a) / Math.max(1, b - a)
        return { text: dotsOf(i), tone: tone + shadeOf(dimness(i, frame) * 0.55 + (rel < 0.34 ? 0.28 : 0)), bg: 'track' }
      })
      const rest = Math.max(0, width - b - pillW)
      return [
        ...lit,
        { text: pill, tone: tone + '~deep', bg: tone },
        ...run(rest, (j) => (ticks.has(b + pillW + j) ? { text: '╎', tone: 'dim~lo', bg: 'track' } : { text: ' ', bg: 'track' })),
      ]
    }
    case 'segments': {
      // while active the segment being worked on (the first unlit one) blinks half lit
      const working = active && fill[0] === 0 && b < width ? b : -1 // the segment after the fill
      return [
        ...run(width, (i) => {
          if (i >= a && i < b) return { text: '▰', tone }
          if (i === working) return { text: '▰', tone: pulse(frame) ? tone + '~lo' : 'track' }
          return { text: '▱', tone: 'track' }
        }),
        ...after,
      ]
    }
    case 'line': {
      // the head glows in the text color, pulsing while active; ticks on the track
      const head = b < width && b > a ? b : -1
      return [
        ...run(width, (i) => {
          if (i >= a && i < b) return { text: '━', tone }
          if (i === head) return { text: '╸', tone: !active || pulse(frame) ? 'text' : tone }
          return ticks.has(i) ? { text: '┼', tone: 'dim~lo' } : { text: '─', tone: 'track' }
        }),
        ...after,
      ]
    }
    case 'blocks': {
      const exact = fill[0] === 0 ? fill[1] * width : b
      const full = fill[0] === 0 ? Math.floor(exact) : b
      // the eighths of the cell after the full ones, whichever way `b` rounded
      const part = fill[0] === 0 && full < width ? EIGHTHS[Math.floor((exact - full) * 8)] : ''
      // while active a light band sweeps the blocks and the edge pulses
      const glow = active ? sweep(frame, a, full) : () => ''
      const edge = active && pulse(frame) ? tone + '~hi' : tone
      return [
        ...run(width, (i) => (i >= a && i < full ? { text: '█', tone: tone + glow(i) } : i === full && part ? { text: part, tone: edge } : { text: '░', tone: 'track' })),
        ...after,
      ]
    }
    case 'dots': {
      if (steps && steps.length) {
        const out = []
        steps.forEach((s, i) => {
          if (i) out.push({ text: s === 'todo' ? '┄' : '─', tone: s === 'todo' ? 'track' : tone })
          if (s === 'now') out.push({ text: '◉', tone: active ? tone + shadeOf(dimness(i, frame)) : tone })
          else out.push({ text: s === 'done' ? '●' : '○', tone: s === 'done' ? tone : 'dim~lo' })
        })
        return [...out, ...after]
      }
      // a meter: ten dots, a half one where the fill ends between two; while active the last lit
      // one twinkles
      const exact = Math.max(0, Math.min(1, fill[1])) * 10
      const cells = []
      for (let i = 0; i < 10; i++) {
        const lit = i < Math.floor(exact) || (i === Math.floor(exact) && exact - i >= 0.75)
        const half = !lit && i === Math.floor(exact) && exact - i >= 0.25
        cells.push({ text: (lit ? '●' : half ? '◐' : '○') + ' ', tone: lit || half ? tone : 'dim~lo' })
      }
      let last = -1
      cells.forEach((c, i) => c.tone === tone && (last = i))
      if (active && last >= 0) cells[last] = { ...cells[last], tone: tone + shadeOf(dimness(last, frame)) }
      return [...run(10, (i) => cells[i]), ...label]
    }
    case 'spark': {
      // a slim bar, then the readings so far; while active the newest pulses (the bar's head
      // before there are any)
      const slim = Math.max(6, Math.round(width / 3))
      const [x, y] = litCells(fill, slim)
      const h = hist.slice(-12)
      const glow = active && pulse(frame, 16) ? tone + '~hi' : tone
      const out = run(slim, (i) => (i >= x && i < y ? { text: '━', tone: !h.length && i === y - 1 ? glow : tone } : { text: '─', tone: 'track' }))
      if (h.length) {
        out.push({ text: ' ' })
        if (h.length > 1) out.push({ text: h.slice(0, -1).map(level).join(''), tone })
        out.push({ text: level(h[h.length - 1]), tone: glow })
      }
      return [...out, ...after]
    }
    default:
      return drawBar('segments', { fill, tone, label, width, hist, steps, frame, active, marks })
  }
}

// a mini bar of `width` cells on the track's background, for the chips look: full cells in the
// tone, then an eighth-block cell, so a few percent still shows
export function miniBar(pct, tone, width = 5) {
  const exact = Math.max(0, Math.min(1, pct / 100)) * width
  const full = Math.floor(exact)
  let part = EIGHTHS[Math.floor((exact - full) * 8)]
  if (pct > 0 && !full && !part) part = EIGHTHS[1]
  const out = []
  if (full) out.push({ text: '█'.repeat(full), tone, bg: 'track' })
  if (part && full < width) out.push({ text: part, tone, bg: 'track' })
  const rest = width - full - (part && full < width ? 1 : 0)
  if (rest > 0) out.push({ text: ' '.repeat(rest), bg: 'track' })
  return out
}

// a ring glyph by quarter: ○ ◔ ◑ ◕ ●; anything above nothing shows at least a quarter
export const ring = (pct) => (pct <= 0 ? '○' : pct < 37.5 ? '◔' : pct < 62.5 ? '◑' : pct < 87.5 ? '◕' : '●')
