import { expect, mock, test } from 'claude-code/testing'
import { drawBar } from '../hooks/bars.js'

const BAND = {
  plugin: 'nunchi',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  viewport: { columns: 120, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const HINT = {
  plugin: 'nunchi',
  component: 'PromptHint',
  requestId: 'prompt-hint',
  viewport: { columns: 120, rows: 40 },
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

const PICKER = {
  plugin: 'nunchi',
  component: 'Pane',
  requestId: 'nunchi-style',
  viewport: { columns: 160, rows: 40 },
  props: { title: 'nunchi style', isFocused: true, bodyColumns: 100, placement: 'inline' },
} as const

const inAnHour = () => new Date(Date.now() + 74 * 60_000).toISOString()

const STATUS = ['# branch.oid 7b6656c0ffee', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1', '1 .M N... 100644 100644 100644 a b src/auth.ts', '1 M. N... 100644 100644 100644 a b src/db.ts', '? notes.md', ''].join('\n')
const PR = JSON.stringify({
  number: 12,
  state: 'OPEN',
  isDraft: false,
  reviewDecision: 'APPROVED',
  statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS', conclusion: '' }],
})

type Run = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout: string): Run => ({ exitCode: 0, stdout, stderr: '' })

// everything Claude Code would answer for this mod; `run` answers $.process.run by its command line
function stubs(on, toolCall: any = () => ({ result: 'ok' }), saved = new Map<string, unknown>(), run?: (args: string) => Run) {
  const clock = mock.clock(on)
  const sounds: string[] = []
  const usage = { five: 31 }
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: undefined }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('process.run', ($, e) => {
    const args = e.argv.join(' ')
    const fallback = args.startsWith('gh ') ? ok(PR) : args.includes(' status ') ? ok(STATUS) : ok(' 2 files changed, 42 insertions(+), 7 deletions(-)\n')
    return { value: run ? run(args) ?? fallback : fallback }
  })
  on('audio.play', ($, e) => {
    sounds.push(String(e.clip.asset))
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.usage', () => ({
    value: {
      context: { tokens: 120_000, window: 1_000_000, percent: 12 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: usage.five, resetsAt: inAnHour() },
        { kind: 'seven_day', percentUsed: 85, resetsAt: inAnHour() },
      ],
      cost: { usd: 0.42 },
    },
  }))
  on('session.start', () => ({ cwd: '/work' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', toolCall)
  on('tool.check', () => ({ decision: 'ask' }))
  on('agent.spawn', ($, e) => ({ agentId: 'a1', model: 'claude-haiku-4-5' }))
  on('turn.complete', () => ({ text: '' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', ($e, e) => $e.ui.resolve(e).Box({ children: [] }))
  return { saved, clock, sounds, usage }
}

const start = async ($, clock?) => {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  if (clock) await clock.advance(100) // git and gh are read beside the start
}
const status = async ($) => (await $.command.run({ command: 'nunchi', args: 'status' })).text as string
const nunchi = async ($, args: string) => (await $.command.run({ command: 'nunchi', args })).text as string
const done = (turnId: string, answer = 'ok', agentId?: string) => ({ turnId, answer, durationMs: 5, isAborted: false, reason: 'answer', usage: null, ...(agentId ? { agentId } : {}) })
// the panel's rows: in the band over the prompt (the default place), or under it
const hud = async ($, props = {}, columns = 120, where: 'band' | 'hint' = 'band') => {
  const site =
    where === 'band'
      ? await $.ui.mount({ ...BAND, viewport: { columns, rows: 40 }, props: { ...BAND.props, bodyColumns: columns - 5, maxRows: 30, ...props }, surface: 'terminal' })
      : await $.ui.mount({ ...HINT, viewport: { columns, rows: 40 }, props: { ...HINT.props, ...props }, surface: 'terminal' })
  const found = await site.find({ key: 'nunchi-hud' })
  const rows: string[] = []
  for (let i = 0; i < 12; i++) {
    const row = await site.find({ key: 'hud' + i })
    if (row) rows.push(textOf(row))
  }
  await site.unmount()
  return { found, rows, all: rows.join('\n') }
}
// the text an element shows, from what find() describes
function textOf(el: any): string {
  if (el == null) return ''
  if (typeof el === 'string') return el
  if (Array.isArray(el)) return el.map(textOf).join('')
  if (typeof el.text === 'string') return el.text
  return textOf(el.children ?? el.props?.children ?? [])
}

test('the mascot sits above the prompt with the panel under it', async ($, on) => {
  const { clock } = stubs(on)
  await start($, clock)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Image', key: 'nunchi-pet' })).toBeDefined()
  expect(await band.find({ key: 'nunchi-hud' })).toBeDefined()
  await band.unmount()
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await hint.find({ key: 'nunchi-hud' })).toBeUndefined()
  await hint.unmount()

  const { found, all } = await hud($)
  expect(found).toBeDefined()
  expect(all).toContain('git main')
  expect(all).toContain(' ↑2')
  expect(all).toContain(' 2 changed 1 new')
  expect(all).toContain('(+42 −7)')
  expect(all).toContain('PR #12 ◷1 approved')
  expect(all).toContain('◆ opus 5.5')
  expect(all).toContain('ctx · 12%')
  expect(all).toContain('120k/1m')
  expect(all).toContain('5h · 31% used')
  expect(all).toContain('↻1h14m')
  expect(all).not.toContain('$0.42') // cost is off until asked for
  const { rows } = await hud($)
  expect(rows.findIndex((r) => r.includes('7d · 85% used'))).toBeLessThan(rows.findIndex((r) => r.includes('git main')))
  expect(rows[rows.length - 1]).toContain('◆ opus 5.5')

  const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  expect(await desk.find({ type: 'Image' })).toBeUndefined()
})

test('a wide terminal puts the mascot beside the panel, right of the bars; a narrow one above it', async ($, on) => {
  const { clock } = stubs(on)
  await start($, clock)
  const band = async (columns: number) => {
    const site = await $.ui.mount({ ...BAND, viewport: { columns, rows: 40 }, props: { ...BAND.props, bodyColumns: columns - 5, maxRows: 30 }, surface: 'terminal' })
    const found = { side: await site.find({ key: 'nunchi-side' }), hud: await site.find({ key: 'nunchi-hud' }), pet: await site.find({ key: 'nunchi-band' }) }
    await site.unmount()
    return found
  }
  const wide = await band(220)
  expect(wide.side).toBeDefined()
  expect(wide.hud.props.width).toBeGreaterThanOrEqual(96)
  expect(wide.hud.props.width).toBeLessThan(120)
  expect(wide.pet.props.marginLeft).toBeGreaterThanOrEqual(3)
  expect(await status($)).toMatch(/at \d+\/(\d+)/)
  const narrow = await band(100)
  expect(narrow.side).toBeUndefined()
  expect(narrow.hud).toBeDefined()
  expect(await nunchi($, 'pet above')).toMatch(/pet on above/)
  expect((await band(220)).side).toBeUndefined()
  expect(await nunchi($, 'pet side')).toMatch(/pet on side/)
  expect((await band(220)).side).toBeDefined()
})

test('a bar takes a quarter of the terminal, in every style', async ($, on) => {
  const { clock } = stubs(on)
  await start($, clock)
  for (const style of ['solid', 'segments']) {
    await nunchi($, 'style ' + style)
    for (const columns of [200, 120]) {
      const row = (await hud($, {}, columns)).rows.find((r) => r.includes('5h · 31% used'))!
      // solid: the reset comes two spaces after the bar; segments: the bar is its ▰ and ▱
      const width = style === 'solid' ? [...row.slice(0, row.indexOf('↻'))].length - 2 : [...row].filter((c) => c === '▰' || c === '▱').length
      expect(Math.abs(width - columns / 4)).toBeLessThan(5)
    }
  }
})

test('a narrow terminal cuts the panel rows instead of wrapping them', async ($, on) => {
  const { clock } = stubs(on)
  await start($, clock)
  const { rows } = await hud($, {}, 45)
  expect(rows.length).toBeGreaterThan(2)
  for (const r of rows) expect([...r].length).toBeLessThanOrEqual(38)
})

test('render auto turns to pixel text where the terminal is never asked about pictures (macOS Terminal)', async ($, on) => {
  const { clock } = stubs(on)
  const deny = 'the Image draws its alt here: the terminal draws no placeholder images (env: terminal=Apple_Terminal, not asked yet, no answer)'
  on('ui.blit', () => ({ deny }))
  await start($, clock)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Image', key: 'nunchi-pet' })).toBeDefined()
  // a terminal about to answer gets a moment
  await clock.advance(1000)
  expect(await status($)).toMatch(/render auto → smooth picture/)
  await clock.advance(3000)
  expect(await status($)).toMatch(/render auto → pixel text \(the terminal draws no placeholder images \(env: terminal=Apple_Terminal/)
  await band.unmount()
  const again = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await again.find({ type: 'Image', key: 'nunchi-pet' })).toBeUndefined()
  expect(await again.find({ key: 'nunchi-band' })).toBeDefined()
  await again.unmount()
})

test('place below moves the mascot and the panel under the prompt, after the mode line', async ($, on) => {
  const { clock } = stubs(on)
  await start($, clock)
  expect(await nunchi($, 'place below')).toMatch(/place below/)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ key: 'nunchi-hud' })).toBeUndefined()
  expect(await band.find({ key: 'nunchi-band' })).toBeUndefined()
  await band.unmount()
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await hint.find({ type: 'Image', key: 'nunchi-pet' })).toBeDefined()
  expect(await hint.find({ key: 'nunchi-hud' })).toBeDefined()
  // the ticker keeps it moving there
  await clock.advance(1000)
  expect(await status($)).toMatch(/render auto → smooth picture/)
  await hint.unmount()
  const { found, all } = await hud($, {}, 120, 'hint')
  expect(found).toBeDefined()
  expect(all).toContain('git main')
  // a wide terminal keeps the mascot beside the panel there as well
  const wide = await $.ui.mount({ ...HINT, viewport: { columns: 220, rows: 40 }, surface: 'terminal' })
  expect(await wide.find({ key: 'nunchi-side' })).toBeDefined()
  await wide.unmount()
  expect(await nunchi($, 'place above')).toMatch(/place above/)
  const back = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await back.find({ key: 'nunchi-band' })).toBeUndefined()
  await back.unmount()
})

test('a short band keeps the mascot and folds the panel into one line', async ($, on) => {
  const { clock } = stubs(on)
  await start($, clock)
  const { rows } = await hud($, { maxRows: 7 })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatch(/◔ 5h 31%/)
})

test('the mood follows what Claude does', async ($, on) => {
  const { clock } = stubs(on)
  await start($)
  expect(await status($)).toMatch(/mood wave · hi/)
  await $.prompt.submit({ text: 'Fix the login bug' })
  await $.turn.start({ text: 'Fix the login bug', turnId: 't1' })
  expect(await status($)).toMatch(/mood think · Thinking · 0s/)
  await $.tool.call({ tool: 'Read', file_path: '/src/auth.ts' })
  expect(await status($)).toMatch(/mood read · Reading auth\.ts · 1 tool/)
  await $.tool.call({ tool: 'Edit', file_path: '/src/auth.ts', old_string: 'a', new_string: 'b' })
  expect(await status($)).toMatch(/mood work · Editing auth\.ts · 2 tools/)
  const working = await hud($, { isWorking: true })
  expect(working.rows[0]).toMatch(/Editing auth\.ts +2 tools/)
  await clock.advance(2000)
  expect(await status($)).toMatch(/mood think · Thinking · 2 tools/)
  await $.turn.complete(done('t1'))
  expect(await status($)).toMatch(/mood celebrate · done · 2 tools/)
  await clock.advance(3000)
  expect(await status($)).toMatch(/mood (idle|look) · ready/)
  await clock.advance(5 * 60_000)
  expect(await status($)).toMatch(/mood sleep · napping/)
})

test('a permission prompt or a question raises the ? and sounds once', async ($, on) => {
  const { clock, sounds } = stubs(on)
  await start($)
  await $.turn.start({ text: 'clean up', turnId: 't1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' } })
  expect(await status($)).not.toMatch(/mood ask/)
  await clock.advance(800)
  expect(await status($)).toMatch(/mood ask · needs your OK/)
  await clock.advance(3000)
  expect(sounds.filter((s) => s === 'sounds/alert.wav')).toHaveLength(1)
  const { rows } = await hud($)
  expect(rows[0]).toContain('needs your OK')
  await $.turn.complete(done('t1', 'Done. Should I clear the cache too?'))
  expect(await status($)).toMatch(/mood ask · waiting for your answer/)
  await $.prompt.submit({ text: 'yes' })
  expect(await status($)).not.toMatch(/mood ask/)

  await nunchi($, 'sound off')
  await clock.advance(2000)
  await $.turn.start({ text: 'again', turnId: 't2' })
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' } })
  await clock.advance(800)
  expect(sounds.filter((s) => s === 'sounds/alert.wav')).toHaveLength(2) // the question above, none since
})

test('git and test runs earn reactions: commit, push, failing and passing tests', async ($, on) => {
  let tests = 'fail'
  const { clock, sounds } = stubs(on, ($, e) => {
    if (/git commit/.test(e.command)) return { result: { stdout: '', gitOperation: { commit: { sha: '7b6656c0ffee', kind: 'committed', branch: 'main' } } } }
    if (/git push/.test(e.command)) return { result: { stdout: '', gitOperation: { push: { branch: 'main' } } } }
    if (/npm test/.test(e.command)) return tests === 'fail' ? { result: 'FAIL 2 tests', isError: true } : { result: 'ok' }
    if (/ls/.test(e.command)) return { result: 'no such file', isError: true }
    return { result: 'ok' }
  })
  await start($, clock)
  await $.turn.start({ text: 'ship it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(await status($)).toMatch(/mood error · tests failed/)
  await clock.advance(2500)
  tests = 'pass'
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(await status($)).toMatch(/mood dance · tests passed/)
  await clock.advance(3000)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix login"' })
  expect(await status($)).toMatch(/mood celebrate · committed 7b6656c/)
  await clock.advance(3000)
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(await status($)).toMatch(/mood jump · pushed main/)
  await clock.advance(3000)
  await $.tool.call({ tool: 'Bash', command: 'ls nope' })
  expect(await status($)).toMatch(/mood error · Bash failed/)
  expect(sounds).toEqual(['sounds/error.wav', 'sounds/done.wav', 'sounds/commit.wav', 'sounds/commit.wav', 'sounds/error.wav'])
})

test('the plan draws as a bar, as dots in the dots style', async ($, on) => {
  stubs(on, ($, e) => (e.tool === 'TaskCreate' ? { result: { task: { id: e.subject === 'Map routes' ? '1' : '2', subject: e.subject } } } : { result: 'ok' }))
  await start($)
  await $.turn.start({ text: 'plan it', turnId: 't1' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Map routes', description: '', activeForm: 'Mapping routes' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write tests', description: '', activeForm: 'Writing tests' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })
  expect(await status($)).toMatch(/plan 1\/2 Writing tests/)

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Map routes', activeForm: 'Mapping routes', status: 'completed' },
      { content: 'Fix auth', activeForm: 'Fixing auth', status: 'in_progress' },
      { content: 'Run suite', activeForm: 'Running suite', status: 'pending' },
    ],
  })
  expect(await status($)).toMatch(/plan 1\/3 Fixing auth/)
  expect((await hud($)).rows[0]).toMatch(/Fixing auth 1\/3/)
  await nunchi($, 'style dots')
  expect((await hud($)).rows[0]).toMatch(/^●─◉┄○ Fixing auth 1\/3/)

  // a finished plan stays until the next turn starts
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Map routes', activeForm: 'Mapping routes', status: 'completed' }] })
  await $.turn.complete(done('t1'))
  expect(await status($)).toMatch(/plan 1\/1/)
  await $.turn.start({ text: 'next', turnId: 't2' })
  expect(await status($)).toMatch(/no plan/)
})

test('a row per subagent: its task, what it runs, its model, then a tick', async ($, on) => {
  const { clock } = stubs(on)
  await start($, clock)
  await $.turn.start({ text: 'look into it', turnId: 't1' })
  await $.agent.spawn({ prompt: 'map the auth flow', description: 'Explore auth flow', subagentType: 'Explore' })
  await $.tool.call({ tool: 'Read', file_path: '/src/login.ts', agentId: 'a1' })
  let { all } = await hud($)
  expect(all).toMatch(/↳ Explore auth flow +Reading login\.ts +haiku 4\.5/)
  expect(await status($)).toMatch(/1 agent/)
  await $.turn.complete({ ...done('a-turn', 'found it', 'a1') })
  all = (await hud($)).all
  expect(all).toMatch(/↳ Explore auth flow +done .*✓/)
  await clock.advance(6000)
  expect((await hud($)).all).not.toContain('↳')
})

test('the model shows with the effort: the settings first, then what each request asks for', async ($, on) => {
  stubs(on)
  on('settings.read', () => ({ value: { effortLevel: 'medium', env: { TOKEN: 'not kept' }, modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } } } }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: "", toolUses: [] } as any
  })
  await start($)
  expect(await status($)).toMatch(/opus 5\.5 · xhigh/)
  expect((await hud($)).all).toContain('◆ opus 5.5 · xhigh')
  expect(await status($)).not.toContain('not kept')
  const step = async (model: string, effort: string) => {
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1 } as any) as any) {
    }
  }
  await step('claude-opus-5-5', 'high')
  expect((await hud($)).all).toContain('◆ opus 5.5 · high')
  await step('claude-sonnet-5-5', 'low')
  expect(await status($)).toMatch(/sonnet 5\.5 · low/)
})

test('limits rising show how fast they burn', async ($, on) => {
  const { clock, usage } = stubs(on)
  await start($, clock)
  for (let i = 1; i <= 6; i++) {
    usage.five = 31 + i * 2 // two points a minute: 120%/h
    await clock.advance(60_000)
  }
  expect(await status($)).toMatch(/5h 43% ↻\d+h\d+m \+120%\/h/)
  expect((await hud($)).all).toMatch(/5h · 43% used.*\+120%\/h/)
})

test('outside a repository there is no git; without gh there is no PR, and it is not asked again', async ($, on) => {
  const asked: string[] = []
  const { clock } = stubs(on, undefined, undefined, (args) => {
    asked.push(args)
    if (args.startsWith('gh ')) return { exitCode: 4, stdout: '', stderr: 'To get started with GitHub CLI, please run:  gh auth login' }
    return args.includes(' status ') ? ok(STATUS) : ok('')
  })
  await start($, clock)
  expect(await status($)).toMatch(/gh is not logged in/)
  await clock.advance(120_000)
  expect(asked.filter((a) => a.startsWith('gh ')).length).toBe(1)
  expect((await hud($)).all).not.toContain('PR #')
  await nunchi($, 'git off')
  expect(await status($)).toMatch(/shows plan agents pr model context limits$/m)
})

test('no repository: no git row parts', async ($, on) => {
  const { clock } = stubs(on, undefined, undefined, () => ({ exitCode: 128, stdout: '', stderr: 'not a git repository' }))
  await start($, clock)
  expect(await status($)).toMatch(/no git · no PR/)
  expect((await hud($)).all).not.toContain('git ')
})

test('the mascot wanders the whole band, small by default, and stops to read', async ($, on) => {
  const { clock } = stubs(on)
  await start($)
  await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(3000)
  expect(await status($)).toMatch(/mascot \w+ [←→] at \d+\/83 · size small/)

  await $.turn.start({ text: 'look around', turnId: 't1' })
  await $.tool.call({ tool: 'Grep', pattern: 'auth' })
  await clock.advance(200)
  const at = (s: string) => s.match(/ at (\d+)\//)![1]
  const first = await status($)
  expect(first).toMatch(/mascot read/)
  await clock.advance(500)
  expect(at(await status($))).toBe(at(first))
})

test('size big draws the big mascot where it fits; roam off keeps it still', async ($, on) => {
  const { clock } = stubs(on)
  await start($)
  await nunchi($, 'render pixel')
  await nunchi($, 'roam off')
  const small = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await small.find({ key: 'px4' })).toBeDefined()
  expect(await small.find({ key: 'px5' })).toBeUndefined()
  await small.unmount()
  await nunchi($, 'size big')
  const big = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await big.find({ key: 'px9' })).toBeDefined()
  await big.unmount()
  const short = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 7 }, surface: 'terminal' })
  expect(await short.find({ key: 'px5' })).toBeUndefined()
  await short.unmount()
  await clock.advance(6000)
  expect(await status($)).toMatch(/mascot (idle|look) → at 0\/\d+ · size big · render pixel → pixel text/)
})

test('the picker opens on /nunchi style, and a press picks a style, a look and a theme', async ($, on) => {
  const { saved } = stubs(on)
  await start($)
  expect(await nunchi($, 'style')).toMatch(/picker: 1–7 bar style/)
  const panel = await hud($)
  const pane = await $.ui.mount({ ...PICKER, surface: 'terminal' })
  // the preview is the panel's own first bar, the same text at the same width
  const preview = textOf(await pane.find({ key: 'style:solid' }))
  expect(preview).toContain(panel.rows[0].trimEnd())
  expect(preview).not.toContain('Fixing auth')
  expect(await pane.find({ key: 'look:rings' })).toBeDefined()
  expect(await pane.find({ key: 'theme:ocean' })).toBeDefined()
  await pane.press({ key: 'style:blocks' })
  expect((saved.get('prefs') as any).style).toBe('blocks')
  expect((await hud($)).all).toMatch(/[█░▏▎▍▌▋▊▉]{6,} ctx · 12%/)
  await pane.press({ key: 'theme:neon' })
  expect((saved.get('prefs') as any).theme).toBe('neon')
  await pane.press({ key: 'look:rings' })
  expect((saved.get('prefs') as any).look).toBe('rings')
  const line = await hud($)
  expect(line.rows).toHaveLength(1)
  expect(line.rows[0]).toMatch(/◔ 31% 5h · resets 1h14m/)
  await pane.press({ key: 'place:below' })
  expect((saved.get('prefs') as any).place).toBe('below')
  await pane.press({ key: 'pet:above' })
  expect((saved.get('prefs') as any).petAt).toBe('above')
  await pane.unmount()
  const hint = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await hint.find({ key: 'nunchi-band' })).toBeDefined()
  await hint.unmount()
  expect(await nunchi($, 'style spark')).toMatch(/style spark/)
  expect(await nunchi($, 'style nope')).toMatch(/picker/)
})

test('/nunchi switches between the panel and one line; view auto opens the panel while Claude works', async ($, on) => {
  const { clock } = stubs(on)
  await start($, clock)
  expect((await hud($)).rows.length).toBeGreaterThan(2)
  expect(await nunchi($, '')).toMatch(/one line/)
  const line = await hud($)
  expect(line.rows).toHaveLength(1)
  expect(line.rows[0]).toMatch(/◔ 5h 31% ↻1h14m/)
  await nunchi($, 'look text')
  expect((await hud($)).rows[0]).toContain('git main')
  await nunchi($, 'view auto')
  expect((await hud($)).rows).toHaveLength(1)
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect((await hud($)).rows.length).toBeGreaterThan(2)
  expect(await nunchi($, '')).toMatch(/the panel/)
})

test('choices are saved; off hides everything', async ($, on) => {
  const { saved, clock } = stubs(on)
  await start($, clock)
  expect(await nunchi($, 'theme ocean')).toMatch(/theme ocean/)
  expect((saved.get('prefs') as any).theme).toBe('ocean')
  expect(await nunchi($, 'theme nope')).toMatch(/themes: .*\[ocean\]/)

  await nunchi($, 'render pixel')
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Image' })).toBeUndefined()
  expect(await band.find({ text: /[▀▄]/ })).toBeDefined()
  await band.unmount()

  await nunchi($, 'limits off')
  await nunchi($, 'cost on')
  const { all } = await hud($)
  expect(all).not.toContain('5h ')
  expect(all).toContain('ctx ')
  expect(all).toContain('$0.42')

  await nunchi($, 'off')
  expect((saved.get('prefs') as any).on).toBe(false)
  const band2 = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band2.find({ key: 'nunchi-band' })).toBeUndefined()
  await band2.unmount()
  expect((await hud($)).found).toBeUndefined()
  expect((await hud($, {}, 120, 'hint')).found).toBeUndefined()
})

test('preferences saved by 0.1 and 0.2 come back under their new names', async ($, on) => {
  stubs(on, undefined, new Map<string, unknown>([['prefs', { theme: 'grape', style: 'pixel', meters: false }]]))
  await start($)
  const out = await status($)
  expect(out).toMatch(/render pixel → pixel text/)
  expect(out).toMatch(/style solid · look chips · theme grape/)
  expect(out).toMatch(/shows plan agents git pr model$/m)
})

test('0.2 drew the mascot big and the bars as segments: 0.3 starts small and solid', async ($, on) => {
  stubs(on, undefined, new Map<string, unknown>([['prefs', { theme: 'ocean', style: 'segments', size: 'big', render: 'auto' }]]))
  await start($)
  expect(await status($)).toMatch(/size small/)
  expect(await status($)).toMatch(/style solid/)
})

test('play runs a motion for a few seconds', async ($, on) => {
  const { clock } = stubs(on)
  await start($)
  expect(await nunchi($, 'play dance')).toMatch(/plays dance/)
  expect(await status($)).toMatch(/mood dance/)
  await clock.advance(7000)
  expect(await status($)).not.toMatch(/mood dance/)
})

test('a usage update with one window keeps the other', async ($, on) => {
  stubs(on)
  await start($)
  await $.session.measure({ context: { tokens: 1, window: 10, percent: 10 }, rateLimits: [{ kind: 'seven_day', percentUsed: 50, resetsAt: inAnHour() }], changed: ['rateLimits'] })
  const out = await status($)
  expect(out).toMatch(/ctx 10%/)
  expect(out).toMatch(/5h 31%/)
  expect(out).toMatch(/7d 50%/)
})

test('the bars move: a shimmer sweeps solid, pixel dots keep their shape and twinkle, heads pulse', async () => {
  const label = [{ text: 'Fixing auth 3/5' }]
  const at = (style: string, frame: number, active = true) => drawBar(style, { fill: [0, 0.6], tone: 'run', label, width: 30, frame, active })
  const text = (spans: any[]) => spans.map((x) => x.text).join('')
  // the cell the first span `hit` picks starts at, -1 for none
  const where = (spans: any[], hit: (x: any) => boolean) => {
    const i = spans.findIndex(hit)
    return i < 0 ? -1 : text(spans.slice(0, i)).length
  }
  const shimmer = (spans: any[]) => where(spans, (x) => x.bg === 'run~hi')
  // solid: the light band moves along the lit part while active, and is not there otherwise
  expect(shimmer(at('solid', 6))).not.toBe(shimmer(at('solid', 9)))
  expect(at('solid', 6, false).some((x) => x.bg === 'run~hi')).toBe(false)
  // pixel: the same dots every frame, the shades changing; a dense head where the fill ends
  expect(text(at('pixel', 0))).toBe(text(at('pixel', 5)))
  const shades = new Set<string>()
  for (let f = 0; f < 20; f++) shades.add(JSON.stringify(at('pixel', f).map((x) => x.tone)))
  expect(shades.size).toBeGreaterThan(1)
  expect(text(at('pixel', 0))).toContain('⣟ Fixing auth 3/5 ')
  // segments: the segment after the fill blinks; line: the head pulses
  expect(at('segments', 0).find((x) => x.tone === 'run~lo')).toBeDefined()
  expect(at('segments', 6).find((x) => x.tone === 'run~lo')).toBeUndefined()
  const head = (f: number) => at('line', f).find((x) => x.text.includes('╸'))!.tone
  expect(head(0)).not.toBe(head(6))
  // blocks: a light band sweeps the blocks too; dots: the edge of a meter twinkles; spark: the
  // newest reading pulses
  const glow = (spans: any[]) => where(spans, (x) => x.tone === 'run~hi' && x.text.includes('█'))
  expect(glow(at('blocks', 4))).not.toBe(glow(at('blocks', 6)))
  expect(at('blocks', 4, false).some((x) => x.tone === 'run~hi')).toBe(false)
  const dots = new Set<string>()
  for (let f = 0; f < 34; f++) dots.add(JSON.stringify(at('dots', f).map((x) => x.tone)))
  expect(dots.size).toBeGreaterThan(1)
  const spark = (f: number) => drawBar('spark', { fill: [0, 0.4], tone: 'run', hist: [10, 20, 40], frame: f, active: true }).at(-1)!.tone
  expect(spark(0)).not.toBe(spark(8))
})

test('motion all moves every bar on screen; motion off holds them still', async ($, on) => {
  const { clock } = stubs(on)
  await start($, clock)
  // the 5h meter's row, colors and all, a few frames apart
  const paint = async () => {
    const site = await $.ui.mount({ ...BAND, viewport: { columns: 120, rows: 40 }, props: { ...BAND.props, bodyColumns: 115, maxRows: 30 }, surface: 'terminal' })
    const rows = []
    for (let i = 0; i < 8; i++) rows.push(JSON.stringify((await site.find({ key: 'hud' + i }))?.children ?? null))
    await site.unmount()
    return rows.find((r) => r.includes('5h'))!
  }
  const seen = new Set<string>()
  for (let i = 0; i < 6; i++) {
    seen.add(await paint())
    await clock.advance(300)
  }
  expect(seen.size).toBeGreaterThan(1)
  expect(await nunchi($, 'motion off')).toMatch(/motion off/)
  const still = new Set<string>()
  for (let i = 0; i < 6; i++) {
    still.add(await paint())
    await clock.advance(300)
  }
  const [p1, p2] = [...still]
  expect([...still]).toHaveLength(1)
  expect(await nunchi($, 'motion nope')).toMatch(/motion: all work off/)
})
