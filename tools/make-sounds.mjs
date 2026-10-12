// Writes nunchi's sounds, synthesized here from sine tones: soft, short, 22050 Hz 16-bit mono WAV.
//   node tools/make-sounds.mjs [outDir]   (default sounds)
//
//   alert   two rising notes: Claude needs your OK or asked you something
//   done    a rising arpeggio: a turn finished, tests passed
//   error   two falling notes, a little rough: something failed
//   commit  a pop and a sparkle: a commit, a push, a pull request

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RATE = 22050
const out = process.argv[2] ?? join(import.meta.dirname, '..', 'sounds')

const hz = (note) => 440 * 2 ** ((note - 69) / 12) // MIDI note number -> frequency

// one note: a sine with a soft octave above, a quick attack and an exponential fade
function note(buf, at, midi, len, { gain = 0.3, decay = 6, rough = 0 } = {}) {
  const f = hz(midi)
  const start = Math.round(at * RATE)
  const n = Math.round(len * RATE)
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / RATE
    const env = Math.min(1, t / 0.006) * Math.exp(-decay * t)
    let s = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)
    if (rough) s += rough * Math.sign(Math.sin(2 * Math.PI * f * t)) // a touch of square for the error
    buf[start + i] += gain * env * s
  }
}

// a short burst of filtered noise, falling in pitch: the pop
function pop(buf, at, len, gain = 0.25) {
  const start = Math.round(at * RATE)
  const n = Math.round(len * RATE)
  let seed = 12345
  let lp = 0
  for (let i = 0; i < n && start + i < buf.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0
    const white = (seed / 2 ** 32) * 2 - 1
    lp += (white - lp) * 0.25
    const t = i / RATE
    buf[start + i] += gain * Math.exp(-40 * t) * (lp + 0.6 * Math.sin(2 * Math.PI * (500 - 2000 * t) * t))
  }
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  const peak = Math.max(1e-9, ...samples.map(Math.abs))
  const scale = peak > 0.9 ? 0.9 / peak : 1
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * scale)) * 32767), i * 2))
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20) // PCM
  head.writeUInt16LE(1, 22) // mono
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

const sounds = {
  alert(b) {
    note(b, 0, 81, 0.25, { decay: 9 }) // A5
    note(b, 0.12, 86, 0.35, { decay: 7 }) // D6
  },
  done(b) {
    note(b, 0, 72, 0.3, { decay: 8 }) // C5
    note(b, 0.08, 76, 0.3, { decay: 8 }) // E5
    note(b, 0.16, 79, 0.3, { decay: 8 }) // G5
    note(b, 0.24, 84, 0.45, { decay: 5, gain: 0.25 }) // C6
  },
  error(b) {
    note(b, 0, 64, 0.22, { decay: 8, rough: 0.15 }) // E4
    note(b, 0.13, 60, 0.32, { decay: 6, rough: 0.15 }) // C4
  },
  commit(b) {
    pop(b, 0, 0.08)
    note(b, 0.05, 88, 0.25, { decay: 10, gain: 0.2 }) // E6
    note(b, 0.11, 93, 0.3, { decay: 9, gain: 0.18 }) // A6
  },
}

mkdirSync(out, { recursive: true })
for (const [name, make] of Object.entries(sounds)) {
  const b = new Float64Array(Math.round(0.7 * RATE))
  make(b)
  let end = b.length // trim the silent tail
  while (end > 1 && Math.abs(b[end - 1]) < 1e-4) end--
  const file = join(out, name + '.wav')
  writeFileSync(file, wav([...b.subarray(0, end)]))
  console.log(file, ((end / RATE) * 1000).toFixed(0) + 'ms')
}
