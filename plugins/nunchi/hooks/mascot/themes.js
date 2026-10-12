// Color themes: the panel's colors plus the mascot's palette. Pure, no $.
//
// run colors the plan and what Claude is doing; five, week and ctx each meter (the 5-hour limit,
// the weekly ones, the context window) until it runs hot; ask, hot and done are for what needs
// you, what failed and what finished; track and dim draw what is empty or quiet; text is for
// labels; bg is the theme's background (text on a filled bar, previews). Each theme gives the
// mascot its own body color too.

const mascot = (body, shade, eye) => ({ body, shade, eye })

export const THEMES = {
  claude: { label: 'Claude', dark: true, bg: '#1C1917', track: '#3A332E', text: '#F2ECE6', dim: '#9A9088', run: '#D97757', ask: '#E9B44C', hot: '#EF5F4F', done: '#7BC47F', cool: '#8E85F0', five: '#6CC08B', week: '#E2A84B', ctx: '#8E85F0', mascot: mascot('#D97757', '#B4593A', '#231511') },
  ocean: { label: 'Ocean', dark: true, bg: '#0E1A24', track: '#1F3446', text: '#E3F1FA', dim: '#7FA0B5', run: '#3FA7E0', ask: '#F4C95D', hot: '#FF6B6B', done: '#2EC4B6', cool: '#7FDBFF', five: '#2EC4B6', week: '#5FA8FF', ctx: '#A0E7FF', mascot: mascot('#4EA8DE', '#2C7DB5', '#0A1A26') },
  forest: { label: 'Forest', dark: true, bg: '#121A14', track: '#27382A', text: '#E8F2E4', dim: '#86A083', run: '#8DBF6A', ask: '#E6C229', hot: '#E0605E', done: '#5FC28A', cool: '#C5E17A', five: '#8DBF6A', week: '#D9B44A', ctx: '#6FC2B0', mascot: mascot('#7DB46C', '#5A8C4C', '#132015') },
  sunset: { label: 'Sunset', dark: true, bg: '#1E1420', track: '#3D2A40', text: '#FBEAF0', dim: '#A88C9C', run: '#FF7F6A', ask: '#FFC15E', hot: '#FF4F6D', done: '#FFB38A', cool: '#C8A2FF', five: '#FF9E7A', week: '#FFC15E', ctx: '#C8A2FF', mascot: mascot('#F48FB1', '#C8678C', '#2A1220') },
  grape: { label: 'Grape', dark: true, bg: '#17131F', track: '#302742', text: '#EFE9FA', dim: '#9389AE', run: '#A78BFA', ask: '#F6C177', hot: '#F7768E', done: '#9ECE6A', cool: '#F5A3D7', five: '#9ECE6A', week: '#F6C177', ctx: '#C4A7FF', mascot: mascot('#A78BFA', '#7D5FD6', '#170F2A') },
  neon: { label: 'Neon', dark: true, bg: '#0B0B12', track: '#24243C', text: '#F4F4FF', dim: '#8080B0', run: '#00E5FF', ask: '#FFE600', hot: '#FF2E88', done: '#39FF14', cool: '#FF2EF0', five: '#39FF14', week: '#FFE600', ctx: '#00E5FF', mascot: mascot('#19E3FF', '#00A8C4', '#0B0B12') },
  mono: { label: 'Mono', dark: true, bg: '#161616', track: '#333333', text: '#EEEEEE', dim: '#888888', run: '#BDBDBD', ask: '#FFFFFF', hot: '#9E9E9E', done: '#E0E0E0', cool: '#CFCFCF', five: '#D0D0D0', week: '#B0B0B0', ctx: '#E8E8E8', mascot: mascot('#BDBDBD', '#8F8F8F', '#161616') },
  paper: { label: 'Paper', dark: false, bg: '#F7F4EE', track: '#E2DBCF', text: '#2B2622', dim: '#8A8178', run: '#C8643F', ask: '#B7791F', hot: '#C2413A', done: '#3E8E5E', cool: '#6A5ACD', five: '#3E8E5E', week: '#B7791F', ctx: '#6A5ACD', mascot: mascot('#CC6E4E', '#A24F33', '#2B2622') },
}

export const THEME_NAMES = Object.keys(THEMES)

export function theme(name) {
  return THEMES[name] ?? THEMES.claude
}

// the mascot's palette keys (see sprite.js) in a theme's colors
export function mascotPalette(name) {
  const t = theme(name)
  return { b: t.mascot.body, s: t.mascot.shade, e: t.mascot.eye, p: t.text, a: t.ask, c: t.cool, g: t.dim, h: t.hot, k: '#000000' }
}

// ---------- shades: a key like 'run~lo' is the theme's run color mixed toward something ----------

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')

// the color a span's tone or bg key names: a theme key ('ink' is the background), or one with a
// shade after `~`: lo (halfway into the background, a twinkle's low), mid (a quarter), hi (toward
// white, a shimmer), lite (a little toward white, a shimmer's edge), deep (text on a fill of that
// color), bg (a faint fill)
export function color(th, key) {
  if (!key) return undefined
  const [base, shade] = String(key).split('~')
  const c = base === 'ink' ? th.bg : th[base]
  if (typeof c !== 'string' || !shade) return c
  switch (shade) {
    case 'lo':
      return mix(c, th.bg, 0.55)
    case 'mid':
      return mix(c, th.bg, 0.28)
    case 'hi':
      return mix(c, '#ffffff', 0.38)
    case 'lite':
      return mix(c, '#ffffff', 0.18)
    case 'deep':
      return th.dark ? mix(c, '#000000', 0.74) : mix(c, '#ffffff', 0.88)
    case 'bg':
      return mix(c, th.bg, 0.45)
    default:
      return c
  }
}
