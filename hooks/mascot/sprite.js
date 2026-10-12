// The mascot as pixel art: one body, put together from parts (eyes, arms, legs) plus props,
// so a motion is a list of small specs instead of hand-drawn frames. Pure, no $.
//
// Pixels are palette keys: b body, s shade, e eye, p prop, a accent, c cool, g gray, h hot, . empty.

export const W = 22
export const H = 10

// body rectangle, in unflipped coordinates
const BODY = { x0: 4, x1: 15, y0: 3, y1: 7 }

const EYES = {
  open: [[6, 4], [6, 5], [13, 4], [13, 5]],
  closed: [[6, 5], [7, 5], [12, 5], [13, 5]],
  happy: [[6, 4], [7, 4], [5, 5], [8, 5], [12, 4], [13, 4], [11, 5], [14, 5]],
  up: [[6, 4], [13, 4]],
  down: [[6, 5], [6, 6], [13, 5], [13, 6]],
  left: [[5, 4], [5, 5], [12, 4], [12, 5]],
  right: [[7, 4], [7, 5], [14, 4], [14, 5]],
  wide: [[6, 4], [7, 4], [6, 5], [7, 5], [12, 4], [13, 4], [12, 5], [13, 5]],
  x: [[5, 4], [7, 4], [6, 5], [5, 6], [7, 6], [12, 4], [14, 4], [13, 5], [12, 6], [14, 6]],
}

const ARM_L = {
  rest: [[2, 5], [3, 5]],
  up: [[3, 4], [2, 3], [2, 2]],
  down: [[3, 6], [2, 7]],
}
const ARM_R = {
  rest: [[16, 5], [17, 5]],
  up: [[16, 4], [17, 3], [17, 2]],
  down: [[16, 6], [17, 7]],
  wave: [[16, 4], [17, 4], [18, 3]],
}
const ARMS = {
  rest: [ARM_L.rest, ARM_R.rest],
  up: [ARM_L.up, ARM_R.up],
  down: [ARM_L.down, ARM_R.down],
  waveA: [ARM_L.rest, ARM_R.up],
  waveB: [ARM_L.rest, ARM_R.wave],
  typeA: [ARM_L.rest, ARM_R.rest],
  typeB: [ARM_L.rest, ARM_R.down],
  danceA: [ARM_L.up, ARM_R.down],
  danceB: [ARM_L.down, ARM_R.up],
}

const LEG_X = [5, 7, 12, 14]
const LEGS = {
  stand: LEG_X.flatMap((x) => [[x, 8], [x, 9]]),
  walkA: [[5, 8], [5, 9], [12, 8], [12, 9], [7, 8], [14, 8]],
  walkB: [[7, 8], [7, 9], [14, 8], [14, 9], [5, 8], [12, 8]],
  tuck: LEG_X.map((x) => [x, 8]),
  none: [],
}

// props: rows of palette keys; '1' takes the color the placement names
export const GLYPHS = {
  bang: ['11', '11', '11', '..', '11'],
  ask: ['.11.', '1..1', '..1.', '....', '..1.'],
  zBig: ['11111', '...1.', '..1..', '.1...', '11111'],
  dot: ['1'],
  sparkle: ['.1.', '111', '.1.'],
  drop: ['1', '1'],
  speed: ['11', '..', '11'],
  laptopA: ['gggg', 'gccg', 'gcpg', 'gggg', 'ggggg'],
  laptopB: ['gggg', 'gpcg', 'gccg', 'gggg', 'ggggg'],
  bookA: ['cppppc', 'cppppc', 'cccccc'],
  bookB: ['cppgpc', 'cpppgc', 'cccccc'],
}

const blank = () => Array.from({ length: H }, () => Array(W).fill('.'))

function stamp(grid, x, y, key) {
  if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = key
}

// spec: { dx, dy, eyes, arms, legs, flip, props: [{ g, x, y, c, body }] }
export function compose(spec = {}) {
  const { dx = 0, dy = 0, eyes = 'open', arms = 'rest', legs = 'stand', flip = false, props = [] } = spec
  const body = blank()
  for (let y = BODY.y0; y <= BODY.y1; y++) for (let x = BODY.x0; x <= BODY.x1; x++) body[y][x] = 'b'
  for (const [x, y] of EYES[eyes] ?? EYES.open) body[y][x] = 'e'
  for (const side of ARMS[arms] ?? ARMS.rest) for (const [x, y] of side) body[y][x] = 'b'
  for (const [x, y] of LEGS[legs] ?? LEGS.stand) body[y][x] = 's'

  const grid = blank()
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = body[y][x]
      if (k === '.') continue
      stamp(grid, (flip ? W - 1 - x : x) + dx, y + dy, k)
    }
  // props keep their own orientation; a flip only moves them to the other side
  for (const p of props) {
    const rows = GLYPHS[p.g]
    const gw = Math.max(...rows.map((r) => r.length))
    const px = (flip ? W - p.x - gw : p.x) + (p.body ? dx : 0)
    const py = p.y + (p.body ? dy : 0)
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]
        if (ch !== '.') stamp(grid, px + i, py + j, ch === '1' ? p.c ?? 'p' : ch)
      }
    })
  }
  return grid.map((r) => r.join(''))
}

// ---------- motions: [spec, ms] frames, looped ----------

const SIT = { dy: 2, legs: 'none' }
const bang = { g: 'bang', x: 19, y: 0, c: 'h' }
const ask = { g: 'ask', x: 18, y: 0, c: 'a' }

export const MOTIONS = {
  idle: [
    [{}, 2600],
    [{ eyes: 'closed' }, 140],
    [{}, 1800],
    [{ eyes: 'closed' }, 140],
    [{}, 400],
    [{ eyes: 'closed' }, 140],
  ],
  look: [
    [{ eyes: 'left' }, 800],
    [{}, 300],
    [{ eyes: 'right' }, 800],
    [{}, 300],
    [{ eyes: 'up' }, 600],
    [{ eyes: 'closed' }, 140],
  ],
  walk: [
    [{ legs: 'walkA' }, 220],
    [{ legs: 'walkB' }, 220],
  ],
  run: [
    [{ legs: 'walkA', props: [{ g: 'speed', x: 0, y: 4, c: 'g' }] }, 110],
    [{ legs: 'walkB', dy: -1, props: [{ g: 'speed', x: 0, y: 3, c: 'g' }] }, 110],
  ],
  jump: [
    [{ dy: 1, legs: 'tuck', eyes: 'closed' }, 180],
    [{ dy: -2, legs: 'tuck', arms: 'up', eyes: 'happy' }, 380],
    [{ dy: -1 }, 120],
    [{}, 600],
  ],
  sleep: [
    [{ ...SIT, eyes: 'closed', props: [{ g: 'zBig', x: 17, y: 2, c: 'p' }] }, 1000],
    [{ ...SIT, eyes: 'closed', props: [{ g: 'zBig', x: 17, y: 0, c: 'p' }] }, 1000],
  ],
  work: [
    [{ eyes: 'right', arms: 'typeA', props: [{ g: 'laptopA', x: 17, y: 4 }] }, 180],
    [{ eyes: 'right', arms: 'typeB', props: [{ g: 'laptopB', x: 17, y: 4 }] }, 180],
  ],
  think: [
    [{ eyes: 'up', props: [{ g: 'dot', x: 9, y: 1 }] }, 350],
    [{ eyes: 'up', props: [{ g: 'dot', x: 9, y: 1 }, { g: 'dot', x: 11, y: 1 }] }, 350],
    [{ eyes: 'up', props: [{ g: 'dot', x: 9, y: 1 }, { g: 'dot', x: 11, y: 1 }, { g: 'dot', x: 13, y: 1 }] }, 500],
    [{ eyes: 'up' }, 300],
  ],
  read: [
    [{ eyes: 'down', props: [{ g: 'bookA', x: 7, y: 5 }] }, 2000],
    [{ eyes: 'down', props: [{ g: 'bookB', x: 7, y: 5 }] }, 180],
  ],
  ask: [
    [{ eyes: 'wide', arms: 'waveA', props: [ask] }, 320],
    [{ eyes: 'wide', arms: 'waveB', props: [ask] }, 320],
  ],
  error: [
    [{ dx: -1, eyes: 'x', props: [bang] }, 90],
    [{ dx: 1, eyes: 'x', props: [bang] }, 90],
    [{ dx: -1, eyes: 'x', props: [bang] }, 90],
    [{ dx: 1, eyes: 'x', props: [bang] }, 90],
    [{ eyes: 'x', props: [bang, { g: 'drop', x: 2, y: 1, c: 'c' }] }, 900],
  ],
  celebrate: [
    [{ dy: -1, legs: 'tuck', arms: 'up', eyes: 'happy', props: [{ g: 'sparkle', x: 0, y: 0, c: 'a' }, { g: 'sparkle', x: 19, y: 3, c: 'c' }] }, 220],
    [{ arms: 'up', eyes: 'happy', props: [{ g: 'sparkle', x: 19, y: 0, c: 'a' }, { g: 'sparkle', x: 0, y: 4, c: 'c' }] }, 220],
  ],
  wave: [
    [{ eyes: 'happy', arms: 'waveA' }, 280],
    [{ eyes: 'happy', arms: 'waveB' }, 280],
  ],
  dance: [
    [{ dx: -1, arms: 'danceA', legs: 'walkA', eyes: 'happy' }, 240],
    [{ dx: 1, arms: 'danceB', legs: 'walkB', eyes: 'happy' }, 240],
  ],
}

export const MOTION_NAMES = Object.keys(MOTIONS)

// which of a motion's frames shows at `ms` into it
export function frameIndex(motion, ms) {
  const frames = MOTIONS[motion] ?? MOTIONS.idle
  const total = frames.reduce((n, [, d]) => n + d, 0)
  let t = ((ms % total) + total) % total
  for (let i = 0; i < frames.length; i++) {
    if (t < frames[i][1]) return i
    t -= frames[i][1]
  }
  return 0
}

// the frame a motion shows at `ms` into it
export function frameAt(motion, ms, flip = false) {
  const frames = MOTIONS[motion] ?? MOTIONS.idle
  return compose({ ...frames[frameIndex(motion, ms)][0], flip })
}

// every distinct frame of a motion, for sheets and previews
export function framesOf(motion, flip = false) {
  return (MOTIONS[motion] ?? MOTIONS.idle).map(([spec, ms]) => ({ grid: compose({ ...spec, flip }), ms }))
}
