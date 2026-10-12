// What nunchi draws under the prompt, as rows of spans { text, tone?, bg?, bold? } (theme color
// keys). Pure, no $.
//
// Expanded, a panel: the plan's bar (or, in a turn without one, an activity bar sweeping), a row
// per subagent, a bar per meter, then a row with git, the pull request and the model. Collapsed,
// one line in one of three looks: chips with mini bars, plain text, or limit rings.

import { drawBar, miniBar, ring, cellsOf, widthOf } from './bars.js'
import { fmtK } from './meters.js'
import { elapsed } from './mood.js'

const GLYPH = { run: '●', ask: '?', hot: '!', done: '✓', dim: '·', cool: '♪' }
const GAP = '   '

export { widthOf }

// cut to n cells, counted as widthOf counts them, the last an ellipsis
function clip(s, n) {
  if (widthOf(s) <= n) return String(s)
  let out = ''
  let used = 0
  for (const c of String(s)) {
    const w = cellsOf(c)
    if (used + w > n - 1) break
    out += c
    used += w
  }
  return out + '…'
}
const join = (chips, sep = GAP) => chips.flatMap((c, i) => (i ? [{ text: sep, tone: 'dim' }, ...c] : c))

// spans cut to `cols` cells, an ellipsis where they were cut
export function fit(spans, cols) {
  const out = []
  let used = 0
  for (const s of spans) {
    const w = widthOf(s.text)
    if (used + w <= cols) {
      out.push(s)
      used += w
      continue
    }
    if (cols - used > 1) out.push({ ...s, text: clip(s.text, cols - used) })
    break
  }
  return out
}

function gitChip(g) {
  if (!g || !g.branch) return null
  const s = [{ text: 'git ', tone: 'dim' }, { text: clip(g.branch, 32), tone: 'cool' }]
  if (g.ahead) s.push({ text: ' ↑' + g.ahead, tone: 'ask' })
  if (g.behind) s.push({ text: ' ↓' + g.behind, tone: 'ask' })
  // the working tree in words: a bare ?5 or ●3 says little at a glance
  if (g.conflicts) s.push({ text: ' ' + g.conflicts + ' conflict' + (g.conflicts === 1 ? '' : 's'), tone: 'hot' })
  if (g.changed) s.push({ text: ' ' + g.changed + ' changed', tone: 'run' })
  if (g.untracked) s.push({ text: ' ' + g.untracked + ' new', tone: 'dim' })
  if (g.added || g.removed) s.push({ text: ' (', tone: 'dim' })
  if (g.added) s.push({ text: '+' + g.added, tone: 'done' })
  if (g.added && g.removed) s.push({ text: ' ', tone: 'dim' })
  if (g.removed) s.push({ text: '−' + g.removed, tone: 'hot' })
  if (g.added || g.removed) s.push({ text: ')', tone: 'dim' })
  if (!g.changed && !g.untracked && !g.conflicts) s.push({ text: ' clean', tone: 'done' })
  return s
}

function prChip(pr) {
  if (!pr) return null
  const s = [{ text: 'PR #' + pr.number, tone: 'cool' }]
  if (pr.state === 'MERGED') return [...s, { text: ' merged', tone: 'cool' }]
  if (pr.state === 'CLOSED') return [...s, { text: ' closed', tone: 'dim' }]
  if (pr.draft) s.push({ text: ' draft', tone: 'dim' })
  if (pr.fail) s.push({ text: ' ✖' + pr.fail, tone: 'hot' })
  if (pr.pending) s.push({ text: ' ◷' + pr.pending, tone: 'ask' })
  if (!pr.fail && !pr.pending && pr.pass) s.push({ text: ' ✓', tone: 'done' })
  if (pr.review === 'APPROVED') s.push({ text: ' approved', tone: 'done' })
  else if (pr.review === 'CHANGES_REQUESTED') s.push({ text: ' changes requested', tone: 'hot' })
  else if (pr.review === 'REVIEW_REQUIRED') s.push({ text: ' review needed', tone: 'dim' })
  return s
}

const modelChip = (info) => (info.model ? [{ text: '◆ ', tone: 'run' }, { text: info.model, tone: 'text' }, ...(info.effort ? [{ text: ' · ' + info.effort, tone: 'dim' }] : [])] : null)

// a bar: `core` (a few words) in or beside it, `extra` after it, dim
function bar(style, width, { fill, tone, core, extra = [], steps = null, hist = [], frame = 0, active = false, marks = null }) {
  const out = drawBar(style, { fill, tone, label: core, width, steps, hist, frame, active, marks })
  return extra.length ? [...out, { text: '  ' }, ...extra] : out
}

// the head row's parts: the plan's bar (its ticks at the steps, its history for spark), else an
// activity bar sweeping while Claude works, else what needs you; null when idle. Both bars are
// active: they shimmer and pulse while Claude works
function headBar(info, show) {
  const { mood, plan } = info
  const urgent = mood.tone === 'ask' || mood.tone === 'hot'
  const [what, ...rest] = mood.label.split(' · ')
  if (show.plan && plan) {
    const complete = plan.done === plan.total
    const tone = urgent ? mood.tone : complete ? 'done' : 'run'
    const core = [{ text: clip(complete ? 'all done' : plan.current || 'next step', 28), tone }, { text: ' ' + plan.done + '/' + plan.total, tone: 'dim' }]
    const extra = info.working || mood.tone !== 'dim' ? [{ text: mood.label, tone: urgent ? mood.tone : 'dim', bold: urgent }] : []
    const marks = plan.total > 1 ? Array.from({ length: plan.total - 1 }, (_, i) => (i + 1) / plan.total) : []
    return { fill: [0, plan.total ? plan.done / plan.total : 0], tone, core, extra, steps: plan.steps, hist: plan.hist ?? [], active: info.working && !complete, marks }
  }
  if (info.working) {
    const at = ((info.frame % 36) / 36) * 1.3 - 0.3
    return {
      fill: [Math.max(0, at), Math.max(0, Math.min(1, at + 0.3))],
      tone: mood.tone,
      core: [{ text: clip(what, 28), tone: mood.tone }],
      extra: rest.length ? [{ text: rest.join(' · '), tone: 'dim' }] : [],
      active: true,
    }
  }
  if (mood.tone !== 'dim') return { text: [{ text: GLYPH[mood.tone] + ' ' + mood.label, tone: mood.tone, bold: urgent }] }
  return null
}

// a row per agent at work: ↳ a subagent by its task, ⇄ a teammate by its @name (it can be messaged)
function agentRows(info) {
  const shown = info.agents.slice(0, 4)
  const rows = shown.map((a) => [
    { text: a.team ? '  ⇄ ' : '  ↳ ', tone: 'dim' },
    { text: clip(a.title, 30), tone: a.state === 'error' ? 'hot' : 'text' },
    { text: '  ' + clip(a.tool, 26), tone: 'dim' },
    ...(a.model ? [{ text: '  ' + a.model, tone: 'cool' }, ...(a.effort ? [{ text: ' · ' + a.effort, tone: 'dim' }] : [])] : []),
    { text: '  ' + elapsed(a.ms), tone: 'dim' },
    ...(a.state === 'done' ? [{ text: ' ✓', tone: 'done' }] : a.state === 'error' ? [{ text: ' ✖', tone: 'hot' }] : []),
  ])
  if (info.agents.length > shown.length) rows.push([{ text: '  ↳ +' + (info.agents.length - shown.length) + ' more', tone: 'dim' }])
  return rows
}

// a meter's bar: "5h · 31% used" in its color, then the tokens or the reset and the burn rate, dim
function meterBar(m, frame) {
  const core = [{ text: m.name + ' · ' + Math.round(m.pct) + '%' + (m.kind === 'context' ? '' : ' used'), tone: m.tone }]
  const extra = []
  if (m.kind === 'context' && m.tokens != null && m.window) extra.push({ text: fmtK(m.tokens) + '/' + fmtK(m.window), tone: 'dim' })
  if (m.reset) extra.push({ text: (extra.length ? ' · ' : '') + '↻' + m.reset, tone: 'dim' })
  if (m.rate) extra.push({ text: (extra.length ? ' · ' : '') + '+' + Math.round(m.rate) + '%/h', tone: m.tone === 'hot' ? 'hot' : 'dim' })
  return { fill: [0, Math.min(1, m.pct / 100)], tone: m.tone, core, extra, hist: m.hist, frame }
}

const meterShown = (m, show) => (m.kind === 'context' ? show.context : show.limits)

// the panel's bars as it draws them, one width for all: the plan's or the activity's (null when
// there is neither), then a bar per meter shown. The picker previews the styles with these, so a
// preview is the bar the panel draws
export function panelBars(info, show, cols) {
  // motion all moves every bar, each out of step with the others; work only the
  // bar of what Claude does while it works
  const all = (show.motion ?? 'all') === 'all'
  let head = headBar(info, show)
  if (head && head.core && all) head = { ...head, active: true }
  const bars = info.meters.filter((m) => meterShown(m, show)).map((m, i) => ({ ...meterBar(m, info.frame + 7 * (i + 1)), active: all }))
  // the bars line up, each a quarter of the row; solid and pixel hold their words inside, so they
  // are never too short for the longest
  const cores = [...(head && head.core ? [head] : []), ...bars].map((b) => widthOf(b.core.map((s) => s.text).join('')))
  const quarter = Math.max(10, Math.round(cols / 4))
  const inside = show.style === 'solid' || show.style === 'pixel'
  const width = inside ? Math.max(quarter, ...cores.map((w) => w + 12)) : quarter
  return {
    head: head ? fit(head.text ?? bar(show.style, width, { ...head, frame: info.frame }), cols) : null,
    meters: bars.map((b) => fit(bar(show.style, width, b), cols)),
  }
}

// info: { mood, working, plan, agents, git, pr, model, effort, meters, cost, clock, frame }
// rows: what Claude is doing, its subagents, the meters, then git, the PR and the model last
export function panelRows(info, show, cols) {
  const { head, meters } = panelBars(info, show, cols)
  const rows = []
  if (head) rows.push(head)
  if (show.agents) rows.push(...agentRows(info))
  rows.push(...meters)
  const chips = []
  if (info.mood.tone === 'dim') chips.push([{ text: GLYPH.dim + ' ' + info.mood.label, tone: 'dim' }])
  for (const [on, chip] of [
    [show.git, gitChip(info.git)],
    [show.pr, prChip(info.pr)],
    [show.model, modelChip(info)],
    [show.cost && info.cost != null, [{ text: '$' + Number(info.cost).toFixed(2), tone: 'dim' }]],
    [show.clock, [{ text: '◷ ', tone: 'cool' }, { text: info.clock, tone: 'dim' }]],
  ])
    if (on && chip) chips.push(chip)
  if (chips.length) rows.push(join(chips))
  return rows.map((r) => fit(r, cols))
}

// what Claude is doing as a chip for the one line: the plan with its count, else the action
// while it works, else nothing (idle)
function activityChip(info, show, withBar) {
  const { mood, plan } = info
  const [what] = mood.label.split(' · ')
  if (show.plan && plan && plan.done < plan.total) {
    const pct = plan.total ? (plan.done / plan.total) * 100 : 0
    return [{ text: '● ', tone: 'run' }, { text: clip(plan.current || 'next step', 28) + ' ' + plan.done + '/' + plan.total, tone: 'text' }, ...(withBar ? [{ text: ' ' }, ...miniBar(pct, 'run')] : [])]
  }
  if (info.working) return [{ text: '● ', tone: 'run' }, { text: clip(what, 28), tone: 'text' }]
  return null
}

const limitWords = (m) => m.name + (m.reset ? ' · resets ' + m.reset : '')

// one line in the look asked for: chips (rings, words and a mini bar each), text (an icon and
// words each, with git, the PR, the model and the time), or rings (big percentages). What needs
// you comes first; what Claude is doing comes after the meters
export function collapsedRow(info, show, cols) {
  const { mood } = info
  const chips = []
  if (mood.tone === 'ask' || mood.tone === 'hot') chips.push([{ text: GLYPH[mood.tone] + ' ' + mood.label, tone: mood.tone, bold: true }])
  const ms = info.meters.filter((m) => meterShown(m, show))
  const order = [...ms.filter((m) => m.kind !== 'context'), ...ms.filter((m) => m.kind === 'context')]
  const act = activityChip(info, show, show.collapsed === 'chips')
  if (show.collapsed === 'rings') {
    for (const m of order)
      chips.push([{ text: ring(m.pct) + ' ', tone: m.tone }, { text: Math.round(m.pct) + '%', tone: 'text', bold: true }, { text: ' ' + (m.kind === 'context' ? 'ctx' : limitWords(m)), tone: 'dim' }])
    if (show.cost && info.cost != null) chips.push([{ text: '$ ', tone: 'done' }, { text: Number(info.cost).toFixed(2), tone: 'done', bold: true }, { text: ' this session', tone: 'dim' }])
    if (act) chips.push(act)
    return fit(join(chips), cols)
  }
  if (show.collapsed === 'text') {
    for (const m of order) chips.push([{ text: ring(m.pct) + ' ', tone: m.tone }, { text: m.name + ' ' + Math.round(m.pct) + '%' + (m.reset ? ' ↻' + m.reset : ''), tone: 'dim' }])
    if (act) chips.push(act.map((s) => (s.tone === 'text' ? { ...s, tone: 'dim' } : s)))
    for (const [on, chip] of [
      [show.model, modelChip(info)],
      [show.git, gitChip(info.git)],
      [show.pr, prChip(info.pr)],
      [show.cost && info.cost != null, [{ text: '$', tone: 'done' }, { text: Number(info.cost).toFixed(2), tone: 'dim' }]],
      [show.clock, [{ text: '◷ ', tone: 'cool' }, { text: info.clock, tone: 'dim' }]],
    ])
      if (on && chip) chips.push(chip)
    return fit(join(chips, '  '), cols)
  }
  // chips: a ring, the words and a mini bar each
  for (const m of order)
    chips.push([{ text: ring(m.pct) + ' ', tone: m.tone }, { text: m.name + ' ', tone: 'text' }, { text: Math.round(m.pct) + '%', tone: 'text', bold: true }, ...(m.reset ? [{ text: ' ↻' + m.reset, tone: 'dim' }] : []), { text: ' ' }, ...miniBar(m.pct, m.tone)])
  if (act) chips.push(act)
  return fit(join(chips, '  │  '), cols)
}
