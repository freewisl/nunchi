// Rasterizes smooth.js shapes into anti-aliased RGBA with signed distance fields: each pixel
// takes the coverage of every shape over it (a one-pixel soft edge), composited in order over
// a transparent background. No canvas needed, so it runs inside a mod. Pure, no $.

import { SW, SH } from './smooth.js'

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

function sdRect(px, py, sh) {
  let x = px - sh.cx
  let y = py - sh.cy
  if (sh.rot) {
    const a = (-sh.rot * Math.PI) / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    ;[x, y] = [x * c - y * s, x * s + y * c]
  }
  const r = Math.min(sh.r, sh.w / 2, sh.h / 2)
  const qx = Math.abs(x) - (sh.w / 2 - r)
  const qy = Math.abs(y) - (sh.h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function sdCap(px, py, sh) {
  const bx = sh.x2 - sh.x1
  const by = sh.y2 - sh.y1
  const ax = px - sh.x1
  const ay = py - sh.y1
  const len = bx * bx + by * by
  const h = len ? Math.max(0, Math.min(1, (ax * bx + ay * by) / len)) : 0
  return Math.hypot(ax - bx * h, ay - by * h) - sh.r
}

function sdEll(px, py, sh) {
  const k = Math.hypot((px - sh.cx) / sh.rx, (py - sh.cy) / sh.ry)
  return (k - 1) * Math.min(sh.rx, sh.ry)
}

function bounds(sh) {
  if (sh.t === 'rect') {
    const e = Math.hypot(sh.w, sh.h) / 2
    return [sh.cx - e, sh.cy - e, sh.cx + e, sh.cy + e]
  }
  if (sh.t === 'cap') return [Math.min(sh.x1, sh.x2) - sh.r, Math.min(sh.y1, sh.y2) - sh.r, Math.max(sh.x1, sh.x2) + sh.r, Math.max(sh.y1, sh.y2) + sh.r]
  return [sh.cx - sh.rx, sh.cy - sh.ry, sh.cx + sh.rx, sh.cy + sh.ry]
}

// painted shapes (colors, not palette keys) -> { rgba, width, height } at `scale` pixels per unit
// (scaleY apart for pixels that are not square, as a character cell's pieces are)
export function rasterize(shapes, scale = 2, w = SW, h = SH, scaleY = scale) {
  const W = Math.round(w * scale)
  const H = Math.round(h * scaleY)
  const acc = new Float32Array(W * H * 4) // premultiplied
  const edge = Math.min(scale, scaleY)
  for (const sh of shapes) {
    const alpha = sh.a == null ? 1 : Math.max(0, Math.min(1, sh.a))
    if (alpha <= 0) continue
    const [r, g, b] = hexRgb(sh.fill)
    const sd = sh.t === 'rect' ? sdRect : sh.t === 'cap' ? sdCap : sdEll
    const [x0, y0, x1, y1] = bounds(sh)
    const px0 = Math.max(0, Math.floor(x0 * scale) - 1)
    const py0 = Math.max(0, Math.floor(y0 * scaleY) - 1)
    const px1 = Math.min(W - 1, Math.ceil(x1 * scale) + 1)
    const py1 = Math.min(H - 1, Math.ceil(y1 * scaleY) + 1)
    for (let py = py0; py <= py1; py++) {
      const uy = (py + 0.5) / scaleY
      for (let px = px0; px <= px1; px++) {
        const d = sd((px + 0.5) / scale, uy, sh)
        const cov = Math.max(0, Math.min(1, 0.5 - d * edge))
        if (cov <= 0) continue
        const a = cov * alpha
        const i = (py * W + px) * 4
        const keep = 1 - a
        acc[i] = r * a + acc[i] * keep
        acc[i + 1] = g * a + acc[i + 1] * keep
        acc[i + 2] = b * a + acc[i + 2] * keep
        acc[i + 3] = a + acc[i + 3] * keep
      }
    }
  }
  const rgba = new Uint8Array(W * H * 4)
  for (let i = 0; i < acc.length; i += 4) {
    const a = acc[i + 3]
    if (a <= 0) continue
    rgba[i] = Math.round((acc[i] / a) * 255)
    rgba[i + 1] = Math.round((acc[i + 1] / a) * 255)
    rgba[i + 2] = Math.round((acc[i + 2] / a) * 255)
    rgba[i + 3] = Math.round(a * 255)
  }
  return { rgba, width: W, height: H }
}
