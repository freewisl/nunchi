// Where the mascot stands in the band above the prompt and which way it faces. Pure, no $.
//
// It wanders the band while you are idle, paces a little while Claude thinks and runs about
// while agents work. For anything else (reading, editing, asking, celebrating, napping) it stops
// where it is and plays the mood's motion. Positions are columns from the band's left edge;
// `room` is how far right it may go, set from the band's width as it is drawn.

const PACES = {
  idle: { speed: 5, rest: [3000, 9000], span: Infinity },
  look: { speed: 5, rest: [3000, 9000], span: Infinity },
  think: { speed: 3, rest: [1500, 4000], span: 8 },
  run: { speed: 14, rest: [200, 800], span: Infinity },
}
const MIN_TRIP = 4 // columns: shorter trips are not worth a walk

export function newRoam() {
  return { x: 0, dir: 1, target: null, restUntil: 0, room: 0 }
}

// one tick of `dt` ms in a mood: { motion, flip } to play, moving r along
export function stepRoam(r, motion, now, dt, rand = Math.random) {
  r.x = Math.max(0, Math.min(r.x, r.room))
  const pace = PACES[motion]
  const still = { motion, flip: r.dir < 0 }
  if (!pace || r.room < MIN_TRIP) {
    r.target = null
    return still
  }
  if (r.target === null) {
    if (now < r.restUntil) return still
    const reach = Math.min(pace.span, r.room)
    const dist = MIN_TRIP + rand() * Math.max(0, reach - MIN_TRIP)
    let dir = rand() < 0.5 ? -1 : 1
    const end = r.x + dir * dist
    if (end < 0 || end > r.room) dir = -dir // turn around at a wall
    r.target = Math.max(0, Math.min(r.room, r.x + dir * dist))
    r.dir = dir
  }
  const left = r.target - r.x
  const step = (pace.speed * dt) / 1000
  if (Math.abs(left) <= step) {
    r.x = r.target
    r.target = null
    r.restUntil = now + pace.rest[0] + rand() * (pace.rest[1] - pace.rest[0])
    return { motion, flip: r.dir < 0 }
  }
  r.x += Math.sign(left) * step
  return { motion: pace.speed >= 10 ? 'run' : 'walk', flip: r.dir < 0 }
}
