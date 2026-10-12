import { L, HALF, CURB, WALL, S0, sample, kAt, maxAbsK, project } from './track'
import { input } from './input'
import { BIKES, bestDrive, dragAcc, topSpeed } from './bikes'
import { createRider, stepBike, shiftRider, forceCrash } from './physics'
import { readControls, toast, fmtTime, wrapAngle } from './shared'

export const LAPS = 3
export const TRACK_KM = (L / 1000).toFixed(2).replace('.', ',')

// Copa monomarca: todos corren con la moto que elegiste
const RIVALS = [
  { name: 'T. Ferreyra', num: 12, color: '#1fb5a6', suit: '#efe9dc', skill: 0.985, bias: -1.2 },
  { name: 'M. Lucero', num: 33, color: '#e3392c', suit: '#26262b', skill: 0.97, bias: 0.8 },
  { name: 'J. Bianchi', num: 8, color: '#e9ecf2', suit: '#2a55cf', skill: 0.96, bias: 1.6 },
  { name: 'L. Ojeda', num: 21, color: '#ff8a1a', suit: '#1c1c1e', skill: 0.95, bias: -0.4 },
  { name: 'N. Sosa', num: 64, color: '#8d5bd8', suit: '#efe9dc', skill: 0.94, bias: 0.2 },
]
const GRID_ORDER = [0, 1, 2, 'player', 3, 4]

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const smp = {}
const prj = {}
let raceId = 0

export function createRace(bikeId) {
  const bike = BIKES[bikeId] || BIKES.dominar
  const vTop = topSpeed(bike)
  const racers = GRID_ORDER.map((who, i) => {
    const row = Math.floor(i / 2)
    const col = i % 2
    const total = -8 - row * 9 - col * 4
    const d = col ? 3 : -3
    if (who === 'player') {
      sample(total + S0, smp)
      const p = createRider(bike, smp.x + smp.rx * d, smp.z + smp.rz * d, Math.atan2(smp.tx, smp.tz))
      return Object.assign(p, {
        id: i, isPlayer: true, name: 'Vos', num: 77, color: bike.look.color, suit: '#1b2238',
        total, d, idx: -1, finished: false, finishTime: 0,
        lapIdx: -1, lapStart: 0, lapTimes: [], bestLap: Infinity, offroad: false,
      })
    }
    const r = RIVALS[who]
    return {
      ...r, bike, id: i, isPlayer: false,
      vmax: vTop * r.skill,
      grip: 9.81 * Math.tan(bike.leanLimit + 0.1) * (0.86 + (r.skill - 0.94) * 1.2),
      total, d, v: 0, vd: 0, latVel: 0, steer: 0, lean: 0, body: 0, yaw: 0, x: 0, z: 0,
      throttle: 0, braking: 0, gear: 1, rpm: 0.15, crash: 0,
      finished: false, finishTime: 0, lapIdx: -1, lapStart: 0, lapTimes: [], bestLap: Infinity,
      offroad: false, wobble: Math.random() * 10,
    }
  })
  const race = {
    mode: 'race',
    id: ++raceId,
    bike,
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
  racers.forEach((r) => !r.isPlayer && placeAI(r))
  project(race.player.x, race.player.z, -1, prj)
  race.player.idx = prj.idx
  return race
}

function placeAI(r) {
  sample(r.total + S0, smp)
  r.x = smp.x + smp.rx * r.d
  r.z = smp.z + smp.rz * r.d
  const fwd = Math.max(r.v, 3)
  r.yaw = Math.atan2(smp.tx * fwd + smp.rx * r.latVel, smp.tz * fwd + smp.rz * r.latVel)
}

// Piloto automático (vuelta de honor y pruebas)
export function autopilot(p, target = 20) {
  project(p.x, p.z, p.idx, prj)
  const ty = Math.atan2(prj.tx, prj.tz)
  const err = wrapAngle(p.yaw - ty)
  const kA = kAt(prj.s + 6)
  const ff = Math.atan((p.v * p.v * kA) / 9.81) / (p.bike.leanLimit * 1.12)
  return {
    throttle: p.v < target,
    front: false,
    rear: p.v > target + 3,
    steer: clamp(ff + err * 1.4 - prj.d * 0.05, -0.85, 0.85),
    body: clamp(kA * 60, -1, 1),
  }
}

function drivePlayer(p, race, dt) {
  const b = p.bike
  project(p.x, p.z, p.idx, prj)
  race.idealBody = clamp(kAt(prj.s + 10 + p.v * 0.6) * 60, -1, 1)
  const offroad = Math.abs(prj.d) > HALF + CURB * 0.6
  p.offroad = offroad
  const env = offroad ? { grip: b.offroad, drag: b.offroad > 0.9 ? 0.5 : 2.2 + p.v * 0.05 } : { grip: 1 }

  if (!p.finished) {
    while (input.shifts.length) {
      const msg = shiftRider(p, input.shifts.shift())
      if (msg) toast(race, msg, 1.2)
    }
  }
  const ctrl = p.finished ? autopilot(p) : readControls(race.idealBody)
  if (p.finished) {
    // en la vuelta de honor la caja va sola
    const g = p.bike.gearTop.findIndex((t, i) => i > 0 && t > p.v * 1.15)
    p.gear = g < 1 ? 6 : g
  }
  const ev = stepBike(p, ctrl, dt, env)
  if (ev === 'crash') {
    race.crashes++
    race.shake = 1
    toast(race, p.crashReason, 2.4)
  }
  if (ev === 'respawn') {
    project(p.x, p.z, p.idx, prj)
    const d = clamp(prj.d, -HALF + 2, HALF - 2)
    p.x = prj.cx + prj.rx * d
    p.z = prj.cz + prj.rz * d
    p.yaw = Math.atan2(prj.tx, prj.tz)
    toast(race, 'DE NUEVO EN PISTA · 1ª', 1.6)
  }

  const prevS = prj.s
  project(p.x, p.z, prj.idx, prj)
  let ds = prj.s - prevS
  if (ds < -L / 2) ds += L
  if (ds > L / 2) ds -= L
  p.total += ds
  p.idx = prj.idx
  p.d = prj.d

  // muro
  const lim = WALL - 0.6
  if (Math.abs(p.d) > lim) {
    const sg = Math.sign(p.d)
    p.x += prj.rx * (sg * lim - p.d)
    p.z += prj.rz * (sg * lim - p.d)
    p.d = sg * lim
    const fx = Math.sin(p.yaw)
    const fz = Math.cos(p.yaw)
    const out = (fx * prj.rx + fz * prj.rz) * sg
    if (out > 0) {
      const impact = p.v * out
      race.shake = Math.max(race.shake, Math.min(1, impact * 0.1))
      if (impact > 8.5 && forceCrash(p, '¡CONTRA EL MURO!')) {
        race.crashes++
        toast(race, p.crashReason, 2.4)
      } else {
        p.v *= 1 - 0.7 * out
        const back = fx * prj.tx + fz * prj.tz < 0
        p.yaw = Math.atan2(prj.tx, prj.tz) + (back ? Math.PI : 0)
        p.lean *= 0.5
      }
    }
  }
}

function driveAI(r, race, dt) {
  const b = r.bike
  const s = r.total + S0
  const ahead = maxAbsK(s, 6, 15 + r.v * 1.5)
  const kA = kAt(s + 20)
  let target =
    -Math.sign(kA) * Math.min(1, Math.abs(kA) * 60) * HALF * 0.6 +
    (r.bias || 0) +
    Math.sin(race.time * 0.3 + r.wobble) * 0.8
  target = clamp(target, -HALF + 1.2, HALF - 1.2)

  let vT = Math.min(r.vmax, Math.sqrt(r.grip / Math.max(ahead, 1e-4)))
  if (r.finished) vT = Math.min(vT, 20)
  if (!r.finished && !race.player.finished) {
    const diff = r.total - race.player.total
    vT *= diff > 100 ? 0.95 : diff < -120 ? 1.04 : 1
  }
  if (r.v < vT) r.v += Math.max(0, bestDrive(b, r.v) - dragAcc(b, r.v)) * dt
  else r.v = Math.max(vT, r.v - b.front * 0.8 * dt)
  const g = b.gearTop.findIndex((t, i) => i > 0 && t > r.v * 1.08)
  r.gear = g < 1 ? 6 : g
  r.rpm = r.v / b.gearTop[r.gear]

  const rate = clamp((target - r.d) * 1.2, -4, 4)
  r.vd += (rate - r.vd) * Math.min(1, dt * 4)
  r.latVel = r.vd
  r.d += r.latVel * dt
  r.steer = clamp(r.vd / 4, -1, 1)
  r.throttle = r.v < vT ? 1 : 0
  r.braking = r.v > vT + 0.5 ? 1 : 0
  r.body = clamp(kA * 60, -1, 1) * 0.8
  r.offroad = Math.abs(r.d) > HALF + CURB * 0.6
  r.total += r.v * dt
  sample(r.total + S0, smp)
  const leanT = clamp(Math.atan((smp.k * r.v * r.v) / 9.81) + r.steer * 0.1, -b.leanLimit, b.leanLimit)
  r.lean += (leanT - r.lean) * Math.min(1, dt * 5)
}

function collisions(race) {
  const rs = race.racers
  const p = race.player
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], c = rs[j]
      if (a.crash > 0 || c.crash > 0) continue
      const dz = a.total - c.total
      if (Math.abs(dz) > 2.2) continue
      const dd = a.d - c.d
      if (Math.abs(dd) > 1.3) continue
      const s = dd > 0 ? 1 : dd < 0 ? -1 : a.id < c.id ? 1 : -1
      const push = (1.3 - Math.abs(dd)) * 0.5
      for (const [r, sg] of [[a, s], [c, -s]]) {
        if (r.isPlayer) {
          project(r.x, r.z, r.idx, prj)
          r.x += prj.rx * sg * push
          r.z += prj.rz * sg * push
          r.d += sg * push
          r.lean += sg * 0.05
        } else {
          r.d += sg * push
          r.vd += sg * 1.5
        }
      }
      const behind = dz > 0 ? c : a
      behind.v *= 0.985
      if (a === p || c === p) race.shake = Math.max(race.shake, 0.25)
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
    if (r.isPlayer && li < LAPS) toast(race, (li === LAPS - 1 ? 'ÚLTIMA VUELTA · ' : `VUELTA ${li} · `) + fmtTime(lt), 2.6)
  }
  r.lapStart = race.time
  r.lapIdx = li
  if (li >= LAPS && !r.finished) {
    r.finished = true
    r.finishTime = race.time
    if (r.isPlayer) {
      toast(race, `BANDERA A CUADROS · P${standings(race).indexOf(r) + 1}`, 4)
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
    input.shifts.length = 0
    const target = input.throttle ? 0.72 : p.bike.idle / p.bike.redline
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
    if (r.isPlayer) drivePlayer(r, race, dt)
    else driveAI(r, race, dt)
  }
  collisions(race)
  for (const r of race.racers) {
    if (!r.isPlayer) placeAI(r)
    laps(r, race)
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
    time: r.finished ? r.finishTime : race.time + Math.max(0, LAPS * L - r.total) / Math.max(r.v, 25),
  }))
  list.sort((a, b) => a.time - b.time)
  return list
}
