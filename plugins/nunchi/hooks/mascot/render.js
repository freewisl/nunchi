// Draws a sprite grid (sprite.js) three ways. Pure, no $.
//
// cells: half-block text, two pixels per character cell with the top pixel as the
//   foreground and the bottom as the background. Plain text with 24-bit color, so it shows
//   in any terminal: Orca (xterm.js), VS Code, tmux, Terminal.app, not only kitty/Ghostty.
// svg:   crisp rectangles, for the Desktop app's Svg element.
// rgba:  raw pixels, for an Image element where the terminal speaks the kitty protocol.

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

// a grid k times as large, each pixel a k x k square
export function scaleGrid(grid, k) {
  if (k === 1) return grid
  return grid.flatMap((row) => {
    const wide = [...row].map((ch) => ch.repeat(k)).join('')
    return Array(k).fill(wide)
  })
}

// rows of { ch, color?, bg? }; an empty cell is a bare space so the terminal's own background shows
export function toCells(grid, pal) {
  const rows = []
  for (let y = 0; y < grid.length; y += 2) {
    const top = grid[y]
    const bot = grid[y + 1] ?? ''
    const row = []
    for (let x = 0; x < top.length; x++) {
      const t = top[x] === '.' ? null : pal[top[x]]
      const b = (bot[x] ?? '.') === '.' ? null : pal[bot[x]]
      if (!t && !b) row.push({ ch: ' ' })
      else if (t && !b) row.push({ ch: '▀', color: t })
      else if (!t) row.push({ ch: '▄', color: b })
      else if (t === b) row.push({ ch: '█', color: t })
      else row.push({ ch: '▀', color: t, bg: b })
    }
    rows.push(row)
  }
  return rows
}

// one <rect> per run of same-colored pixels in a row
export function toSvgBody(grid, pal, px = 1) {
  let out = ''
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const k = row[x]
      let n = 1
      while (x + n < row.length && row[x + n] === k) n++
      if (k !== '.') out += `<rect x="${x * px}" y="${y * px}" width="${n * px}" height="${px}" fill="${pal[k]}"/>`
      x += n
    }
  })
  return out
}

export function toSvg(grid, pal, px = 4) {
  const w = grid[0].length * px
  const h = grid.length * px
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${toSvgBody(grid, pal, px)}</svg>`
}

export function toRgba(grid, pal) {
  const w = grid[0].length
  const out = new Uint8Array(w * grid.length * 4)
  grid.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      if (row[x] === '.') continue
      const [r, g, b] = hexRgb(pal[row[x]])
      out.set([r, g, b, 255], (y * w + x) * 4)
    }
  })
  return out
}

// ANSI escapes for a plain terminal: what the previews print, and what Claude Code's Text
// elements come out as once it draws the same cells
export function toAnsi(cells) {
  const fg = (h) => '\x1b[38;2;' + hexRgb(h).join(';') + 'm'
  const bg = (h) => '\x1b[48;2;' + hexRgb(h).join(';') + 'm'
  return cells.map((row) => {
    let out = ''
    let cur = ''
    for (const c of row) {
      const style = (c.color ? fg(c.color) : '') + (c.bg ? bg(c.bg) : '')
      if (style !== cur) {
        out += (cur ? '\x1b[0m' : '') + style
        cur = style
      }
      out += c.ch
    }
    return out + (cur ? '\x1b[0m' : '')
  })
}
