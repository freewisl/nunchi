// Draws the README's pictures with nunchi's own drawing code, so they show what nunchi really
// draws: plugins/nunchi/assets/banner.svg, demo.svg (a session in the terminal) and styles.svg
// (every bar style, the one-line looks, the themes). They move as nunchi does, a frame every
// 100 ms, as SMIL animations a README on GitHub plays.
// node tools/make-readme-art.mjs

import { writeFileSync, mkdirSync } from 'fs'
import { BAR_STYLES } from '../plugins/nunchi/hooks/bars.js'
import { panelRows, panelBars, collapsedRow, widthOf } from '../plugins/nunchi/hooks/hud.js'
import { elapsed } from '../plugins/nunchi/hooks/mood.js'
import { THEME_NAMES, theme, color, mascotPalette } from '../plugins/nunchi/hooks/mascot/themes.js'
import { frameAt, W as PET_W, H as PET_H } from '../plugins/nunchi/hooks/mascot/sprite.js'
import { smoothScene, paint, toSvgShapes, SW, SH } from '../plugins/nunchi/hooks/mascot/smooth.js'

const OUT = new URL('../plugins/nunchi/assets/', import.meta.url)
const FRAME_MS = 100
const CW = 8.4 // a terminal cell at 14 px
const CH = 18
const PET_ROWS = PET_H / 2 // the terminal draws two sprite pixels a row
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace"
const SANS = "ui-sans-serif,-apple-system,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',sans-serif"
const CLAUDE = theme('claude')

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v) => +v.toFixed(2)

// ---------- time ----------

// `attr` stepping through `values`, one a frame, changing only where they change; null if they
// never do
function steps(attr, values, tag = 'animate', extra = '') {
  if (values.every((v) => v === values[0])) return null
  const at = []
  const vals = []
  values.forEach((v, i) => {
    if (i && v === values[i - 1]) return
    at.push((i / values.length).toFixed(4).replace(/\.?0+$/, '') || '0')
    vals.push(v)
  })
  return `<${tag} attributeName="${attr}"${extra} values="${vals.join(';')}" keyTimes="${at.join(';')}" dur="${values.length * FRAME_MS}ms" calcMode="discrete" repeatCount="indefinite"/>`
}

// ---------- the terminal: rows of spans as cells ----------

const BLANK = { ch: ' ', fg: '', bg: '', b: false }

// spans as cells { ch, fg, bg, b }, the colors read from the theme; a wide character takes two
function cellsOf(spans, th) {
  const out = []
  for (const s of spans)
    for (const ch of s.text) {
      const c = { ch, fg: color(th, s.tone || 'text') ?? th.text, bg: s.bg ? color(th, s.bg) : '', b: !!s.bold }
      out.push(c)
      if (widthOf(ch) === 2) out.push({ ...c, ch: '' })
    }
  return out
}

// a screen of text that changes frame by frame: `at(f)` gives frame f's rows of spans. A cell
// that never changes is drawn once (runs of one background as one rect, one color's characters as
// one text); a cell that changes gets animations of its colors, and a text for each character it
// shows, visible while it is the one
function screen(at, frames, th, ox, oy) {
  const grids = Array.from({ length: frames }, (_, f) => at(f).map((r) => cellsOf(r, th)))
  const height = Math.max(...grids.map((g) => g.length))
  let backs = ''
  let texts = ''
  let live = ''
  for (let y = 0; y < height; y++) {
    const width = Math.max(...grids.map((g) => (g[y] ? g[y].length : 0)))
    const py = oy + y * CH
    const base = n(py + 13.2)
    const inks = new Map()
    let back = null
    const endBack = () => {
      if (back) backs += `<rect x="${n(ox + back.x * CW)}" y="${py}" width="${n(back.w * CW + 0.4)}" height="${CH}" fill="${back.bg}"/>`
      back = null
    }
    for (let x = 0; x < width; x++) {
      const line = grids.map((g) => (g[y] && g[y][x]) || BLANK)
      const c = line[0]
      const px = n(ox + x * CW)
      if (line.every((d) => d.ch === c.ch && d.fg === c.fg && d.bg === c.bg && d.b === c.b)) {
        if (c.bg && back && back.bg === c.bg && back.x + back.w === x) back.w++
        else {
          endBack()
          if (c.bg) back = { x, w: 1, bg: c.bg }
        }
        if (c.ch.trim()) {
          const key = c.fg + (c.b ? '|b' : '')
          if (!inks.has(key)) inks.set(key, { xs: [], text: '' })
          inks.get(key).xs.push(px)
          inks.get(key).text += c.ch
        }
        continue
      }
      endBack()
      const bgs = line.map((d) => d.bg || 'transparent')
      if (bgs.some((v) => v !== 'transparent')) live += `<rect x="${px}" y="${py}" width="${n(CW + 0.4)}" height="${CH}" fill="${bgs[0]}">${steps('fill', bgs) ?? ''}</rect>`
      for (const glyph of new Set(line.filter((d) => d.ch.trim()).map((d) => d.ch + (d.b ? '|b' : '')))) {
        const [ch, b] = glyph.split('|')
        const fills = line.map((d) => (d.ch === ch && d.b === !!b ? d.fg : 'transparent'))
        live += `<text x="${px}" y="${base}" fill="${fills[0]}"${b ? ' font-weight="700"' : ''}>${steps('fill', fills) ?? ''}${esc(ch)}</text>`
      }
    }
    endBack()
    for (const [key, { xs, text }] of inks) {
      const [fg, b] = key.split('|')
      texts += `<text x="${xs.join(' ')}" y="${base}" fill="${fg}"${b ? ' font-weight="700"' : ''}>${esc(text)}</text>`
    }
  }
  return `<g shape-rendering="crispEdges">${backs}</g><g style="font:14px ${MONO};white-space:pre">${texts}${live}</g>`
}

// ---------- the mascot ----------

// a sprite as the terminal draws it: a pixel a cell wide and half a cell high (or pw by ph)
function spriteBody(grid, pal, pw = CW, ph = CH / 2) {
  let out = ''
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const k = row[x]
      let m = 1
      while (x + m < row.length && row[x + m] === k) m++
      if (k !== '.') out += `<rect x="${n(x * pw)}" y="${n(y * ph)}" width="${n(m * pw + 0.3)}" height="${n(ph + 0.3)}" fill="${pal[k]}"/>`
      x += m
    }
  })
  return out
}

// the mascot through `poses`, one a frame: { motion, ms, flip, x, y } (x and y in cells)
function pet(poses, pal, ox, oy, pw = CW, ph = CH / 2) {
  const keys = poses.map((p) => frameAt(p.motion, p.ms, p.flip).join('\n'))
  let body = ''
  for (const k of new Set(keys)) {
    const shown = keys.map((q) => (q === k ? 'visible' : 'hidden'))
    body += `<g visibility="${shown[0]}">${steps('visibility', shown) ?? ''}${spriteBody(k.split('\n'), pal, pw, ph)}</g>`
  }
  const at = poses.map((p) => `${n(ox + p.x * CW)} ${n(oy + p.y * CH)}`)
  return `<g transform="translate(${at[0]})" shape-rendering="crispEdges">${steps('transform', at, 'animateTransform', ' type="translate"') ?? ''}${body}</g>`
}

// ---------- a session to draw ----------

const SHOW = { style: 'solid', motion: 'all', collapsed: 'chips', plan: true, agents: true, git: true, pr: true, model: true, context: true, limits: true, cost: false, clock: false }

function meterSet(over = {}) {
  return [
    { name: 'ctx', kind: 'context', pct: 31, tone: 'ctx', reset: '', tokens: 312_000, window: 1_000_000, hist: [], rate: null },
    { name: '5h', kind: 'five_hour', pct: 46, tone: 'five', reset: '3h47m', hist: [18, 24, 29, 33, 38, 41, 44, 46], rate: 12 },
    { name: '7d', kind: 'seven_day', pct: 64, tone: 'week', reset: '2d5h', hist: [52, 55, 57, 60, 62, 64], rate: null },
  ].map((m) => ({ ...m, ...(over[m.name] ?? {}) }))
}

function sample(over = {}) {
  return {
    mood: { tone: 'dim', label: 'ready' },
    working: false,
    plan: null,
    agents: [],
    git: { branch: 'feat/login', ahead: 2, behind: 0, changed: 3, untracked: 1, added: 42, removed: 7, conflicts: 0 },
    pr: { number: 12, state: 'OPEN', draft: false, fail: 0, pending: 1, pass: 3, review: 'APPROVED' },
    model: 'opus 5.5',
    effort: 'xhigh',
    meters: meterSet(),
    cost: 1.23,
    clock: '14:05',
    frame: 0,
    ...over,
  }
}

const stepsOf = (done, total) => Array.from({ length: total }, (_, i) => (i < done ? 'done' : i === done ? 'now' : 'todo'))
const plan = (done, current, hist = []) => ({ done, total: 5, current, steps: stepsOf(done, 5), hist })
const secs = (f, from) => elapsed(from * 1000 + f * FRAME_MS)

// the demo, scene by scene: how long, what the mascot does (and how fast it walks, cells a
// frame), and what nunchi knows at frame f of it
const SCENES = [
  {
    frames: 40,
    motion: 'read',
    info: (f) => ({
      working: true,
      mood: { tone: 'run', label: `Reading login.ts · 1 agent · 6 tools · ${secs(f, 48)}` },
      plan: plan(1, 'Read the auth flow', [0, 20]),
      agents: [{ title: 'Explore auth flow', tool: 'Grep "refreshToken"', model: 'haiku 4.5', ms: 21_000 + f * FRAME_MS, state: 'run' }],
    }),
  },
  {
    frames: 45,
    motion: 'work',
    info: (f) => ({
      working: true,
      mood: { tone: 'run', label: `Editing auth.ts · 2 agents · 14 tools · ${secs(f, 72)}` },
      plan: plan(2, 'Fix token refresh', [0, 20, 40]),
      agents: [
        { title: 'Explore auth flow', tool: 'done', model: 'haiku 4.5', ms: 42_000, state: 'done' },
        { title: 'Write tests', tool: 'Write auth.test.ts', model: 'sonnet 5.5', ms: 9_000 + f * FRAME_MS, state: 'run' },
      ],
      meters: meterSet({ ctx: { pct: 38, tokens: 384_000 } }),
    }),
  },
  {
    frames: 32,
    motion: 'ask',
    info: () => ({
      working: true,
      mood: { tone: 'ask', label: 'needs your OK · Bash npm test' },
      plan: plan(3, 'Run the tests', [0, 20, 40, 60]),
      agents: [{ title: 'Write tests', tool: 'done', model: 'sonnet 5.5', ms: 95_000, state: 'done' }],
      meters: meterSet({ ctx: { pct: 41, tokens: 412_000 } }),
    }),
  },
  {
    frames: 36,
    motion: 'run',
    speed: 0.45,
    info: (f) => ({
      working: true,
      mood: { tone: 'run', label: `Running npm test · 21 tools · ${secs(f, 131)}` },
      plan: plan(4, 'Update the docs', [0, 20, 40, 60, 80]),
      meters: meterSet({ ctx: { pct: 44, tokens: 441_000 }, '5h': { pct: 49 } }),
    }),
  },
  {
    frames: 32,
    motion: 'celebrate',
    info: () => ({
      mood: { tone: 'done', label: 'done · 5 steps · 2m 40s' },
      plan: plan(5, '', [0, 20, 40, 60, 80, 100]),
      meters: meterSet({ ctx: { pct: 45, tokens: 452_000 }, '5h': { pct: 49 } }),
      git: { branch: 'feat/login', ahead: 3, behind: 0, changed: 0, untracked: 0, added: 0, removed: 0, conflicts: 0 },
    }),
  },
  {
    frames: 40,
    motion: 'walk',
    speed: 0.18,
    line: true,
    info: () => ({
      meters: meterSet({ ctx: { pct: 45, tokens: 452_000 }, '5h': { pct: 49 } }),
      git: { branch: 'feat/login', ahead: 3, behind: 0, changed: 0, untracked: 0, added: 0, removed: 0, conflicts: 0 },
    }),
  },
]

// ---------- demo.svg: the session in a terminal window ----------

function demo() {
  const COLS = 100
  const th = CLAUDE
  const panelCols = COLS - 4
  const frames = []
  let x = 30
  let dir = 1
  let f0 = 0
  for (const s of SCENES) {
    for (let i = 0; i < s.frames; i++) {
      const info = sample({ ...s.info(i), frame: f0 + i })
      const rows = s.line ? [collapsedRow(info, SHOW, panelCols)] : panelRows(info, SHOW, panelCols)
      if (s.speed) {
        x += dir * s.speed
        if (x > COLS - PET_W - 4) dir = -1
        if (x < 2) dir = 1
      }
      frames.push({ rows, pose: { motion: s.motion, ms: i * FRAME_MS, flip: dir < 0, x } })
    }
    f0 += s.frames
  }
  const most = Math.max(...frames.map((fr) => fr.rows.length))
  const band = PET_ROWS + most // the band over the prompt, filled from the bottom as the engine does
  const rule = [{ text: '─'.repeat(COLS), tone: 'dim~lo' }]
  const head = [
    [{ text: '> ', tone: 'dim' }, { text: 'fix the token refresh in login and add tests', tone: 'text' }],
    [],
    [{ text: '⏺ ', tone: 'text' }, { text: "I'll trace the auth flow first, then fix the refresh and cover it with tests.", tone: 'text' }],
    [],
  ]
  const at = (f) => {
    const { rows } = frames[f]
    const pad = Array.from({ length: band - rows.length }, () => [])
    return [
      ...head,
      ...pad,
      ...rows.map((r) => [{ text: '  ' }, ...r]),
      rule,
      [{ text: '❯ ', tone: 'text' }, { text: '▌', tone: 'dim' }],
      rule,
      [{ text: '  ⏵⏵ bypass permissions on', tone: 'hot~lite' }, { text: ' (shift+tab to cycle)', tone: 'dim' }],
    ]
  }
  const poses = frames.map((fr) => ({ ...fr.pose, y: head.length + band - fr.rows.length - PET_ROWS }))
  const PAD = 18
  const TOP = 34
  const rowsTotal = head.length + band + 4
  const w = n(COLS * CW + PAD * 2)
  const h = n(TOP + rowsTotal * CH + PAD)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<title>nunchi in the terminal: the mascot reads, types, asks, runs and celebrates above the prompt while the panel shows the plan, the subagents, the context and the 5h and 7d limits, git, the pull request and the model; at the end it folds into one line</title>
<rect width="${w}" height="${h}" rx="12" fill="${th.bg}"/>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="12" fill="none" stroke="${th.track}"/>
${['#FF5F57', '#FEBC2E', '#28C840'].map((c, i) => `<circle cx="${20 + i * 18}" cy="17" r="5.5" fill="${c}"/>`).join('')}
<text x="${w / 2}" y="21" text-anchor="middle" style="font:500 12px ${SANS}" fill="${th.dim}">claude — ~/project/app</text>
${screen(at, frames.length, th, PAD, TOP)}
${pet(poses, mascotPalette('claude'), PAD, TOP)}
</svg>`
  return svg
}

// ---------- styles.svg: every bar style, the one-line looks, the themes ----------

function styles() {
  const th = CLAUDE
  const LOOP = 132 // frames: the twinkles of 2.2 and 3.3 s come round on it
  const LABEL = 130
  const PAD = 24
  const COLS = 100 // the canvas, in cells after the labels
  const W = n(PAD + LABEL + COLS * CW + PAD)
  const working = (f) =>
    sample({
      working: true,
      frame: f,
      mood: { tone: 'run', label: 'Editing auth.ts' },
      plan: plan(3, 'Fixing auth', [0, 20, 40, 60]),
    })
  let y = PAD
  let body = ''
  const headline = (title, sub) => {
    body += `<text x="${PAD}" y="${y + 18}" style="font:700 17px ${SANS}" fill="${th.text}">${esc(title)}</text>`
    body += `<text x="${PAD}" y="${y + 38}" style="font:400 12.5px ${MONO}" fill="${th.dim}">${esc(sub)}</text>`
    y += 56
  }
  const label = (name, key, at, t = th, x = PAD) => {
    body += `<text x="${x}" y="${at + 13.2}" style="font:600 13.5px ${SANS}" fill="${t.text}">${esc(name)}</text>`
    if (key) body += `<text x="${x + 92}" y="${at + 13.2}" style="font:400 12px ${MONO}" fill="${t.dim}">${esc(key)}</text>`
  }

  headline('bar styles', '/nunchi style  ·  every bar moves (motion all)  ·  the plan while Claude works, then a meter')
  BAR_STYLES.forEach((style, i) => {
    label(style, String(i + 1), y)
    const at = (f) => {
      const { head, meters } = panelBars(working(f), { ...SHOW, style }, 74)
      return [head, meters[1]]
    }
    body += screen(at, LOOP, th, PAD + LABEL, y)
    y += CH * 2 + 14
  })

  y += 10
  headline('one-line looks', '/nunchi look  ·  /nunchi view line')
  for (const [i, look] of ['chips', 'text', 'rings'].entries()) {
    label(look, ['8', '9', '0'][i], y)
    const info = sample({ working: true, mood: { tone: 'run', label: 'Editing auth.ts' }, plan: plan(3, 'Fixing auth') })
    body += screen(() => [collapsedRow(info, { ...SHOW, collapsed: look, cost: look === 'rings' }, COLS)], 1, th, PAD + LABEL, y)
    y += CH + 12
  }

  // the themes as cards, four a row: the mascot and the limits in each one's colors
  // a bar without the words after it (hud.js puts two bare spaces between)
  const barOnly = (r) => r.slice(0, r.findIndex((sp) => sp.text === '  ' && !sp.tone && !sp.bg) >>> 0)
  y += 10
  headline('themes', '/nunchi theme  ·  the mascot and every bar take its colors')
  const GAP = 12
  const cardW = (W - PAD * 2 - GAP * 3) / 4
  const PX = 4 // the mascot's pixels, smaller than the terminal's
  const cardH = 14 + PET_H * PX + 10 + CH * 2 + 14
  THEME_NAMES.forEach((name, i) => {
    const t = theme(name)
    const x = PAD + (i % 4) * (cardW + GAP)
    const top = y + Math.floor(i / 4) * (cardH + GAP)
    body += `<rect x="${n(x)}" y="${top}" width="${n(cardW)}" height="${cardH}" rx="10" fill="${t.bg}" stroke="${th.track}"/>`
    label(name, String.fromCharCode(97 + i), top + 14, t, x + 14)
    const poses = Array.from({ length: LOOP }, (_, f) => ({ motion: i % 2 ? 'look' : 'idle', ms: f * FRAME_MS + i * 900, flip: false, x: 0, y: 0 }))
    body += pet(poses, mascotPalette(name), n(x + cardW - 14 - PET_W * PX), top + 14, PX, PX)
    const at = (f) => panelBars(sample({ frame: f + i * 5 }), { ...SHOW, style: 'solid', context: false }, 40).meters.map(barOnly)
    body += screen(at, LOOP, t, x + 14, top + 14 + PET_H * PX + 10)
  })
  y += 2 * cardH + GAP

  const h = n(y + PAD)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">
<title>Every nunchi bar style (solid, pixel, segments, line, blocks, dots, spark) as the terminal draws it, moving; the three one-line looks (chips, text, rings); and the eight themes with their mascot</title>
<rect width="${W}" height="${h}" rx="12" fill="${th.bg}"/>
${body}
</svg>`
}

// ---------- banner.svg ----------

function banner() {
  const th = CLAUDE
  const W = 1200
  const H = 300
  const K = 4.2 // the smooth mascot's scale
  const pal = mascotPalette('claude')
  const LOOP = 40
  // the mascot waves, then looks about: the Desktop app's vector mascot, a frame every 100 ms
  const keys = Array.from({ length: LOOP }, (_, f) => toSvgShapes(paint(smoothScene(f < 20 ? 'wave' : 'idle', f * FRAME_MS), pal)))
  let mascot = ''
  for (const k of new Set(keys)) {
    const shown = keys.map((q) => (q === k ? 'visible' : 'hidden'))
    mascot += `<g visibility="${shown[0]}">${steps('visibility', shown) ?? ''}${k}</g>`
  }
  const at = (f) => panelBars(sample({ frame: f * 1 }), { ...SHOW, style: 'pixel' }, 64).meters
  const LOOP_BARS = 132
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<title>nunchi: a Claude Code mascot that reads the room, with the plan, the limits and git under it</title>
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#26201C"/><stop offset="1" stop-color="${th.bg}"/></linearGradient></defs>
<rect width="${W}" height="${H}" rx="18" fill="url(#g)"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${th.track}"/>
<g transform="translate(50 ${n((H - SH * K) / 2)}) scale(${K})">${mascot}</g>
<text x="370" y="112" style="font:800 68px ${SANS};letter-spacing:-1px" fill="${th.text}">nunchi</text>
<text x="372" y="148" style="font:500 21px ${SANS}" fill="${th.run}">눈치 빠른 Claude Code 마스코트</text>
<text x="372" y="178" style="font:400 15.5px ${SANS}" fill="${th.dim}">입력창 위에서 상황을 읽고, 할 일 · 한도 · git · PR · 모델을 늘 보여줘요</text>
${screen(at, LOOP_BARS, th, 372, 200)}
</svg>`
}

mkdirSync(OUT, { recursive: true })
for (const [name, make] of [
  ['banner.svg', banner],
  ['demo.svg', demo],
  ['styles.svg', styles],
]) {
  const svg = make()
  writeFileSync(new URL(name, OUT), svg)
  console.log(name, Math.round(svg.length / 1024) + ' KB')
}
