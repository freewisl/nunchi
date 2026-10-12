// The smooth mascot: the same character as sprite.js, drawn from rounded shapes and animated
// continuously (a motion is a function of time, not a list of frames). One scene, two outputs:
// an anti-aliased RGBA raster (raster.js) for terminals with kitty graphics, and SVG for Desktop.
// Pure, no $.
//
// A scene is a list of shapes in scene units (SW x SH), painted in order:
//   { t: 'rect', cx, cy, w, h, r, rot, fill, a }   rounded rectangle, rot in degrees (clockwise)
//   { t: 'cap', x1, y1, x2, y2, r, fill, a }        capsule: a line with round ends, radius r
//   { t: 'ell', cx, cy, rx, ry, fill, a }           ellipse
// Colors are palette keys (b body, s shade, e eye, p prop, a accent, c cool, g gray, h hot, k shadow)
// resolved by paint().

export const SW = 64
export const SH = 40

const TAU = Math.PI * 2
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (x) => {
  x = clamp01(x)
  return x * x * (3 - 2 * x)
}
const wave = (t, period, phase = 0) => Math.sin((t / period + phase) * TAU)
const rad = (deg) => (deg * Math.PI) / 180

// piecewise-smooth keyframes: [[ms, value], ...] sorted by ms
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]
    const [t0, v0] = keys[i - 1]
    if (t <= t1) return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0 || 1))
  }
  return keys[keys.length - 1][1]
}

// ---------- the character ----------

const BODY = { x: 12, y: 13, w: 32, h: 15, r: 2.6 }
const ORIGIN = { x: BODY.x + BODY.w / 2, y: BODY.y + BODY.h } // squash and tilt pivot: bottom center
const EYE_X = [18.7, 37.3]
const EYE_Y = 18.6
const SHOULDER_Y = 22.4
const ARM_LEN = 5.6
const LEG_X = [16, 21.3, 34.7, 40]
const HIP_Y = 27
const FOOT_Y = 33

// a group transform: scale about ORIGIN, rotate about ORIGIN, then move
function xf(st) {
  const { dx = 0, dy = 0, sx = 1, sy = 1, rot = 0 } = st
  const c = Math.cos(rad(rot))
  const s = Math.sin(rad(rot))
  const pt = (x, y) => {
    const X = (x - ORIGIN.x) * sx
    const Y = (y - ORIGIN.y) * sy
    return [ORIGIN.x + X * c - Y * s + dx, ORIGIN.y + X * s + Y * c + dy]
  }
  const k = (sx + sy) / 2
  return (sh) => {
    if (sh.t === 'rect') {
      const [cx, cy] = pt(sh.cx, sh.cy)
      return { ...sh, cx, cy, w: sh.w * sx, h: sh.h * sy, r: sh.r * k, rot: (sh.rot ?? 0) + rot }
    }
    if (sh.t === 'cap') {
      const [x1, y1] = pt(sh.x1, sh.y1)
      const [x2, y2] = pt(sh.x2, sh.y2)
      return { ...sh, x1, y1, x2, y2, r: sh.r * k }
    }
    const [cx, cy] = pt(sh.cx, sh.cy)
    return { ...sh, cx, cy, rx: sh.rx * sx, ry: sh.ry * sy }
  }
}

function eyes(e = {}) {
  const { kind = 'open', dx = 0, dy = 0, open = 1 } = e
  const out = []
  for (const x0 of EYE_X) {
    const x = x0 + dx
    const y = EYE_Y + dy
    if (kind === 'closed' || open < 0.2) out.push({ t: 'cap', x1: x - 1.8, y1: y + 1.2, x2: x + 1.8, y2: y + 1.2, r: 0.8, fill: 'e' })
    else if (kind === 'happy')
      out.push({ t: 'cap', x1: x - 2.2, y1: y + 1.4, x2: x, y2: y - 1, r: 0.85, fill: 'e' }, { t: 'cap', x1: x, y1: y - 1, x2: x + 2.2, y2: y + 1.4, r: 0.85, fill: 'e' })
    else if (kind === 'x')
      out.push({ t: 'cap', x1: x - 1.9, y1: y - 1.9, x2: x + 1.9, y2: y + 1.9, r: 0.8, fill: 'e' }, { t: 'cap', x1: x - 1.9, y1: y + 1.9, x2: x + 1.9, y2: y - 1.9, r: 0.8, fill: 'e' })
    else {
      const w = kind === 'wide' ? 4.4 : 3
      const h = (kind === 'wide' ? 6.4 : 6) * open
      out.push({ t: 'rect', cx: x, cy: y, w, h, r: Math.min(1.5, h / 2), fill: 'e' })
    }
  }
  return out
}

// arm angles in degrees above horizontal (outward); 90 is straight up
function arms(l = 0, r = 0) {
  const sh = (x, deg, side) => {
    const a = rad(deg)
    return { t: 'cap', x1: x, y1: SHOULDER_Y, x2: x + side * Math.cos(a) * ARM_LEN, y2: SHOULDER_Y - Math.sin(a) * ARM_LEN, r: 2, fill: 'b' }
  }
  return [sh(BODY.x + 1, l, -1), sh(BODY.x + BODY.w - 1, r, 1)]
}

// legs: 'stand', 'tuck', 'hidden', or [{ fx, fy } x4] foot offsets
function legs(spec = 'stand') {
  if (spec === 'hidden') return []
  const feet = spec === 'stand' ? LEG_X.map(() => ({ fx: 0, fy: 0 })) : spec === 'tuck' ? LEG_X.map(() => ({ fx: 0, fy: -2.5 })) : spec
  return LEG_X.map((x, i) => ({ t: 'cap', x1: x, y1: HIP_Y, x2: x + feet[i].fx, y2: FOOT_Y - 1.5 + feet[i].fy, r: 1.5, fill: 's' }))
}

// st: { dx, dy, sx, sy, rot, eyes, armL, armR, legs, shadow, back: [...], front: [...], props: [...] }
// back/front are drawn with the body (they move with it); props stay where they are put
export function scene(st = {}) {
  const lift = Math.max(0, -(st.dy ?? 0))
  const shadow = { t: 'ell', cx: ORIGIN.x + (st.dx ?? 0) * 0.6, cy: 35.6, rx: 17 * (st.shadow ?? 1) * (1 - lift / 30), ry: 1.6, fill: 'k', a: 0.28 * (1 - lift / 20) }
  const body = [
    ...(st.back ?? []),
    ...legs(st.legs),
    ...arms(st.armL ?? 0, st.armR ?? 0),
    { t: 'rect', cx: BODY.x + BODY.w / 2, cy: BODY.y + BODY.h / 2, w: BODY.w, h: BODY.h, r: BODY.r, fill: 'b' },
    ...eyes(st.eyes),
    ...(st.front ?? []),
  ].map(xf(st))
  return [shadow, ...body, ...(st.props ?? [])]
}

// ---------- props ----------

const bang = (x, y, s = 1, a = 1) => [
  { t: 'cap', x1: x, y1: y, x2: x, y2: y + 5.5 * s, r: 1.6 * s, fill: 'h', a },
  { t: 'ell', cx: x, cy: y + 9 * s, rx: 1.6 * s, ry: 1.6 * s, fill: 'h', a },
]

const question = (x, y, a = 1) => {
  const pts = [[-3, 2], [-1.6, 0.3], [0.8, 0], [2.6, 1.4], [2.2, 3.6], [0, 5], [0, 6.6]]
  const out = []
  for (let i = 1; i < pts.length; i++) out.push({ t: 'cap', x1: x + pts[i - 1][0], y1: y + pts[i - 1][1], x2: x + pts[i][0], y2: y + pts[i][1], r: 1.25, fill: 'a', a })
  out.push({ t: 'ell', cx: x, cy: y + 9.6, rx: 1.4, ry: 1.4, fill: 'a', a })
  return out
}

const zee = (x, y, s, a) => [
  { t: 'cap', x1: x, y1: y, x2: x + 4 * s, y2: y, r: 0.8 * s, fill: 'p', a },
  { t: 'cap', x1: x + 4 * s, y1: y, x2: x, y2: y + 4 * s, r: 0.8 * s, fill: 'p', a },
  { t: 'cap', x1: x, y1: y + 4 * s, x2: x + 4 * s, y2: y + 4 * s, r: 0.8 * s, fill: 'p', a },
]

const sparkle = (x, y, s, fill, a = 1) => [
  { t: 'cap', x1: x - 3 * s, y1: y, x2: x + 3 * s, y2: y, r: 0.75 * s, fill, a },
  { t: 'cap', x1: x, y1: y - 3 * s, x2: x, y2: y + 3 * s, r: 0.75 * s, fill, a },
]

const dot = (x, y, a) => ({ t: 'ell', cx: x, cy: y, rx: 1.4, ry: 1.4, fill: 'p', a })

// ---------- motions: (t ms) -> scene state; loop is the period frames are taken over ----------

const blink = (t, at) => (at.some((s) => t >= s && t < s + 130) ? 0.1 : 1)

export const SMOOTH_MOTIONS = {
  idle: {
    loop: 4200,
    at: (t) => ({ sy: 1 + 0.025 * wave(t, 2100), eyes: { open: blink(t, [1900, 3600]) }, armL: 2 * wave(t, 2100), armR: 2 * wave(t, 2100) }),
  },
  look: {
    loop: 4000,
    at: (t) => ({
      sy: 1 + 0.02 * wave(t, 2000),
      eyes: { dx: kf(t, [[0, 0], [350, -1.6], [1200, -1.6], [1600, 1.6], [2500, 1.6], [2900, 0]]), dy: kf(t, [[2900, 0], [3200, -1.4], [3700, -1.4], [3950, 0]]), open: blink(t, [3750]) },
    }),
  },
  walk: {
    loop: 640,
    at: (t) => {
      const p = wave(t, 640)
      const feet = LEG_X.map((_, i) => {
        const s = i % 2 === 0 ? p : -p
        return { fx: 1.6 * s, fy: -1.4 * Math.max(0, s) }
      })
      return { dy: -0.8 * Math.abs(wave(t, 640, 0.25)), legs: feet, armL: 10 * p, armR: -10 * p }
    },
  },
  run: {
    loop: 380,
    at: (t) => {
      const p = wave(t, 380)
      const feet = LEG_X.map((_, i) => {
        const s = i % 2 === 0 ? p : -p
        return { fx: 2.4 * s, fy: -2 * Math.max(0, s) }
      })
      const slide = (t % 380) / 380
      return {
        rot: 6,
        dy: -1.2 * Math.abs(wave(t, 380, 0.25)),
        legs: feet,
        armL: 25 * p,
        armR: -25 * p,
        props: [
          { t: 'cap', x1: 6 - 4 * slide, y1: 17, x2: 10 - 4 * slide, y2: 17, r: 0.7, fill: 'g', a: 0.8 * (1 - slide) },
          { t: 'cap', x1: 3 - 4 * slide, y1: 22, x2: 9 - 4 * slide, y2: 22, r: 0.7, fill: 'g', a: 0.8 * (1 - slide) },
          { t: 'cap', x1: 5 - 4 * slide, y1: 27, x2: 8 - 4 * slide, y2: 27, r: 0.7, fill: 'g', a: 0.6 * (1 - slide) },
        ],
      }
    },
  },
  jump: {
    loop: 1500,
    at: (t) => {
      const dy = kf(t, [[0, 0], [180, 1], [520, -9], [700, -9], [880, 0], [1000, 0.6], [1150, 0]])
      const sy = kf(t, [[0, 1], [180, 0.84], [330, 1.1], [700, 1], [880, 1], [960, 0.86], [1150, 1]])
      const air = t > 250 && t < 860
      return { dy, sy, sx: 2 - sy, legs: air ? 'tuck' : 'stand', armL: air ? 55 : 0, armR: air ? 55 : 0, eyes: { kind: air ? 'happy' : 'open' } }
    },
  },
  sleep: {
    loop: 3200,
    at: (t) => {
      const props = []
      for (const k of [0, 1]) {
        const p = ((t / 3200 + k / 2) % 1 + 1) % 1
        props.push(...zee(48 + 6 * p, 14 - 13 * p, 0.6 + 0.6 * p, Math.sin(p * Math.PI)))
      }
      return { dy: 4, sy: 1 + 0.035 * wave(t, 3200), legs: 'hidden', eyes: { kind: 'closed' }, armL: -15, armR: -15, props }
    },
  },
  work: {
    loop: 1200,
    at: (t) => {
      const tap = Math.abs(Math.sin((t / 150) * Math.PI))
      const lines = [0, 1, 2].map((i) => ({ t: 'cap', x1: 52.5, y1: 22.5 + i * 2.2, x2: 52.5 + 2 + ((i * 3 + Math.floor(t / 300)) % 4) * 1.2, y2: 22.5 + i * 2.2, r: 0.45, fill: 'p', a: 0.85 }))
      return {
        eyes: { dx: 1.3, dy: 0.6, open: blink(t, [900]) },
        armL: -10,
        armR: -20 + 14 * tap,
        props: [
          { t: 'rect', cx: 56, cy: 25, w: 11, h: 8.6, r: 1.2, fill: 'g' },
          { t: 'rect', cx: 56, cy: 25, w: 9, h: 6.6, r: 0.8, fill: 'c', a: 0.55 + 0.25 * Math.abs(wave(t, 1200)) },
          ...lines,
          { t: 'rect', cx: 55, cy: 31.3, w: 14, h: 1.8, r: 0.9, fill: 'g' },
        ],
      }
    },
  },
  think: {
    loop: 2200,
    at: (t) => ({
      rot: -3 * smooth(t / 300) + 3 * smooth((t - 1900) / 300),
      eyes: { dx: 0.8, dy: -1.6, open: 0.75 },
      armL: 0,
      armR: 35,
      props: [0, 1, 2].map((k) => dot(26 + k * 5.5, 7 - k * 1.5, smooth((t - k * 320) / 200) * (1 - smooth((t - 1700) / 250)))),
    }),
  },
  read: {
    loop: 3400,
    at: (t) => {
      const f = clamp01((t - 2700) / 450)
      const turn = Math.cos(f * Math.PI)
      const page = f > 0 && f < 1 ? [{ t: 'rect', cx: 28 + 4.5 * turn, cy: 24.5, w: Math.max(0.4, 9 * Math.abs(turn)), h: 7, r: 0.4, fill: 'p' }] : []
      return {
        eyes: { dy: 1.4, open: blink(t, [1400]) },
        armL: -35,
        armR: -35,
        front: [
          { t: 'rect', cx: 28, cy: 24.5, w: 20, h: 9, r: 1, fill: 'c' },
          { t: 'rect', cx: 23.6, cy: 24.3, w: 8.4, h: 7, r: 0.4, fill: 'p' },
          { t: 'rect', cx: 32.4, cy: 24.3, w: 8.4, h: 7, r: 0.4, fill: 'p' },
          ...[0, 1, 2].flatMap((i) => [
            { t: 'cap', x1: 20.6, y1: 22.4 + i * 1.8, x2: 26.4, y2: 22.4 + i * 1.8, r: 0.3, fill: 'g', a: 0.6 },
            { t: 'cap', x1: 29.6, y1: 22.4 + i * 1.8, x2: 35.4, y2: 22.4 + i * 1.8, r: 0.3, fill: 'g', a: 0.6 },
          ]),
          ...page,
        ],
      }
    },
  },
  ask: {
    loop: 1200,
    at: (t) => ({
      rot: 2 * wave(t, 1200),
      eyes: { kind: 'wide' },
      armL: 0,
      armR: 60 + 25 * wave(t, 600),
      props: question(56, 1.2 + 0.8 * wave(t, 1200)),
    }),
  },
  error: {
    loop: 1800,
    at: (t) => {
      const decay = Math.max(0, 1 - t / 600)
      const drop = (t % 1800) / 1800
      return {
        dx: 2.2 * Math.sin(t / 40) * decay,
        eyes: { kind: 'x' },
        armL: -20,
        armR: -20,
        props: [
          ...bang(56, 1, 1 + 0.35 * Math.max(0, 1 - t / 220)),
          { t: 'ell', cx: 9, cy: 9 + 7 * drop, rx: 1.1, ry: 1.6, fill: 'c', a: 1 - drop },
        ],
      }
    },
  },
  celebrate: {
    loop: 900,
    at: (t) => {
      const hop = Math.sin(((t % 450) / 450) * Math.PI)
      const tw = (k) => 0.55 + 0.45 * Math.abs(Math.sin((t / 450 + k * 0.33) * Math.PI))
      return {
        dy: -5 * hop,
        sy: 1 + 0.06 * hop,
        legs: hop > 0.3 ? 'tuck' : 'stand',
        armL: 60 + 15 * wave(t, 450),
        armR: 60 + 15 * wave(t, 450, 0.5),
        eyes: { kind: 'happy' },
        props: [...sparkle(5, 7, tw(0), 'a'), ...sparkle(56, 4, tw(1), 'c'), ...sparkle(58, 22, tw(2) * 0.7, 'a'), ...sparkle(3, 24, tw(1.5) * 0.7, 'c')],
      }
    },
  },
  wave: {
    loop: 1000,
    at: (t) => ({ rot: 2 * wave(t, 1000), eyes: { kind: 'happy' }, armL: 0, armR: 65 + 28 * wave(t, 500) }),
  },
  dance: {
    loop: 1000,
    at: (t) => {
      const p = wave(t, 1000)
      return {
        rot: 8 * p,
        dx: 2 * p,
        dy: -2 * Math.abs(wave(t, 1000, 0.25)),
        armL: 70 * Math.max(0, p),
        armR: 70 * Math.max(0, -p),
        eyes: { kind: 'happy' },
        legs: LEG_X.map((_, i) => ({ fx: 0, fy: -1.6 * Math.max(0, i < 2 ? -p : p) })),
      }
    },
  },
}

export const SMOOTH_MOTION_NAMES = Object.keys(SMOOTH_MOTIONS)

// the scene a motion shows at t ms (looped), facing right, or left with flip
export function smoothScene(motion, t, flip = false) {
  const m = SMOOTH_MOTIONS[motion] ?? SMOOTH_MOTIONS.idle
  const shapes = scene(m.at(((t % m.loop) + m.loop) % m.loop))
  return flip ? shapes.map(mirror) : shapes
}

function mirror(sh) {
  if (sh.t === 'rect') return { ...sh, cx: SW - sh.cx, rot: -(sh.rot ?? 0) }
  if (sh.t === 'cap') return { ...sh, x1: SW - sh.x1, x2: SW - sh.x2 }
  return { ...sh, cx: SW - sh.cx }
}

// shapes with palette keys resolved to colors
export function paint(shapes, pal) {
  return shapes.map((sh) => ({ ...sh, fill: pal[sh.fill] ?? sh.fill }))
}

// ---------- SVG, for Desktop ----------

const n = (v) => +v.toFixed(2)

export function toSvgShapes(shapes) {
  let out = ''
  for (const sh of shapes) {
    const op = sh.a != null && sh.a < 1 ? ` opacity="${n(Math.max(0, sh.a))}"` : ''
    if (sh.t === 'rect') {
      const tr = sh.rot ? ` transform="rotate(${n(sh.rot)} ${n(sh.cx)} ${n(sh.cy)})"` : ''
      out += `<rect x="${n(sh.cx - sh.w / 2)}" y="${n(sh.cy - sh.h / 2)}" width="${n(sh.w)}" height="${n(sh.h)}" rx="${n(sh.r)}" fill="${sh.fill}"${op}${tr}/>`
    } else if (sh.t === 'cap') {
      out += `<line x1="${n(sh.x1)}" y1="${n(sh.y1)}" x2="${n(sh.x2)}" y2="${n(sh.y2)}" stroke="${sh.fill}" stroke-width="${n(sh.r * 2)}" stroke-linecap="round"${op}/>`
    } else {
      out += `<ellipse cx="${n(sh.cx)}" cy="${n(sh.cy)}" rx="${n(sh.rx)}" ry="${n(sh.ry)}" fill="${sh.fill}"${op}/>`
    }
  }
  return out
}
