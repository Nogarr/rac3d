import { L, HALF, CURB, WALL, S0, sample, kAt, maxAbsK } from './track'
import { input } from './input'
import { tilt } from './gyro'

export const LAPS = 3

// Caja de 6 marchas: velocidad (m/s) al corte de cada marcha y empuje máximo (m/s²)
export const GEAR_TOP = [0, 16, 26, 36, 46, 56, 66]
const GEAR_PUSH = [0, 17, 12, 9.2, 7.3, 6.0, 5.1]
const SHIFT_TIME = 0.14
const FRONT_DECEL = 12.5
const REAR_DECEL = 5

const RIDERS = [
  { name: 'T. Ferreyra', num: 12, color: '#1fb5a6', suit: '#efe9dc', vmax: 62, grip: 106, bias: -1.2 },
  { name: 'M. Lucero', num: 33, color: '#e3392c', suit: '#26262b', vmax: 61.5, grip: 103, bias: 0.8 },
  { name: 'J. Bianchi', num: 8, color: '#e9ecf2', suit: '#2a55cf', vmax: 61, grip: 100, bias: 1.6 },
  { name: 'Vos', num: 77, color: '#ffb000', suit: '#1b2238', player: true },
  { name: 'L. Ojeda', num: 21, color: '#ff6a1a', suit: '#1c1c1e', vmax: 60.2, grip: 97, bias: -0.4 },
  { name: 'N. Sosa', num: 64, color: '#8d5bd8', suit: '#efe9dc', vmax: 59.4, grip: 94, bias: 0.2 },
]

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const smp = {}
let raceId = 0

export const settings = { assist: true }

export function torque(r) {
  if (r >= 1) return 0
  if (r < 0.15) return 0.35
  if (r < 0.7) return 0.35 + (0.65 * (r - 0.15)) / 0.55
  return 1 - (r - 0.7) * 0.5
}

export function createRace() {
  const racers = RIDERS.map((r, i) => {
    const row = Math.floor(i / 2)
    const col = i % 2
    return {
      ...r,
      id: i,
      isPlayer: !!r.player,
      total: -8 - row * 9 - col * 4,
      d: col ? 3 : -3,
      v: 0, vd: 0, latVel: 0, steer: 0, lean: 0, body: 0, yaw: 0, x: 0, z: 0,
      throttle: 0, braking: 0, front: 0, rear: 0,
      gear: 1, rpm: 0.16, shiftT: 0, limiter: false,
      frontLoad: 0, crash: 0, crashSide: 1,
      finished: false, finishTime: 0,
      lapIdx: -1, lapStart: 0, lapTimes: [], bestLap: Infinity,
      offroad: false, wobble: Math.random() * 10,
    }
  })
  const race = {
    id: ++raceId,
    racers,
    player: racers.find((r) => r.isPlayer),
    running: false,
    phase: 'grid',
    countdown: 3.6,
    time: 0,
    finishAt: null,
    finishSent: false,
    toast: { text: '', t: 0 },
    events: [],
    shake: 0,
    crashes: 0,
    idealBody: 0,
  }
  racers.forEach(place)
  return race
}

function place(r) {
  sample(r.total + S0, smp)
  r.x = smp.x + smp.rx * r.d
  r.z = smp.z + smp.rz * r.d
  const fwd = Math.max(r.v, 3)
  r.yaw = Math.atan2(smp.tx * fwd + smp.rx * r.latVel, smp.tz * fwd + smp.rz * r.latVel)
}

function toast(race, text, t = 2.6) {
  race.toast.text = text
  race.toast.t = t
}

function playerBody(race) {
  if (tilt.receiving) return tilt.value
  if (Math.abs(input.bodyKey) > 0.02) return input.bodyKey
  return settings.assist ? race.idealBody * 0.75 : 0
}

function shift(r, race, dir) {
  if (r.crash > 0) return
  if (dir > 0 && r.gear < 6) {
    r.gear++
    r.shiftT = SHIFT_TIME
  } else if (dir < 0 && r.gear > 1) {
    const next = r.v / GEAR_TOP[r.gear - 1]
    if (next > 1.12) {
      toast(race, 'SOBREGIRO · NO ENTRA', 1.2)
      return
    }
    r.gear--
    r.shiftT = SHIFT_TIME * 0.7
  }
}

function crash(r, race, why) {
  r.crash = 2.6
  r.crashSide = Math.sign(r.lean || r.latVel || 1)
  r.frontLoad = 0
  race.shake = 1
  race.crashes++
  toast(race, why, 2.4)
}

function drivePlayer(r, race, dt) {
  const k = smp.k
  race.idealBody = clamp(kAt(r.total + S0 + 12 + r.v * 0.5) * 90, -1, 1)

  // --- caída: la moto se desliza y luego se reincorpora ---
  if (r.crash > 0) {
    r.crash -= dt
    r.v = Math.max(0, r.v - 22 * dt)
    r.vd *= Math.max(0, 1 - dt * 2)
    r.latVel = r.vd - k * r.v * r.v * 0.17
    r.d += r.latVel * dt
    r.throttle = r.braking = r.front = r.rear = 0
    r.body = 0
    r.steer = 0
    r.rpm += (0.12 - r.rpm) * Math.min(1, dt * 3)
    input.shifts.length = 0
    if (r.crash <= 0) {
      r.crash = 0
      r.d = clamp(r.d, -HALF + 2, HALF - 2)
      r.v = 0
      r.vd = 0
      r.latVel = 0
      r.gear = 1
      r.lean = 0
      toast(race, 'DE NUEVO EN PISTA · 1ª', 1.6)
    }
    return
  }

  while (input.shifts.length) shift(r, race, input.shifts.shift())

  const offroad = Math.abs(r.d) > HALF + CURB * 0.6
  r.offroad = offroad
  const throttle = input.throttle ? 1 : 0
  const front = input.front ? 1 : 0
  const rear = input.rear ? 1 : 0
  const steer = clamp(input.steer, -1, 1)
  const body = playerBody(race)
  r.throttle = throttle
  r.braking = Math.max(front, rear)
  r.front = front
  r.rear = rear
  r.body += (body - r.body) * Math.min(1, dt * 8)

  // --- motor y caja ---
  if (r.shiftT > 0) r.shiftT -= dt
  const rpm = r.v / GEAR_TOP[r.gear]
  r.limiter = throttle && rpm >= 0.99
  let acc = 0
  if (throttle && r.shiftT <= 0) acc = GEAR_PUSH[r.gear] * torque(rpm)
  if (offroad) acc *= 0.45
  const drag = 0.5 + 0.0009 * r.v * r.v + (offroad ? 5 + r.v * 0.15 : 0)
  const engineBrake = throttle ? 0 : (0.6 + 3 * Math.min(rpm, 1.2)) * (1.25 - r.gear * 0.1)
  const overRev = rpm > 1 ? (rpm - 1) * 35 : 0
  const brakes = front * FRONT_DECEL + rear * REAR_DECEL
  r.v += (acc - drag - engineBrake - overRev - brakes) * dt
  r.v = clamp(r.v, 0, 75)
  const shown = r.shiftT > 0 ? rpm * 0.85 : Math.max(0.16 + throttle * 0.04, rpm)
  r.rpm += (shown - r.rpm) * Math.min(1, dt * 14)

  // --- manubrio + cuerpo ---
  const grip = offroad ? 0.6 : 1
  const maxLat = (4 + r.v * 0.2) * Math.min(1, r.v / 6) * grip
  r.vd += (steer * maxLat - r.vd) * Math.min(1, dt * 5)
  const match = clamp(r.body * Math.sign(k), -1, 1) // + = cuerpo hacia adentro de la curva
  const drift = (-k * r.v * r.v * 0.17 * (1 - 0.45 * match) * (1 - 0.22 * rear)) / grip
  const weightShift = r.body * Math.min(r.v, 40) * 0.07
  r.latVel = r.vd + drift + weightShift
  r.d += r.latVel * dt
  r.steer = steer

  // --- freno delantero con la moto inclinada: el tren delantero se va ---
  const leanAbs = Math.abs(r.lean)
  if (front && leanAbs > 0.32 && r.v > 12) {
    r.frontLoad += dt * (leanAbs - 0.32) * (r.v / 25) * 7
  } else {
    r.frontLoad = Math.max(0, r.frontLoad - dt * 1.5)
  }
  if (r.frontLoad >= 1) crash(r, race, '¡AL PISO! · FRENO DELANTERO EN CURVA')
}

function driveAI(r, race, dt) {
  const s = r.total + S0
  const ahead = maxAbsK(s, 8, 20 + r.v * 1.4)
  const kA = kAt(s + 25)
  let target =
    -Math.sign(kA) * Math.min(1, Math.abs(kA) * 70) * HALF * 0.6 +
    (r.bias || 0) +
    Math.sin(race.time * 0.3 + r.wobble) * 0.8
  target = clamp(target, -HALF + 1.2, HALF - 1.2)

  const vmax = r.isPlayer ? 60 : r.vmax
  let vT = Math.min(vmax, Math.sqrt((r.grip || 95) / Math.max(ahead, 1e-4)))
  if (r.finished) vT = Math.min(vT, 28)
  if (!r.finished && !race.player.finished && !r.isPlayer) {
    const diff = r.total - race.player.total
    vT *= diff > 120 ? 0.95 : diff < -150 ? 1.05 : 1
  }
  if (r.v < vT) r.v += 14 * Math.max(0.15, 1 - r.v / (vmax * 1.1)) * dt
  else r.v = Math.max(vT, r.v - 22 * dt)

  const rate = clamp((target - r.d) * 1.2, -4.5, 4.5)
  r.vd += (rate - r.vd) * Math.min(1, dt * 4)
  r.latVel = r.vd
  r.d += r.latVel * dt
  r.steer = clamp(r.vd / 4, -1, 1)
  r.throttle = r.v < vT ? 1 : 0
  r.braking = r.v > vT + 0.5 ? 1 : 0
  r.body = clamp(kA * 90, -1, 1) * 0.8
  r.offroad = Math.abs(r.d) > HALF + CURB * 0.6
  r.crash = 0
}

function walls(r, race, dt) {
  const lim = WALL - 0.6
  if (Math.abs(r.d) > lim) {
    const sg = Math.sign(r.d)
    r.d = sg * lim
    if (r.latVel * sg > 0) {
      const impact = Math.abs(r.latVel)
      r.v *= Math.max(0.55, 1 - impact * 0.03)
      r.vd = -sg * Math.min(4, impact * 0.4)
      if (r.isPlayer) {
        race.shake = Math.max(race.shake, Math.min(1, impact * 0.08))
        if (impact > 11 && r.crash <= 0 && !r.finished) crash(r, race, '¡CONTRA EL MURO!')
      }
    }
    r.v = Math.max(0, r.v - 6 * dt)
  }
}

function collisions(race) {
  const rs = race.racers
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j]
      if (a.crash > 0 || b.crash > 0) continue
      const dz = a.total - b.total
      if (Math.abs(dz) > 2.2) continue
      const dd = a.d - b.d
      if (Math.abs(dd) > 1.3) continue
      const s = dd > 0 ? 1 : dd < 0 ? -1 : a.id < b.id ? 1 : -1
      const push = (1.3 - Math.abs(dd)) * 0.5
      a.d += s * push
      b.d -= s * push
      a.vd += s * 1.5
      b.vd -= s * 1.5
      const behind = dz > 0 ? b : a
      behind.v *= 0.985
      if (a.isPlayer || b.isPlayer) race.shake = Math.max(race.shake, 0.25)
    }
  }
}

function laps(r, race) {
  const li = Math.floor(r.total / L)
  if (li <= r.lapIdx) return
  if (r.lapIdx >= 0) {
    const lt = race.time - r.lapStart
    r.lapTimes.push(lt)
    r.bestLap = Math.min(r.bestLap, lt)
    if (r.isPlayer && li < LAPS) {
      toast(race, (li === LAPS - 1 ? 'ÚLTIMA VUELTA · ' : `VUELTA ${li} · `) + fmtTime(lt))
    }
  }
  r.lapStart = race.time
  r.lapIdx = li
  if (li >= LAPS && !r.finished) {
    r.finished = true
    r.finishTime = race.time
    if (r.isPlayer) {
      const pos = standings(race).indexOf(r) + 1
      toast(race, `BANDERA A CUADROS · P${pos}`, 4)
      race.finishAt = race.time + 3
    }
  }
}

export function stepRace(race, dt) {
  if (race.toast.t > 0) race.toast.t -= dt
  race.shake = Math.max(0, race.shake - dt * 2.5)
  const p = race.player
  if (!race.running) return
  if (race.phase === 'grid') {
    // en la grilla se puede acelerar en vacío
    input.shifts.length = 0
    const target = input.throttle ? 0.72 : 0.16
    p.rpm += (target - p.rpm) * Math.min(1, dt * 6)
    p.throttle = input.throttle ? 1 : 0
    race.countdown -= dt
    if (race.countdown <= 0) {
      race.phase = 'race'
      race.time = 0
      race.events.push('go')
    }
    return
  }
  race.time += dt
  for (const r of race.racers) {
    sample(r.total + S0, smp)
    if (r.isPlayer && !r.finished) drivePlayer(r, race, dt)
    else driveAI(r, race, dt)
    walls(r, race, dt)
    r.total += r.v * dt
    let leanT
    if (r.crash > 0) leanT = r.crashSide * 1.45
    else
      leanT = clamp(
        smp.k * r.v * r.v * 0.012 + r.steer * Math.min(1, r.v / 20) * 0.3 + r.body * 0.22 * Math.min(1, r.v / 10),
        -0.95,
        0.95
      )
    r.lean += (leanT - r.lean) * Math.min(1, dt * (r.crash > 0 ? 4 : 6))
  }
  collisions(race)
  for (const r of race.racers) {
    place(r)
    laps(r, race)
  }
  if (p.finished) {
    const g = GEAR_TOP.findIndex((t, i) => i > 0 && t > p.v * 1.08)
    p.gear = g < 1 ? 6 : g
    p.rpm = p.v / GEAR_TOP[p.gear]
    p.front = p.rear = 0
  }
  if (race.finishAt !== null && race.time >= race.finishAt && !race.finishSent) {
    race.finishSent = true
    race.events.push('finish')
  }
}

export function standings(race) {
  return [...race.racers].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime
    if (a.finished) return -1
    if (b.finished) return 1
    return b.total - a.total
  })
}

export function getResults(race) {
  const list = race.racers.map((r) => ({
    id: r.id,
    name: r.name,
    num: r.num,
    color: r.color,
    isPlayer: r.isPlayer,
    best: r.bestLap,
    estimated: !r.finished,
    time: r.finished ? r.finishTime : race.time + Math.max(0, LAPS * L - r.total) / Math.max(r.v, 35),
  }))
  list.sort((a, b) => a.time - b.time)
  return list
}

export function fmtTime(t) {
  if (!isFinite(t)) return '—'
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export const TRACK_KM = (L / 1000).toFixed(2).replace('.', ',')
