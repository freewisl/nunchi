// nunchi: a Claude mascot that reads the room. Above the prompt it wanders while you are idle,
// paces while Claude thinks, reads and types along with it, runs about while agents work, raises
// a ? when Claude needs you, celebrates a finished turn, a commit or passing tests, and naps when
// you are away. Under it (or beside it) a panel: the plan's bar, a row per subagent, git, the pull request, the model and its effort, and a bar for the
// context window and each plan limit with how fast it is going. Seven bar styles, three one-line looks, eight themes, a picker for all of them, and
// short sounds when Claude needs you or finishes. `/nunchi place below` moves the mascot and the
// panel under the prompt.
//
// The mascot is a smooth picture where Claude Code draws pictures (kitty graphics through Unicode
// placeholders: kitty, Ghostty), the pixel sprite as half-block text where it cannot (Orca
// today), and SVG on Desktop. nunchi only watches: it runs git read-only for the branch and the
// changes and `gh pr view` for the branch's pull request (`/nunchi git off`, `/nunchi pr off`
// stop them), writes no files, and never changes a tool call, a request or the transcript.

import { SMOOTH_MOTIONS, smoothScene, paint, toSvgShapes, SW, SH } from './mascot/smooth.js'
import { rasterize } from './mascot/raster.js'
import { MOTION_NAMES, W as PIXEL_W, frameAt, frameIndex } from './mascot/sprite.js'
import { toCells, scaleGrid } from './mascot/render.js'
import { THEME_NAMES, theme, mascotPalette, color } from './mascot/themes.js'
import { FLASHES, newState, newTurn, moodOf, toolKind, actionOf, turnSummary, bashFlash } from './mood.js'
import { newRoam, stepRoam } from './roam.js'
import { meters, mergeLimits, burnRate } from './meters.js'
import { parseStatus, parseShortstat, shortModel, newPlan, planFromTodos, planTaskCreated, planTaskUpdated, planFromList, planOf, parsePr, modelId, effortFrom, effortSettings } from './info.js'
import { BAR_STYLES, drawBar } from './bars.js'
import { panelRows, panelBars, collapsedRow, fit } from './hud.js'

const TICK_MS = 100
const FRAME_MS = 100 // the bars' own animation: the shimmer, the twinkle, the pulsing heads
// px: how many columns a sprite pixel takes; img: the picture's columns and rows; scale: picture
// pixels per scene unit
const SIZES = { small: { px: 1, img: [16, 5], scale: 2 }, big: { px: 2, img: [32, 10], scale: 4 } }
const USAGE_EVERY_MS = 60_000
const HIST_EVERY_MS = 60_000
const HIST_KEEP = 60 // an hour of readings, for the spark and the burn rate
const GIT_EVERY_MS = 20_000
const GIT_GAP_MS = 1500
const PR_EVERY_MS = 60_000
const PR_GAP_MS = 10_000
const AGENT_LINGER_MS = 5000 // a finished subagent keeps its row this long
const SOUND_GAP_MS = 1200
const PLAY_MS = 6000
const PREFS_VERSION = 3
const RENDERS = ['auto', 'smooth', 'pixel']
const VIEWS = ['panel', 'line', 'auto'] // auto: the panel while Claude works or needs you
// where the mascot and the panel go: above, in the band over the prompt (the engine keeps the mode
// line, `⏵⏵ ... on`, right under the prompt, so only there do they come before it); below, under
// the prompt after that line
const PLACES = ['above', 'below']
const LOOKS = ['chips', 'text', 'rings'] // the one-line looks
// what moves: all, every bar all the time; work, the bar of what Claude does while it works; off
const MOTIONS = ['all', 'work', 'off']
// where the mascot goes beside the panel: side, in the room right of the bars (where the terminal
// is wide enough), else above
const PET_AT = ['side', 'above']
const SIDE_WORDS = 40 // columns the panel keeps after its bars, for their words, with the mascot beside
const SIDE_MIN = 96 // and never less, so the git row keeps the model
const SIDE_GAP = 3
const SECTIONS = ['plan', 'agents', 'git', 'pr', 'model', 'context', 'limits', 'cost', 'clock']
const TOGGLES = ['pet', 'roam', 'sound', ...SECTIONS]
const DEFAULTS = {
  v: PREFS_VERSION,
  on: true,
  theme: 'claude',
  style: 'solid',
  look: 'chips',
  view: 'panel',
  place: 'above',
  motion: 'all',
  petAt: 'side',
  render: 'auto',
  size: 'small',
  pet: true,
  roam: true,
  sound: true,
  plan: true,
  agents: true,
  git: true,
  pr: true,
  model: true,
  context: true,
  limits: true,
  cost: false,
  clock: false,
}
const PICKER = 'nunchi-style'
const LOOK_KEYS = ['8', '9', '0']
const HELP = [
  '/nunchi                          the panel or one line, in turn',
  '/nunchi status                   what nunchi shows now',
  '/nunchi on|off                   show or hide everything',
  '/nunchi style [<name>]           ' + BAR_STYLES.join(' ') + ' (no name: the picker)',
  '/nunchi look <name>              the one line: ' + LOOKS.join(' '),
  '/nunchi view panel|line|auto     auto: the panel while Claude works or needs you',
  '/nunchi place above|below        the mascot and the panel over the prompt or under it',
  '/nunchi theme [<name>]           ' + THEME_NAMES.join(' '),
  '/nunchi render auto|smooth|pixel how the mascot is drawn',
  '/nunchi size small|big           the mascot',
  '/nunchi pet|roam|sound on|off    the mascot, its wandering, the sounds',
  '/nunchi ' + SECTIONS.join('|') + ' on|off',
  '/nunchi play [<motion>]          ' + MOTION_NAMES.join(' '),
].join('\n')

let prefs = { ...DEFAULTS }
let st = newState()
let roam = newRoam()
let pose = { motion: 'idle', flip: false } // what the mascot plays this tick
let shown = { motion: '', since: 0 } // the motion on screen and when it began, for its frames
let usage = { context: null, rateLimits: [], cost: null }
let hist = new Map() // meter name -> readings { t, pct }, oldest first
let git = null // what parseStatus and parseShortstat read, or null outside a repository
let gitAt = -Infinity
let gitBusy = false
let pr = null // what parsePr read, or null without a pull request for the branch
let prAt = -Infinity
let prBusy = false
let ghOff = '' // why gh is not asked again this session: not installed, not logged in
let model = '' // as the panel shows it: "opus 5.5 1m"
let rawModel = '' // as the session names it: "claude-opus-5-5[1m]"
let effortSet = null // the effort parts of the settings, read at the start
let stepEffort = null // { id, effort }: what the last request on the main loop was sent with
let plan = newPlan()
let planHist = [] // the plan's percent done after each change, for the spark style
let agents = new Map() // subagent id -> { title, tool, model, started, endedAt, state }
let surface = ''
let size = 'small' // the size the band last drew at
let site = null // the requestId of the band holding the picture
let smoothOk = null // null: not known yet; true: the terminal drew it; false: it draws the alt
let refusal = ''
let pinged = false // the mood asked for you last tick, so the alert sounds once per ask
let soundAt = -Infinity
let drawn = '' // what the last tick asked to draw, to skip redraws that change nothing
let generation = 0 // a tick left over from an earlier session.start stops itself
const frames = new Map()

// on the hooks that gate Claude's work (a prompt, a permission check, a tool call, a subagent): a
// slip in nunchi's own bookkeeping lets the work through instead of stopping it
const passThrough = ($, e, next) => next(e)

const touch = () => (st.lastActive = st.now)
const wantsSmooth = () => prefs.render === 'smooth' || (prefs.render === 'auto' && smoothOk !== false)
const petCols = (sz) => (surface === 'terminal' && !wantsSmooth() ? PIXEL_W * SIZES[sz].px : SIZES[sz].img[0])
const onOff = (b) => (b ? 'on' : 'off')
const pad = (n) => String(n).padStart(2, '0')
const asksForYou = (mood) => mood.label === 'needs your OK' || mood.label === 'has a question for you'

function sound($, name) {
  if (!prefs.on || !prefs.sound || st.now - soundAt < SOUND_GAP_MS) return
  soundAt = st.now
  try {
    void $.audio.play({ asset: 'sounds/' + name + '.wav' }, { gain: 0.5 }).catch(() => {})
  } catch {}
}

function flash($, name, label) {
  st.flash = { name, label, until: st.now + FLASHES[name].ms }
  if (FLASHES[name].sound) sound($, FLASHES[name].sound)
}

// saved preferences over the defaults. 0.1 kept the mascot's drawing in `style` and both meters
// in `meters`; 0.2 drew the mascot big and the bars as segments by default
function loadPrefs(saved) {
  const old = saved && typeof saved === 'object' ? saved : {}
  const p = { ...DEFAULTS, ...old }
  if (old.v !== PREFS_VERSION) {
    if (RENDERS.includes(p.style)) [p.render, p.style] = [p.style, DEFAULTS.style]
    if (p.meters === false) p.context = p.limits = false
    if (p.style === 'segments' || !BAR_STYLES.includes(p.style)) p.style = DEFAULTS.style
    p.size = DEFAULTS.size
    p.v = PREFS_VERSION
  }
  delete p.meters
  if (!THEME_NAMES.includes(p.theme)) p.theme = DEFAULTS.theme
  if (!BAR_STYLES.includes(p.style)) p.style = DEFAULTS.style
  if (!LOOKS.includes(p.look)) p.look = DEFAULTS.look
  if (!VIEWS.includes(p.view)) p.view = DEFAULTS.view
  if (!PLACES.includes(p.place)) p.place = DEFAULTS.place
  if (!MOTIONS.includes(p.motion)) p.motion = DEFAULTS.motion
  if (!PET_AT.includes(p.petAt)) p.petAt = DEFAULTS.petAt
  if (!RENDERS.includes(p.render)) p.render = DEFAULTS.render
  if (!(p.size in SIZES)) p.size = DEFAULTS.size
  return p
}

// the size the band can hold: big wants its rows and some width
function sizeFor(props) {
  const rows = SIZES.big.img[1]
  return prefs.size === 'big' && (props.maxRows ?? rows) >= rows && (props.bodyColumns ?? 80) >= 70 ? 'big' : 'small'
}

function toBase64(bytes) {
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64()
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// the smooth picture for this moment, rasterized once per theme, size, motion, frame and facing
function smoothFrame(motion, t, flip, sz) {
  const loop = SMOOTH_MOTIONS[motion]?.loop ?? 1000
  const n = Math.max(1, Math.round(loop / TICK_MS))
  const i = Math.floor((((t % loop) + loop) % loop) / (loop / n)) % n
  const key = [prefs.theme, sz, motion, i, flip ? 'l' : 'r'].join(':')
  let src = frames.get(key)
  if (!src) {
    const img = rasterize(paint(smoothScene(motion, (i * loop) / n, flip), mascotPalette(prefs.theme)), SIZES[sz].scale)
    src = { rgba: toBase64(img.rgba), width: img.width, height: img.height }
    if (frames.size >= 120) frames.clear()
    frames.set(key, src)
  }
  return src
}

// one tick: the clock moves, the mood is read, the mascot takes a step, finished agents leave
function advance(dt) {
  st.now += dt
  const mood = moodOf(st)
  pose = prefs.roam ? stepRoam(roam, mood.motion, st.now, dt) : { motion: mood.motion, flip: roam.dir < 0 }
  if (pose.motion !== shown.motion) shown = { motion: pose.motion, since: st.now }
  for (const [id, a] of agents) if (a.state !== 'run' && st.now - a.endedAt > AGENT_LINGER_MS) agents.delete(id)
  return mood
}

async function refreshUsage($) {
  try {
    const u = await $.session.usage()
    if (u) usage = { context: u.context ?? usage.context, rateLimits: mergeLimits(usage.rateLimits, u.rateLimits), cost: u.cost?.usd ?? usage.cost }
  } catch {}
}

function sampleHist() {
  for (const m of meters(usage)) hist.set(m.name, [...(hist.get(m.name) ?? []), { t: st.now, pct: m.pct }].slice(-HIST_KEEP))
}

// the branch, how far it is from its upstream, and what changed: read-only, without the optional
// locks git would otherwise take on the index, at most once per GIT_GAP_MS unless forced
async function refreshGit($, force = false) {
  if (!prefs.git || gitBusy || (!force && st.now - gitAt < GIT_GAP_MS)) return
  gitBusy = true
  gitAt = st.now
  const branch = git?.branch
  try {
    const s = await $.process.run(['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'], { timeoutMs: 3000 })
    if (s.exitCode !== 0) git = null
    else {
      const d = await $.process.run(['git', '--no-optional-locks', 'diff', '--shortstat', 'HEAD'], { timeoutMs: 3000 })
      git = { ...parseStatus(s.stdout), ...(d.exitCode === 0 ? parseShortstat(d.stdout) : { added: 0, removed: 0 }) }
    }
  } catch {
    git = null
  } finally {
    gitBusy = false
  }
  if (git?.branch !== branch) void refreshPr($, true)
  $.ui.invalidate('ui.render')
}

// the branch's pull request, its checks and review, through the GitHub CLI as you are logged in
// to it; read-only. Without gh, or logged out, it is not asked again this session
async function refreshPr($, force = false) {
  if (!prefs.pr || ghOff || prBusy || (!force && st.now - prAt < PR_GAP_MS)) return
  if (!git || !git.branch || git.branch.startsWith('@')) {
    pr = null
    return
  }
  prBusy = true
  prAt = st.now
  try {
    const r = await $.process.run(['gh', 'pr', 'view', '--json', 'number,state,isDraft,reviewDecision,statusCheckRollup'], { timeoutMs: 8000 })
    if (r.exitCode === 0) pr = parsePr(r.stdout)
    else {
      pr = null
      if (/auth login|not logged in/i.test(r.stderr)) ghOff = 'gh is not logged in'
      else if (/command not found|no such file|not found: gh|ENOENT/i.test(r.stderr)) ghOff = 'gh is not installed'
    }
  } catch {
    pr = null
    ghOff = 'gh could not run'
  } finally {
    prBusy = false
  }
  $.ui.invalidate('ui.render')
}

async function refreshModel($) {
  try {
    const raw = await $.session.model()
    if (raw) [rawModel, model] = [String(raw), shortModel(raw)]
  } catch {}
}

// the effort the last request was sent with, while the model is the same; else the settings'
const effortNow = () => (stepEffort && stepEffort.id === modelId(rawModel) ? stepEffort.effort : effortFrom(effortSet, rawModel))

async function save($) {
  try {
    await $.store.set('prefs', prefs)
  } catch {}
}

// the plan as a tool call that ran changed it (TodoWrite, or the task tools)
function notePlan(e, ran) {
  if (e.tool === 'TodoWrite' && Array.isArray(e.todos)) planFromTodos(plan, e.todos)
  else if (e.tool === 'TaskCreate') planTaskCreated(plan, ran.result?.task?.id, e)
  else if (e.tool === 'TaskUpdate') planTaskUpdated(plan, e)
  else if (e.tool === 'TaskList' && Array.isArray(ran.result?.tasks)) planFromList(plan, ran.result.tasks)
  else return
  const p = planOf(plan)
  const pct = p && p.total ? (p.done / p.total) * 100 : 0
  if (p && planHist[planHist.length - 1] !== pct) planHist = [...planHist, pct].slice(-12)
}

function hudInfo() {
  const d = new Date()
  return {
    mood: moodOf(st),
    working: st.turn !== null,
    plan: planOf(plan) && { ...planOf(plan), hist: planHist },
    agents: [...agents.values()].map((a) => ({ ...a, ms: (a.state === 'run' ? st.now : a.endedAt) - a.started })),
    git,
    pr,
    model,
    effort: effortNow(),
    meters: meters(usage).map((m) => {
      const h = hist.get(m.name) ?? []
      return { ...m, hist: h.map((x) => x.pct), rate: m.kind === 'context' ? null : burnRate(h) }
    }),
    cost: usage.cost,
    clock: pad(d.getHours()) + ':' + pad(d.getMinutes()),
    frame: prefs.motion === 'off' ? 0 : Math.floor(st.now / FRAME_MS),
  }
}

const show = () => ({ ...prefs, collapsed: prefs.look })
const wantsPanel = (info) => prefs.view === 'panel' || (prefs.view === 'auto' && (info.working || info.mood.tone === 'ask' || info.mood.tone === 'hot'))

// whether the bars on screen move, so the ticker redraws them each frame: the panel's (one line
// holds still) or the picker's previews; motion work moves the bar of what Claude does, and the
// pixel style twinkles whatever it shows
let pickerAt = -1e9
function barsMove() {
  if (prefs.motion === 'off') return false
  const picker = st.now - pickerAt < 1000
  const panel = prefs.on && (prefs.view === 'panel' || (prefs.view === 'auto' && st.turn !== null))
  if (!panel && !picker) return false
  return prefs.motion === 'all' || st.turn !== null || prefs.style === 'pixel'
}

// spans as Text, their tones read from the theme ('ink' is its background)
function spanTexts(Text, th, spans) {
  return spans.map((s) =>
    Text({
      ...(s.tone ? { color: color(th, s.tone) } : {}),
      ...(s.bg ? { backgroundColor: color(th, s.bg) } : {}),
      ...(s.bold ? { bold: true } : {}),
      children: [s.text],
    }),
  )
}

function pixelPet(Box, Text, t, k) {
  const rows = toCells(scaleGrid(frameAt(pose.motion, t, pose.flip), k), mascotPalette(prefs.theme))
  return Box({
    flexDirection: 'column',
    flexShrink: 0,
    children: rows.map((row, y) => {
      const runs = []
      for (const c of row) {
        const last = runs[runs.length - 1]
        if (last && last.color === c.color && last.bg === c.bg) last.text += c.ch
        else runs.push({ text: c.ch, color: c.color, bg: c.bg })
      }
      return Box({
        key: 'px' + y,
        flexDirection: 'row',
        children: runs.map((r) => Text({ ...(r.color ? { color: r.color } : {}), ...(r.bg ? { backgroundColor: r.bg } : {}), children: [r.text] })),
      })
    }),
  })
}

// the bar the panel would draw in `style` now: what Claude is doing, else the first meter, at the
// panel's own width; a made-up plan only before there is anything to draw
let panelCols = null
function previewBar(style, info, cols) {
  const { head, meters } = panelBars(info, { ...show(), style }, panelCols ?? cols)
  return fit(head ?? meters[0] ?? sampleBar(style, info.frame, Math.min(26, cols)), cols)
}

// a made-up plan to preview the styles with, before the meters are read
function sampleBar(style, frame, width = 26) {
  const p = planOf(plan)
  const steps = p ? p.steps : ['done', 'done', 'now', 'todo', 'todo']
  const done = p ? p.done : 2
  const n = steps.length
  const label = [{ text: p ? p.current || 'all done' : 'Fixing auth', tone: 'run' }, { text: ' ' + done + '/' + n, tone: 'dim' }]
  const marks = Array.from({ length: n - 1 }, (_, i) => (i + 1) / n)
  return drawBar(style, { fill: [0, done / n], tone: 'run', label, width, steps, hist: [0, 20, 20, 40], frame, active: true, marks })
}

// every bar style as plain text, where the picker cannot open
function stylePreviews() {
  const info = hudInfo()
  return BAR_STYLES.map((s) => (s === prefs.style ? '▸ ' : '  ') + s.padEnd(10) + previewBar(s, info, 80).map((x) => x.text).join('')).join('\n')
}

function statusText() {
  const mood = moodOf(st)
  const how = surface && surface !== 'terminal' ? 'svg' : wantsSmooth() ? 'smooth picture' : 'pixel text'
  const why = smoothOk === false && refusal ? ' (' + refusal.replace(/^the Image draws its alt here: /, '') + ')' : ''
  const p = planOf(plan)
  const where = [
    git ? 'git ' + git.branch + (git.ahead ? ' ↑' + git.ahead : '') + (git.behind ? ' ↓' + git.behind : '') + ` · ${git.changed} changed · ${git.untracked} new · +${git.added} −${git.removed}` + (git.conflicts ? ` · ${git.conflicts} conflicts` : '') : 'no git',
    pr ? `PR #${pr.number} ${pr.state.toLowerCase()}` + (pr.review ? ' ' + pr.review.toLowerCase().replace(/_/g, ' ') : '') : ghOff || 'no PR',
    (model || 'model not read yet') + (effortNow() ? ' · ' + effortNow() : ''),
    p ? `plan ${p.done}/${p.total}` + (p.current ? ' ' + p.current : '') : 'no plan',
  ]
  if (agents.size) where.push(agents.size + ' agent' + (agents.size === 1 ? '' : 's'))
  const ms = hudInfo().meters.map((m) => m.name + ' ' + Math.round(m.pct) + '%' + (m.reset ? ' ↻' + m.reset : '') + (m.rate ? ' +' + Math.round(m.rate) + '%/h' : ''))
  if (usage.cost != null) ms.push('$' + usage.cost.toFixed(2))
  return [
    `nunchi ${onOff(prefs.on)} · mood ${mood.motion} · ${mood.label}`,
    `mascot ${pose.motion} ${pose.flip ? '←' : '→'} at ${Math.round(roam.x)}/${roam.room} · size ${prefs.size} · render ${prefs.render} → ${how}${why}`,
    where.join(' · '),
    ms.length ? ms.join(' · ') : 'no usage yet',
    `view ${prefs.view} · place ${prefs.place} · style ${prefs.style} · look ${prefs.look} · theme ${prefs.theme} · motion ${prefs.motion} · sound ${onOff(prefs.sound)} · pet ${onOff(prefs.pet)} ${prefs.petAt} · roam ${onOff(prefs.roam)}`,
    `shows ${SECTIONS.filter((s) => prefs[s]).join(' ') || 'nothing'}`,
  ].join('\n')
}

// the panel (or the one line, by the view, or where `room` rows cannot hold the panel) as a tree;
// `clip` cuts its rows to that many columns and holds it to that width, beside the mascot
function hudTree(Box, Text, cols, room, working, clip = null) {
  const th = theme(prefs.theme)
  const info = hudInfo()
  info.working = info.working || working
  cols = Math.max(24, cols)
  panelCols = cols
  let rows = wantsPanel(info) ? panelRows(info, show(), cols) : []
  if (!rows.length || rows.length > room) rows = room >= 1 ? [collapsedRow(info, show(), cols)] : []
  if (!rows.length || !rows[0].length) return null
  if (clip) rows = rows.map((r) => fit(r, clip))
  return Box({
    key: 'nunchi-hud',
    flexDirection: 'column',
    flexShrink: 0,
    marginLeft: 2,
    ...(clip ? { width: clip } : {}),
    children: rows.map((spans, i) => Box({ key: 'hud' + i, flexDirection: 'row', children: spanTexts(Text, th, spans) })),
  })
}

// the mascot and the panel as one tree, in the band over the prompt or under it (`cols` by `room`):
// the mascot beside the panel where the terminal leaves it room right of the bars and their words
// (the panel then has the whole height), else over it
function bandTree(e, { Box, Text, Image, Svg }, cols, room, working) {
  surface = e.surface
  const parts = []
  const petFits = prefs.pet && room >= SIZES.small.img[1]
  if (petFits) size = sizeFor({ maxRows: room, bodyColumns: cols })
  const inner = cols - 2
  const area = Math.min(inner, Math.max(Math.round(inner / 4) + SIDE_WORDS, SIDE_MIN))
  const side = petFits && prefs.petAt === 'side' && inner - area - SIDE_GAP >= petCols(size) + 2
  const hud = side ? hudTree(Box, Text, inner, room, working, area) : hudTree(Box, Text, inner, room - (petFits ? SIZES[size].img[1] : 0), working)
  const beside = side && hud
  if (petFits) {
    roam.room = Math.max(0, beside ? inner - area - SIDE_GAP - petCols(size) : cols - petCols(size) - 1)
    const t = st.now - shown.since
    let pet
    if (e.surface !== 'terminal' && Svg) {
      const k = size === 'big' ? 3 : 2
      const shapes = paint(smoothScene(pose.motion, t, pose.flip), mascotPalette(prefs.theme))
      pet = Svg({
        alt: 'nunchi, ' + pose.motion,
        width: SW * k,
        height: SH * k,
        source: `<svg xmlns="http://www.w3.org/2000/svg" width="${SW * k}" height="${SH * k}" viewBox="0 0 ${SW} ${SH}">${toSvgShapes(shapes)}</svg>`,
      })
    } else if (wantsSmooth() && Image) {
      site = e.requestId
      const [columns, rows] = SIZES[size].img
      pet = Box({
        height: rows,
        flexShrink: 0,
        children: [Image({ key: 'nunchi-pet', source: smoothFrame(pose.motion, t, pose.flip, size), columns, rows, alt: ' ' })],
      })
    } else pet = pixelPet(Box, Text, t, SIZES[size].px)
    const band = Box({ key: 'nunchi-band', flexDirection: 'row', marginLeft: Math.round(roam.x) + (beside ? SIDE_GAP : 0), flexShrink: 0, children: [pet] })
    // beside: the panel, then the mascot standing on its last row
    if (beside) parts.push(Box({ key: 'nunchi-side', flexDirection: 'row', alignItems: 'flex-end', flexShrink: 0, children: [hud, band] }))
    else parts.push(band)
  }
  if (hud && !beside) parts.push(hud)
  if (!parts.length) return null
  return parts.length === 1 ? parts[0] : Box({ flexDirection: 'column', flexShrink: 0, children: parts })
}

// a choice from the picker or a command: kept, and drawn at once
async function choose($, key, value) {
  prefs[key] = value
  if (key === 'theme') frames.clear()
  if (key === 'place') site = null
  await save($)
  $.ui.invalidate('ui.render')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    const gen = ++generation
    st = newState()
    roam = newRoam()
    pose = { motion: 'idle', flip: false }
    shown = { motion: '', since: 0 }
    usage = { context: null, rateLimits: [], cost: null }
    hist = new Map()
    git = null
    gitAt = -Infinity
    gitBusy = false
    pr = null
    prAt = -Infinity
    prBusy = false
    ghOff = ''
    effortSet = null
    stepEffort = null
    plan = newPlan()
    planHist = []
    agents = new Map()
    site = null
    smoothOk = null
    refusal = ''
    pinged = false
    soundAt = -Infinity
    let saved = null
    try {
      saved = await $.store.get('prefs')
    } catch {}
    prefs = loadPrefs(saved)
    flash($, 'hello')
    // the effort the settings ask for each model (only that is kept), until a request says what
    // it was sent with
    try {
      effortSet = effortSettings(await $.settings.read())
    } catch {}
    await refreshUsage($)
    sampleHist()
    await refreshModel($)
    void refreshGit($, true)

    $.clock.every(TICK_MS, async () => {
      if (gen !== generation) return
      const mood = advance(TICK_MS)
      if (!prefs.on) return
      const asking = asksForYou(mood)
      if (asking && !pinged) sound($, 'alert')
      pinged = asking
      if (st.now % USAGE_EVERY_MS === 0) await refreshUsage($)
      if (st.now % HIST_EVERY_MS === 0) sampleHist()
      if (st.now % GIT_EVERY_MS === 0) void refreshGit($)
      if (st.now % PR_EVERY_MS === 0) void refreshPr($)
      const t = st.now - shown.since
      const smooth = surface === 'terminal' && prefs.pet && wantsSmooth() && site
      if (smooth) {
        const r = await $.ui.blit({ requestId: site, key: 'nunchi-pet', source: smoothFrame(pose.motion, t, pose.flip, size) })
        if (r && r.deny) {
          // final only once the terminal has answered: before that the reason says "not asked yet"
          if (prefs.render === 'auto' && /no placeholder images|every 8-bit image id/.test(r.deny) && !/not asked yet/.test(r.deny)) {
            smoothOk = false
            refusal = r.deny
          }
        } else if (smoothOk === null) smoothOk = true
      }
      const frame = smooth ? '' : frameIndex(pose.motion, t)
      const moving = barsMove() ? Math.floor(st.now / FRAME_MS) : 0
      const now = [Math.round(roam.x), pose.motion, pose.flip, frame, mood.label, smoothOk, moving, Math.floor(st.now / 1000)].join('|')
      if (now !== drawn) {
        drawn = now
        $.ui.invalidate('ui.render')
      }
    })

    try {
      await $.command.register({
        name: 'nunchi',
        description: 'nunchi: the mascot above the prompt and the panel under it (bar styles, looks, themes, sounds, sections)',
        argumentHint: '[status|on|off|style [<name>]|look <name>|view <how>|theme <name>|render <how>|size small|big|<section> on|off|play <motion>]',
        immediate: true,
      })
    } catch {}
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!String(e.text ?? '').startsWith('/')) st.asked = false
    touch()
    void refreshModel($)
    return next(e)
  }).catch(passThrough)

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      st.turn = newTurn()
      st.asked = false
      st.flash = null
      const p = planOf(plan)
      if (p && p.done === p.total) {
        plan.clear() // a finished plan stays until the next turn
        planHist = []
      }
      touch()
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // the model and effort each request names: the main loop's for the panel, a subagent's for its row
  on('turn.step', async function* ($, e, next) {
    try {
      const m = shortModel(e.model)
      if (e.agentId) {
        const a = agents.get(e.agentId)
        if (a && m) a.model = m
      } else if (e.model) {
        if (modelId(e.model) !== modelId(rawModel)) [rawModel, model] = [String(e.model), m]
        stepEffort = { id: modelId(e.model), effort: e.effort == null ? '' : String(e.effort) }
      }
    } catch {}
    return yield* next(e)
  })

  // the permission prompt shows while a check that asked stays open; the tool call closes it
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict && verdict.decision === 'ask') st.checks.set(e.tool_use_id ?? 'check:' + st.now, st.now)
    return verdict
  }).catch(passThrough)

  on('tool.call', async ($, e, next) => {
    const main = !e.agentId
    const id = e.tool_use_id
    if (main && !st.turn) st.turn = newTurn()
    if (st.turn) st.turn.tools++
    if (main) {
      st.turn.kind = toolKind(e.tool)
      st.turn.action = actionOf(e)
      st.turn.running++
    } else {
      const a = agents.get(e.agentId)
      if (a) a.tool = actionOf(e)
    }
    if (e.tool === 'AskUserQuestion') st.questions.add(id ?? 'question')
    touch()
    $.ui.invalidate('ui.render')
    let ran
    try {
      ran = await next(e)
    } finally {
      if (id) st.checks.delete(id)
      else if (main) st.checks.clear()
      st.questions.delete(id ?? 'question')
      if (main && st.turn) {
        st.turn.running = Math.max(0, st.turn.running - 1)
        st.turn.endedAt = st.now
      }
      touch()
      $.ui.invalidate('ui.render')
    }
    if (!main) return ran
    const ok = ran && ran.deny === undefined && ran.isError !== true
    if (ok) notePlan(e, ran)
    const react = e.tool === 'Bash' ? bashFlash(e.command, ran) : null
    if (react) {
      flash($, react[0], react[1])
      if (react[0] === 'push' || react[0] === 'pr') void refreshPr($, true)
    } else if (ran && ran.isError === true && ran.deny === undefined) flash($, 'oops', e.tool + ' failed')
    if (toolKind(e.tool) === 'work') void refreshGit($, react !== null)
    return ran
  }).catch(passThrough)

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started && started.agentId) {
      st.agents.add(started.agentId)
      agents.set(started.agentId, {
        title: String(e.description || e.subagentType || 'agent'),
        tool: 'starting',
        model: shortModel(started.model),
        started: st.now,
        endedAt: st.now,
        state: 'run',
      })
      $.ui.invalidate('ui.render')
    }
    return started
  }).catch(passThrough)

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      st.agents.delete(e.agentId)
      const a = agents.get(e.agentId)
      if (a) Object.assign(a, { state: e.reason === 'answer' ? 'done' : 'error', tool: e.reason === 'answer' ? 'done' : String(e.reason ?? 'stopped'), endedAt: st.now })
    } else {
      const turn = st.turn
      st.turn = null
      st.checks.clear()
      st.questions.clear()
      if (e.reason === 'answer') {
        if (/\?\s*$/.test(String(e.answer ?? ''))) {
          st.asked = true
          sound($, 'alert')
        } else flash($, 'done', turnSummary(turn))
      } else if (e.reason !== 'aborted' && !e.isAborted) flash($, 'oops', 'stopped: ' + String(e.reason ?? 'error'))
      touch()
      void refreshGit($, true)
    }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    usage = { context: e.context ?? usage.context, rateLimits: mergeLimits(usage.rateLimits, e.rateLimits), cost: e.cost?.usd ?? usage.cost }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: 'nunchi' }, async ($, e) => {
    const [a, b] = String(e.args ?? '').trim().split(/\s+/).filter(Boolean)
    if (!a) {
      await choose($, 'view', prefs.view === 'line' ? 'panel' : 'line')
      return { text: 'nunchi shows ' + (prefs.view === 'line' ? 'one line (/nunchi again for the panel)' : 'the panel (/nunchi again for one line)') }
    }
    if (a === 'status') return { text: statusText() }
    if (a === 'on' || a === 'off') prefs.on = a === 'on'
    else if (a === 'style' || a === 'pick') {
      if (BAR_STYLES.includes(b)) prefs.style = b
      else {
        let placed = false
        try {
          placed = (await $.ui.open({ id: PICKER, title: 'nunchi style', focus: true, closeOnEscape: true })).isPlaced
        } catch {}
        if (placed) return { text: 'nunchi picker: 1–7 bar style · 8 9 0 one-line look · a–h theme · o u over or under the prompt · s t the mascot beside or over the panel · x panel or line · m motion · z sound · esc closes' }
        return { text: (b ? 'no style "' + b + '"\n' : '') + stylePreviews() + '\n/nunchi style <name> picks one' }
      }
    } else if (a === 'look') {
      if (!LOOKS.includes(b)) return { text: 'looks: ' + LOOKS.map((n) => (n === prefs.look ? '[' + n + ']' : n)).join(' ') }
      prefs.look = b
      if (prefs.view === 'panel') prefs.view = 'line'
    } else if (a === 'view') {
      if (!VIEWS.includes(b)) return { text: 'view: ' + VIEWS.join(' ') + ' (now ' + prefs.view + ')' }
      prefs.view = b
    } else if (a === 'place') {
      if (!PLACES.includes(b)) return { text: 'place: ' + PLACES.join(' ') + ' (now ' + prefs.place + ')' }
      prefs.place = b
      site = null
    } else if (a === 'pet' && PET_AT.includes(b)) {
      prefs.petAt = b
      prefs.pet = true
    } else if (a === 'motion') {
      if (!MOTIONS.includes(b)) return { text: 'motion: ' + MOTIONS.join(' ') + ' (now ' + prefs.motion + ')' }
      prefs.motion = b
    } else if (a === 'theme') {
      if (!THEME_NAMES.includes(b)) return { text: (b ? 'no theme "' + b + '". ' : '') + 'themes: ' + THEME_NAMES.map((n) => (n === prefs.theme ? '[' + n + ']' : n)).join(' ') }
      prefs.theme = b
      frames.clear()
    } else if (a === 'render') {
      if (!RENDERS.includes(b)) return { text: 'render: ' + RENDERS.join(' ') + ' (now ' + prefs.render + ')' }
      prefs.render = b
      if (b !== 'pixel') smoothOk = null
    } else if (a === 'size') {
      if (!(b in SIZES)) return { text: 'size: ' + Object.keys(SIZES).join(' ') + ' (now ' + prefs.size + ')' }
      prefs.size = b
    } else if (TOGGLES.includes(a)) {
      if (b !== 'on' && b !== 'off') return { text: '/nunchi ' + a + ' on|off (now ' + onOff(prefs[a]) + ')' }
      prefs[a] = b === 'on'
      if (a === 'git' && prefs.git) void refreshGit($, true)
      if (a === 'pr' && prefs.pr) {
        ghOff = ''
        void refreshPr($, true)
      }
    } else if (a === 'play') {
      const motion = b ?? 'dance'
      if (!MOTION_NAMES.includes(motion)) return { text: 'motions: ' + MOTION_NAMES.join(' ') }
      st.play = { motion, until: st.now + PLAY_MS }
      $.ui.invalidate('ui.render')
      return { text: 'nunchi plays ' + motion }
    } else return { text: HELP }
    await save($)
    $.ui.invalidate('ui.render')
    return { text: statusText() }
  })

  // above the prompt: the mascot, wherever it has wandered to across the band, and under it the
  // panel when it is placed above
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!prefs.on || prefs.place !== 'above' || e.props.hasSurvey) return next(e)
    const below = await next(e)
    const els = $.ui.resolve(e)
    const mine = bandTree(e, els, e.props.bodyColumns ?? 80, e.props.maxRows ?? 20, e.props.isWorking === true)
    if (!mine) return below
    return below ? els.Box({ flexDirection: 'column', children: [mine, below] }) : mine
  })

  // place below: the same under the prompt, after the engine's hint and mode lines
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e)
    if (!prefs.on || prefs.place !== 'below') return below
    const els = $.ui.resolve(e)
    const mine = bandTree(e, els, Math.max(26, (e.viewport?.columns ?? 100) - 4), 99, e.props.isWorking === true)
    if (!mine) return below
    return below ? els.Box({ flexDirection: 'column', children: [below, mine] }) : mine
  })

  // the picker: every bar style, one-line look and theme drawn as it would be, a key for each
  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const th = theme(prefs.theme)
    const cols = Math.max(30, (e.props.bodyColumns ?? 80) - 16)
    const info = hudInfo()
    pickerAt = st.now
    const mark = (picked) => Text({ color: picked ? th.run : th.dim, children: [picked ? '▸ ' : '  '] })
    const name = (s) => Text({ color: th.text, children: [s.padEnd(9)] })
    const head = (s) => Text({ key: 'h:' + s, bold: true, color: th.text, children: [s] })
    const row = (key, hotkey, chosen, label, spans, onPress) =>
      Button({ key, hotkey, plain: true, onPress, children: [mark(chosen), name(label), ...spanTexts(Text, th, spans)] })
    const styleRows = BAR_STYLES.map((s, i) => row('style:' + s, String(i + 1), s === prefs.style, s, previewBar(s, info, cols), () => void choose($, 'style', s)))
    const lookRows = LOOKS.map((l, i) =>
      row('look:' + l, LOOK_KEYS[i], l === prefs.look, l, collapsedRow(info, { ...prefs, collapsed: l }, cols), () => {
        if (prefs.view === 'panel') prefs.view = 'line'
        void choose($, 'look', l)
      }),
    )
    // where the mascot and the panel go, and where the mascot goes beside the panel
    const words = (text) => fit([{ text, tone: 'dim' }], cols)
    const whereRows = [
      row('place:above', 'o', prefs.place === 'above', 'over', words('mascot and panel over the prompt'), () => void choose($, 'place', 'above')),
      row('place:below', 'u', prefs.place === 'below', 'under', words('mascot and panel under the prompt'), () => void choose($, 'place', 'below')),
      ...PET_AT.map((at, i) =>
        row('pet:' + at, ['s', 't'][i], prefs.pet && prefs.petAt === at, at, words(at === 'side' ? 'mascot right of the bars, when wide' : 'mascot over the panel'), () => {
          prefs.pet = true
          void choose($, 'petAt', at)
        }),
      ),
    ]
    const themeRows = THEME_NAMES.map((n, i) => {
      const t = theme(n)
      const chip = drawBar('solid', { fill: [0, 0.6], tone: 'run', label: [{ text: t.label + ' 3/5' }], width: 16 })
      return Button({
        key: 'theme:' + n,
        hotkey: String.fromCharCode(97 + i),
        plain: true,
        onPress: () => void choose($, 'theme', n),
        children: [
          mark(n === prefs.theme),
          Text({ color: th.text, children: [n.padEnd(9)] }),
          ...spanTexts(Text, t, chip),
          Text({ color: t.mascot.body, children: ['  ██'] }),
          ...['run', 'five', 'week', 'ctx', 'hot'].map((k) => Text({ color: t[k], children: [' ●'] })),
        ],
      })
    })
    return Box({
      flexDirection: 'column',
      children: [
        head('bar style · the panel as it is now'),
        ...styleRows,
        head('one-line look · the line as it is now'),
        ...lookRows,
        head('theme'),
        ...themeRows,
        head('where'),
        ...whereRows,
        Box({
          key: 'foot',
          flexDirection: 'row',
          flexWrap: 'wrap',
          children: [
            Button({ key: 'view', hotkey: 'x', plain: true, onPress: () => void choose($, 'view', prefs.view === 'line' ? 'panel' : 'line'), label: 'show ' + (prefs.view === 'line' ? 'the panel' : 'one line') }),
            Text({ color: th.dim, children: ['   '] }),
            Button({ key: 'sound', hotkey: 'z', plain: true, onPress: () => void choose($, 'sound', !prefs.sound), label: 'sound ' + onOff(prefs.sound) }),
            Text({ color: th.dim, children: ['   '] }),
            Button({ key: 'motion', hotkey: 'm', plain: true, onPress: () => void choose($, 'motion', MOTIONS[(MOTIONS.indexOf(prefs.motion) + 1) % MOTIONS.length]), label: 'motion ' + prefs.motion }),
          ],
        }),
        Text({ key: 'esc', color: th.dim, children: ['esc closes'] }),
      ],
    })
  })
}
