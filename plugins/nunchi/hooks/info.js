// What nunchi shows besides the mood: git, the model and the plan (Claude's todo list or tasks).
// Pure, no $: register.js runs git and reads the session, these read what came back.

// `git status --porcelain=v2 --branch` -> { branch, ahead, behind, changed, untracked, conflicts }
export function parseStatus(out) {
  const g = { branch: null, oid: null, ahead: 0, behind: 0, changed: 0, untracked: 0, conflicts: 0 }
  for (const line of String(out).split('\n')) {
    if (line.startsWith('# branch.head ')) g.branch = line.slice(14).trim()
    else if (line.startsWith('# branch.oid ')) g.oid = line.slice(13).trim()
    else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/)
      if (m) [g.ahead, g.behind] = [+m[1], +m[2]]
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) g.changed++
    else if (line.startsWith('u ')) g.conflicts++
    else if (line.startsWith('? ')) g.untracked++
  }
  if (g.branch === '(detached)') g.branch = '@' + String(g.oid ?? '').slice(0, 7)
  return g
}

// `git diff --shortstat HEAD` -> { added, removed }
export function parseShortstat(out) {
  const n = (re) => +(String(out).match(re)?.[1] ?? 0)
  return { added: n(/(\d+) insertion/), removed: n(/(\d+) deletion/) }
}

// "claude-opus-5-5[1m]" -> "opus 5.5 1m"; a name that is already short stays as it is
export function shortModel(m) {
  if (!m) return ''
  return String(m)
    .toLowerCase()
    .replace(/^claude-/, '')
    .replace(/\[(\w+)\]$/, ' $1')
    .replace(/-(\d+)-(\d+)/, ' $1.$2')
    .replace(/-(\d+)(?=\s|$)/, ' $1')
}

// ---------- the plan: TodoWrite's list, or the task tools' tasks ----------

export const newPlan = () => new Map() // id -> { subject, active, status }

export function planFromTodos(plan, todos) {
  plan.clear()
  todos.forEach((t, i) => plan.set('todo:' + i, { subject: t.content, active: t.activeForm || t.content, status: t.status }))
}

export function planTaskCreated(plan, id, input) {
  if (id != null) plan.set(String(id), { subject: input.subject, active: input.activeForm || input.subject, status: 'pending' })
}

export function planTaskUpdated(plan, input) {
  const t = plan.get(String(input.taskId))
  if (!t) return
  if (input.status === 'deleted') plan.delete(String(input.taskId))
  else Object.assign(t, input.status && { status: input.status }, input.subject && { subject: input.subject }, input.activeForm && { active: input.activeForm })
}

export function planFromList(plan, tasks) {
  const old = new Map(plan)
  plan.clear()
  for (const t of tasks) plan.set(String(t.id), { subject: t.subject, active: old.get(String(t.id))?.active ?? t.subject, status: t.status })
}

// { done, total, current, steps } or null without a plan; steps: done, now or todo per item
export function planOf(plan) {
  if (!plan.size) return null
  const items = [...plan.values()]
  const now = items.find((t) => t.status === 'in_progress') ?? items.find((t) => t.status === 'pending')
  return {
    done: items.filter((t) => t.status === 'completed').length,
    total: items.length,
    current: now ? now.active : '',
    steps: items.map((t) => (t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'now' : 'todo')),
  }
}

// ---------- the pull request: `gh pr view --json number,state,isDraft,reviewDecision,statusCheckRollup` ----------

// -> { number, state, draft, review, pass, fail, pending } or null
export function parsePr(out) {
  let j
  try {
    j = JSON.parse(out)
  } catch {
    return null
  }
  if (!j || typeof j.number !== 'number') return null
  const pr = { number: j.number, state: String(j.state ?? 'OPEN'), draft: j.isDraft === true, review: String(j.reviewDecision ?? ''), pass: 0, fail: 0, pending: 0 }
  for (const c of j.statusCheckRollup ?? []) {
    // a check run has status and conclusion, a status context its state
    const s = String(c.conclusion || c.state || '').toUpperCase()
    if (c.status && c.status !== 'COMPLETED') pr.pending++
    else if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(s)) pr.pass++
    else if (['PENDING', 'EXPECTED', ''].includes(s)) pr.pending++
    else pr.fail++
  }
  return pr
}

// ---------- the effort: what the settings ask for the model ----------

// the bare model id: "claude-opus-5-5[1m]" -> "claude-opus-5-5"
export const modelId = (m) => String(m ?? '').replace(/\[[^\]]*\]$/, '')

// the settings' effort for `model`: its own (`modelSettings[id].effortLevel`), else the
// settings' `effortLevel`; '' when neither says
export function effortFrom(settings, model) {
  if (!settings || typeof settings !== 'object') return ''
  const per = settings.modelSettings && typeof settings.modelSettings === 'object' ? settings.modelSettings : {}
  const v = per[modelId(model)]?.effortLevel ?? per[model]?.effortLevel ?? settings.effortLevel
  return typeof v === 'string' || typeof v === 'number' ? String(v) : ''
}

// just the effort parts of the settings, so nothing else they hold is kept
export function effortSettings(settings) {
  if (!settings || typeof settings !== 'object') return null
  const per = {}
  for (const [id, m] of Object.entries(settings.modelSettings ?? {})) if (m && typeof m === 'object' && m.effortLevel != null) per[id] = { effortLevel: m.effortLevel }
  return { effortLevel: settings.effortLevel, modelSettings: per }
}
