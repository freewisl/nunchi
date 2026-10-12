// The meters: the context window and the plan limits, with the time left until a limit resets
// and how fast it is being used. Pure, no $.

const LIMIT_NAMES = { five_hour: '5h', seven_day: '7d', seven_day_opus: '7d opus', seven_day_sonnet: '7d sonnet' }

export const limitName = (kind) => LIMIT_NAMES[kind] ?? String(kind).replace(/_/g, ' ')

// "3d5h", "1h14m", "42m", or '' once it has passed
export function untilReset(iso, now = Date.now()) {
  const ms = Date.parse(iso) - now
  if (!(ms > 0)) return ''
  const m = Math.ceil(ms / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d) return d + 'd' + h + 'h'
  return h ? h + 'h' + (m % 60) + 'm' : m + 'm'
}

// 312000 -> "312k", 1000000 -> "1m"
export function fmtK(n) {
  if (n == null) return ''
  if (n >= 1e6) return +(n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'm'
  if (n >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(n)
}

// newer readings replace older ones of the same kind; windows that have reset drop out
export function mergeLimits(old, fresh, now = Date.now()) {
  const byKind = new Map((old ?? []).map((r) => [r.kind, r]))
  for (const r of fresh ?? []) if (r && r.kind) byKind.set(r.kind, r)
  return [...byKind.values()].filter((r) => !r.resetsAt || Date.parse(r.resetsAt) > now).sort((a, b) => (a.kind < b.kind ? -1 : 1))
}

// percent an hour, from readings { t (ms), pct } oldest first; null until there are a few
// minutes of them, or while it is not rising (a window that reset starts over)
export function burnRate(samples) {
  const s = samples.slice(samples.findLastIndex((x, i) => i > 0 && x.pct < samples[i - 1].pct) + 1 || 0)
  if (s.length < 3) return null
  const first = s[0]
  const last = s[s.length - 1]
  const hours = (last.t - first.t) / 3600e3
  if (hours < 4 / 60) return null
  const rate = (last.pct - first.pct) / hours
  return rate >= 0.5 ? rate : null
}

// a meter's color: its own (ctx, five, week) until it runs hot
const toneOf = (kind, pct) => (pct >= 80 ? 'hot' : kind === 'context' ? 'ctx' : kind === 'five_hour' ? 'five' : 'week')

// [{ name, kind, pct, tone, reset, tokens?, window? }] for the context window and every limit
export function meters(usage, now = Date.now()) {
  const out = []
  const ctx = usage.context
  if (ctx && ctx.percent != null) {
    const p = ctx.percent
    out.push({ name: 'ctx', kind: 'context', pct: p, tone: toneOf('context', p), reset: '', tokens: ctx.tokens, window: ctx.window })
  }
  for (const rl of usage.rateLimits ?? []) {
    if (rl.percentUsed == null) continue
    const p = rl.percentUsed
    out.push({ name: limitName(rl.kind), kind: rl.kind, pct: p, tone: toneOf(rl.kind, p), reset: rl.resetsAt ? untilReset(rl.resetsAt, now) : '' })
  }
  return out
}
