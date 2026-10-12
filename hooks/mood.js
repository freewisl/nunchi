// What nunchi reads from the session, and what the mascot makes of it. Pure, no $.
//
// register.js fills the state from Claude Code's events; moodOf turns it into the motion the
// mascot plays, a tone (a theme color key) and a one-line label. Times are the mod's own clock
// (st.now, moved by its tick), except how long a turn has run, which is wall time.

export const ASK_DELAY_MS = 700 // a permission check still open this long is a prompt you see
export const LINGER_MS = 1500 // a finished tool keeps its motion this long, then Claude thinks
export const SLEEP_AFTER_MS = 5 * 60_000
const IDLE_LOOP_MS = 15_000 // idle, looking around for the last stretch of each loop
const LOOK_MS = 4000

// short reactions; `sound` names the clip in sounds/ that goes with one
export const FLASHES = {
  hello: { motion: 'wave', ms: 2600, tone: 'run', label: 'hi' },
  done: { motion: 'celebrate', ms: 2800, tone: 'done', label: 'done', sound: 'done' },
  oops: { motion: 'error', ms: 2000, tone: 'hot', label: 'something failed', sound: 'error' },
  commit: { motion: 'celebrate', ms: 2600, tone: 'done', label: 'committed', sound: 'commit' },
  push: { motion: 'jump', ms: 2200, tone: 'cool', label: 'pushed', sound: 'commit' },
  pr: { motion: 'dance', ms: 3000, tone: 'done', label: 'pull request', sound: 'commit' },
  pass: { motion: 'dance', ms: 2600, tone: 'done', label: 'tests passed', sound: 'done' },
}

// a test run, by its command: npm/pnpm/yarn/bun test, pytest, jest, vitest, go/cargo test, ...
export const TEST_COMMAND = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|pytest|jest|vitest|mocha|(?:go|cargo|deno|mix|dotnet)\s+test|make\s+test|gradle\w*\s+test|mvn\s+test|rspec|plugin\s+test)\b/

// the reaction a Bash call earns once it ran: git's own record of a commit, push or pull
// request, else a test run's outcome; null for anything else
export function bashFlash(command, ran) {
  const op = ran && ran.result && ran.result.gitOperation
  if (op && op.pr && ['created', 'merged', 'ready'].includes(op.pr.action)) return ['pr', 'PR #' + op.pr.number + ' ' + op.pr.action]
  if (op && op.push) return ['push', 'pushed ' + op.push.branch]
  if (op && op.commit) return ['commit', op.commit.kind + ' ' + String(op.commit.sha).slice(0, 7)]
  if (op && op.branch) return ['commit', op.branch.action + ' ' + op.branch.ref]
  if (!TEST_COMMAND.test(String(command ?? '')) || !ran || ran.deny !== undefined) return null
  return ran.isError === true ? ['oops', 'tests failed'] : ['pass', 'tests passed']
}

const KINDS = {
  read: ['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch', 'ToolSearch'],
  run: ['Agent', 'Task'],
  think: ['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'EnterPlanMode', 'ExitPlanMode'],
}

// read, run, think, or work for anything that changes something (edits, commands, MCP tools)
export function toolKind(tool) {
  for (const [kind, tools] of Object.entries(KINDS)) if (tools.includes(tool)) return kind
  return 'work'
}

const file = (p) => String(p ?? '').split('/').pop()
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's')

// what a tool call is doing, in a few words
export function actionOf(e) {
  switch (e.tool) {
    case 'Read':
      return 'Reading ' + file(e.file_path)
    case 'Grep':
    case 'Glob':
    case 'LS':
    case 'ToolSearch':
      return 'Searching'
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return 'Editing ' + file(e.file_path)
    case 'NotebookEdit':
      return 'Editing ' + file(e.notebook_path)
    case 'Bash':
      return 'Running ' + clip(String(e.command ?? '').trim().split(/\s+/).slice(0, 2).join(' '), 24)
    case 'WebFetch':
    case 'WebSearch':
      return 'Browsing'
    case 'Agent':
    case 'Task':
      return 'Delegating'
    case 'AskUserQuestion':
      return 'Asking you'
    default:
      return toolKind(e.tool) === 'think' ? 'Planning' : String(e.tool).replace(/^mcp__(.+?)__/, '$1 ')
  }
}

// "42s", "1m 12s", "2h 5m"
export function elapsed(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm ' + (s % 60) + 's'
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'
}

export function newState() {
  return {
    now: 0,
    lastActive: 0,
    turn: null, // while Claude works on a prompt: see newTurn
    checks: new Map(), // permission checks that asked: tool use id -> st.now when asked
    questions: new Set(), // AskUserQuestion calls in flight
    asked: false, // the last answer ended in a question
    agents: new Set(), // subagents running
    flash: null, // { name, label, until }: a short reaction
    play: null, // { motion, until }: from /nunchi play
  }
}

export function newTurn(wall = Date.now()) {
  return { startedAt: wall, tools: 0, kind: 'think', action: 'Thinking', running: 0, endedAt: -Infinity }
}

// { motion, tone, label } for this moment, most urgent first
export function moodOf(st, wall = Date.now()) {
  const now = st.now
  if (st.play && now < st.play.until) return { motion: st.play.motion, tone: 'cool', label: 'playing ' + st.play.motion }
  for (const at of st.checks.values()) if (now - at >= ASK_DELAY_MS) return { motion: 'ask', tone: 'ask', label: 'needs your OK' }
  if (st.questions.size) return { motion: 'ask', tone: 'ask', label: 'has a question for you' }
  if (st.flash && now < st.flash.until) {
    const f = FLASHES[st.flash.name]
    return { motion: f.motion, tone: f.tone, label: st.flash.label ?? f.label }
  }
  const t = st.turn
  if (t) {
    const busy = t.running > 0 || now - t.endedAt < LINGER_MS
    const waiting = !busy && st.agents.size > 0
    const parts = [busy ? t.action : waiting ? 'Waiting on agents' : 'Thinking']
    if (st.agents.size) parts.push(plural(st.agents.size, 'agent'))
    if (t.tools) parts.push(plural(t.tools, 'tool'))
    parts.push(elapsed(wall - t.startedAt))
    return { motion: busy ? t.kind : waiting ? 'run' : 'think', tone: 'run', label: parts.join(' · ') }
  }
  if (st.asked) return { motion: 'ask', tone: 'ask', label: 'waiting for your answer' }
  const quiet = now - st.lastActive
  if (quiet >= SLEEP_AFTER_MS) return { motion: 'sleep', tone: 'dim', label: 'napping · idle ' + elapsed(quiet) }
  return { motion: quiet % IDLE_LOOP_MS >= IDLE_LOOP_MS - LOOK_MS ? 'look' : 'idle', tone: 'dim', label: 'ready' }
}

// a summary of the turn that just ended, for the "done" flash
export function turnSummary(t, wall = Date.now()) {
  const parts = ['done']
  if (t && t.tools) parts.push(plural(t.tools, 'tool'))
  if (t) parts.push(elapsed(wall - t.startedAt))
  return parts.join(' · ')
}
