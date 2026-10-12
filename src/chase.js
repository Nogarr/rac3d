import {
  BLOCK, LINES, CITY, DIRS, neighbor, nodePos, nearestNode, edgeWidth, laneOffsets,
  bfsFrom, collideCircle, lineOfSight, snapToStreet, nodeId, linePos,
} from './city'
import { BIKES } from './bikes'
import { createRider, stepBike, shiftRider, forceCrash } from './physics'
import { input } from './input'
import { readControls, toast, wrapAngle } from './shared'

// Modo escape: perdé a la policía. La barra de EVASIÓN se llena mientras ningún
// patrullero te ve; si te acorralan casi quieto, se llena la de ATRAPADO.

const TRAFFIC = 34
const EVADE_TIME = 15 // segundos sin que te vean para escapar
const BUST_TIME = 2.4

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const CAR_COLORS = ['#d8d4cc', '#2f3640', '#8c1d24', '#1f4e8c', '#c9a227', '#5d6a72', '#efefea', '#3d5a3a', '#7a4a2a', '#b7babd']

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function placeOnEdge(c) {
  const [nx, nz] = nodePos(c.from)
  const [dx, dz] = DIRS[c.d]
  const off = c.laneOff
  // derecha de la dirección de marcha = (-dz, dx)
  c.tx = nx + dx * c.prog + -dz * off
  c.tz = nz + dz * c.prog + dx * off
  c.tyaw = Math.atan2(dx, dz)
}

function setLane(c, laneIdx) {
  const lanes = laneOffsets(edgeWidth(c.from, c.d))
  c.lane = Math.min(laneIdx, lanes.length - 1)
  c.laneOff = c.police ? (lanes.length > 1 ? 3.5 : 1.6) : lanes[c.lane]
}

function makeCar(r, from, d, prog, police = false) {
  const c = {
    police, from, d, prog, lane: 0, laneOff: 2.8,
    speed: 0, vmax: police ? 30 : 9 + r() * 6, x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0,
    color: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)],
    next: -1, mode: 'graph', active: !police,
  }
  setLane(c, Math.floor(r() * 2))
  if (edgeWidth(from, d) > 15) c.vmax += 4
  placeOnEdge(c)
  c.x = c.tx
  c.z = c.tz
  c.yaw = c.tyaw
  return c
}

function validEdge(from, d) {
  return neighbor(from, d) >= 0
}

export function createChase(bikeId) {
  const bike = BIKES[bikeId] || BIKES.dominar
  const r = rng(Date.now() % 100000)
  // largás por Av. Belgrano (x = 192) hacia el norte
  const startX = linePos(3) - 2.6
  const startZ = linePos(4) + 20
  const player = createRider(bike, startX, startZ, 0)
  const cars = []
  let guard = 0
  while (cars.length < TRAFFIC && guard++ < 500) {
    const from = Math.floor(r() * LINES * LINES)
    const d = Math.floor(r() * 4)
    if (!validEdge(from, d)) continue
    const c = makeCar(r, from, d, 8 + r() * (BLOCK - 16))
    if (Math.hypot(c.x - startX, c.z - startZ) < 40) continue
    cars.push(c)
  }
  // primer patrullero: una cuadra atrás, por la misma avenida
  const p1 = makeCar(r, nodeId(3, 3), 1, 10, true)
  p1.active = true
  const police = [p1, makeCar(r, nodeId(8, 8), 2, 10, true), makeCar(r, nodeId(0, 8), 0, 10, true)]
  police.forEach((p, i) => {
    p.id = i
    p.vmax = 30 + i
    p.seenT = 99
  })
  return {
    mode: 'chase',
    bike,
    player,
    cars,
    police,
    rand: r,
    running: false,
    phase: 'grid',
    countdown: 3.6,
    time: 0,
    toast: { text: '', t: 0 },
    events: [],
    shake: 0,
    crashes: 0,
    idealBody: 0,
    evade: 0,
    bust: 0,
    seen: true,
    lastSeen: { x: startX, z: startZ },
    sinceSeen: 0,
    nearestCop: 999,
    result: null,
    finishAt: null,
    spawnAt: [8, 20],
    bfs: null,
    bfsTarget: -1,
  }
}

// ---------- tráfico ----------
function stepCar(c, st, dt) {
  const p = st.player
  let target = c.vmax
  // seguir al de adelante en el mismo tramo y carril
  for (const o of st.cars) {
    if (o === c || o.from !== c.from || o.d !== c.d || o.lane !== c.lane) continue
    const gap = o.prog - c.prog
    if (gap > 0 && gap < 12) target = Math.min(target, o.speed * (gap / 12))
  }
  // frenar si la moto está adelante
  const fx = Math.sin(c.yaw)
  const fz = Math.cos(c.yaw)
  const dx = p.x - c.x
  const dz = p.z - c.z
  const ahead = dx * fx + dz * fz
  const side = Math.abs(dx * fz - dz * fx)
  if (ahead > 0 && ahead < 14 && side < 2.4) target = Math.min(target, (ahead - 4) * 0.8)
  target = Math.max(0, target)
  c.speed += clamp(target - c.speed, -9 * dt, 3 * dt)
  advance(c, st, dt)
}

function chooseNext(c, st) {
  const at = neighbor(c.from, c.d)
  const back = (c.d + 2) % 4
  const opts = []
  for (let d = 0; d < 4; d++) if (d !== back && validEdge(at, d)) opts.push(d)
  if (!opts.length) return back
  if (c.police && st.bfs) {
    let best = opts[0]
    let bd = Infinity
    for (const d of opts) {
      const m = neighbor(at, d)
      const v = st.bfs[m] + st.rand() * 0.5
      if (v < bd) {
        bd = v
        best = d
      }
    }
    // si el objetivo está justo atrás, pegar la vuelta
    if (st.bfs[neighbor(at, back)] < bd - 0.5) return back
    return best
  }
  if (opts.includes(c.d) && st.rand() < 0.55) return c.d
  return opts[Math.floor(st.rand() * opts.length)]
}

function advance(c, st, dt) {
  if (c.next < 0 && c.prog > BLOCK - 34) c.next = chooseNext(c, st)
  // aflojar antes de doblar
  if (c.next >= 0 && c.next !== c.d && c.prog > BLOCK - 26) c.speed = Math.min(c.speed, c.police ? 13 : 7)
  c.prog += c.speed * dt
  if (c.prog >= BLOCK) {
    const at = neighbor(c.from, c.d)
    const nd = c.next >= 0 ? c.next : chooseNext(c, st)
    c.prog -= BLOCK
    c.from = at
    c.d = nd
    c.next = -1
    setLane(c, c.lane)
  }
  placeOnEdge(c)
  // suavizado visual de giros y cambios de carril
  const k = Math.min(1, dt * 8)
  c.x += (c.tx - c.x) * k
  c.z += (c.tz - c.z) * k
  c.yaw += wrapAngle(c.tyaw - c.yaw) * Math.min(1, dt * 6)
}

// ---------- policía ----------
function toGraph(c) {
  const n = nearestNode(c.x, c.z)
  const [nx, nz] = nodePos(n)
  const dx = c.x - nx
  const dz = c.z - nz
  let d
  let prog
  if (Math.abs(dx) > Math.abs(dz)) {
    d = dx > 0 ? 0 : 2
    prog = Math.abs(dx)
  } else {
    d = dz > 0 ? 1 : 3
    prog = Math.abs(dz)
  }
  if (!validEdge(n, d)) d = (d + 2) % 4
  c.from = n
  c.d = d
  c.prog = Math.min(prog, BLOCK - 1)
  // que siga hacia donde apunta
  const [ex, ez] = DIRS[d]
  if (Math.sin(c.yaw) * ex + Math.cos(c.yaw) * ez < 0) {
    const m = neighbor(n, d)
    if (m >= 0) {
      c.from = m
      c.d = (d + 2) % 4
      c.prog = BLOCK - c.prog
    }
  }
  c.next = -1
  c.mode = 'graph'
  setLane(c, 0)
}

function stepPolice(c, st, dt) {
  const p = st.player
  const dx = p.x - c.x
  const dz = p.z - c.z
  const dist = Math.hypot(dx, dz)
  const los = dist < 180 && lineOfSight(c.x, c.z, p.x, p.z)
  c.seesPlayer = dist < 26 || los
  if (c.mode === 'graph' && dist < 42 && los) c.mode = 'direct'
  if (c.mode === 'direct' && (dist > 60 || !los)) toGraph(c)

  if (c.mode === 'direct') {
    const lead = 0.5
    const aimX = p.x + Math.sin(p.yaw) * p.v * lead
    const aimZ = p.z + Math.cos(p.yaw) * p.v * lead
    const want = Math.atan2(aimX - c.x, aimZ - c.z)
    const turn = clamp(wrapAngle(want - c.yaw), -2.3 * dt, 2.3 * dt)
    c.yaw += turn
    const target = dist > 14 ? c.vmax : Math.max(4, p.v + 2)
    c.speed += clamp(target - c.speed, -12 * dt, 6 * dt)
    c.x += Math.sin(c.yaw) * c.speed * dt
    c.z += Math.cos(c.yaw) * c.speed * dt
    const o = { x: c.x, z: c.z }
    if (collideCircle(o, 1.7)) c.speed *= 0.9
    c.x = o.x
    c.z = o.z
    return
  }
  // por las calles, hacia vos o tu última posición conocida
  const ahead = c.prog < BLOCK - 26 || c.next === c.d ? c.vmax : 13
  c.speed += clamp(ahead - c.speed, -12 * dt, 6 * dt)
  advance(c, st, dt)
}

function spawnPolice(c, st) {
  const pn = nearestNode(st.player.x, st.player.z)
  const dist = bfsFrom(pn)
  const cands = []
  for (let n = 0; n < LINES * LINES; n++) if (dist[n] >= 4 && dist[n] <= 6) cands.push(n)
  const n = cands[Math.floor(st.rand() * cands.length)] ?? 0
  for (let d = 0; d < 4; d++) {
    const m = neighbor(n, d)
    if (m >= 0 && dist[m] < dist[n]) {
      c.from = n
      c.d = d
      break
    }
  }
  c.prog = 2
  c.speed = 15
  c.active = true
  c.mode = 'graph'
  setLane(c, 0)
  placeOnEdge(c)
  c.x = c.tx
  c.z = c.tz
  c.yaw = c.tyaw
  toast(st, 'OTRO PATRULLERO EN CAMINO', 2)
}

// ---------- choques con la moto ----------
const car2 = { x: 0, z: 0 }
function hitVehicle(st, c, radius, crashMsg) {
  const p = st.player
  if (p.crash > 0) return
  for (const s of [-1.15, 1.15]) {
    car2.x = c.x + Math.sin(c.yaw) * s
    car2.z = c.z + Math.cos(c.yaw) * s
    const dx = p.x - car2.x
    const dz = p.z - car2.z
    const d = Math.hypot(dx, dz)
    const R = radius + 0.55
    if (d >= R || d < 1e-6) continue
    const nx = dx / d
    const nz = dz / d
    p.x += nx * (R - d)
    p.z += nz * (R - d)
    const pvx = Math.sin(p.yaw) * p.v
    const pvz = Math.cos(p.yaw) * p.v
    const cvx = Math.sin(c.yaw) * c.speed
    const cvz = Math.cos(c.yaw) * c.speed
    const impact = -((pvx - cvx) * nx + (pvz - cvz) * nz)
    if (impact > 7.5) {
      if (forceCrash(p, crashMsg)) {
        st.crashes++
        st.shake = 1
        toast(st, p.crashReason, 2.4)
      }
    } else if (impact > 0) {
      p.v *= 0.75
      p.lean *= 0.6
      st.shake = Math.max(st.shake, 0.3)
    }
    c.speed *= 0.8
    return
  }
}

const pc = { x: 0, z: 0 }
function drivePlayer(st, dt) {
  const p = st.player
  while (input.shifts.length) {
    const msg = shiftRider(p, input.shifts.shift())
    if (msg) toast(st, msg, 1.2)
  }
  const inPark = CITY.parks.some((k) => p.x > k.x0 && p.x < k.x1 && p.z > k.z0 && p.z < k.z1)
  const env = inPark ? { grip: p.bike.offroad, drag: p.bike.offroad > 0.9 ? 0.4 : 1.6 + p.v * 0.04 } : { grip: 1 }
  p.offroad = inPark
  st.idealBody = 0
  const ev = stepBike(p, readControls(0), dt, env)
  if (ev === 'crash') {
    st.crashes++
    st.shake = 1
    toast(st, p.crashReason, 2.4)
  }
  if (ev === 'respawn') {
    const s = snapToStreet(p.x, p.z)
    pc.x = s.x
    pc.z = s.z
    collideCircle(pc, 0.6)
    p.x = pc.x
    p.z = pc.z
    p.yaw = s.yaw
  }
  // edificios
  pc.x = p.x
  pc.z = p.z
  const hit = collideCircle(pc, 0.55)
  p.x = pc.x
  p.z = pc.z
  if (hit && p.crash <= 0) {
    const fx = Math.sin(p.yaw)
    const fz = Math.cos(p.yaw)
    const into = -(fx * hit.nx + fz * hit.nz)
    if (into > 0) {
      const impact = p.v * into
      st.shake = Math.max(st.shake, Math.min(1, impact * 0.1))
      if (impact > 8 && forceCrash(p, '¡CONTRA LA PARED!')) {
        st.crashes++
        toast(st, p.crashReason, 2.4)
      } else {
        p.v *= 1 - 0.75 * into
        const sx = fx + hit.nx * into
        const sz = fz + hit.nz * into
        if (Math.hypot(sx, sz) > 0.05) p.yaw = Math.atan2(sx, sz)
        p.lean *= 0.5
      }
    }
  }
}

export function stepChase(st, dt) {
  if (st.toast.t > 0) st.toast.t -= dt
  st.shake = Math.max(0, st.shake - dt * 2.5)
  const p = st.player
  if (!st.running) return
  if (st.phase === 'grid') {
    input.shifts.length = 0
    p.rpm += ((input.throttle ? 0.72 : p.bike.idle / p.bike.redline) - p.rpm) * Math.min(1, dt * 6)
    p.throttle = input.throttle ? 1 : 0
    for (const c of st.cars) stepCar(c, st, dt)
    st.countdown -= dt
    if (st.countdown <= 0) {
      st.phase = 'race'
      st.time = 0
      st.events.push('go')
      toast(st, '¡TE VIERON! PERDÉ A LA POLICÍA', 2.6)
    }
    return
  }
  st.time += dt
  if (!st.result) drivePlayer(st, dt)
  else {
    p.v = Math.max(0, p.v - 6 * dt)
    p.x += Math.sin(p.yaw) * p.v * dt
    p.z += Math.cos(p.yaw) * p.v * dt
  }

  // ruta de la policía: hacia vos si te ven, si no a donde te vieron por última vez
  const seeing = st.police.some((c) => c.active && c.seesPlayer)
  const tx = seeing || st.sinceSeen < 3 ? p.x : st.lastSeen.x
  const tz = seeing || st.sinceSeen < 3 ? p.z : st.lastSeen.z
  const target = nearestNode(tx, tz)
  if (target !== st.bfsTarget) {
    st.bfs = bfsFrom(target)
    st.bfsTarget = target
  }

  for (const c of st.cars) stepCar(c, st, dt)
  st.spawnAt.forEach((t, i) => {
    if (t !== null && st.time >= t && !st.result) {
      spawnPolice(st.police[i + 1], st)
      st.spawnAt[i] = null
    }
  })
  let nearest = 999
  for (const c of st.police) {
    if (!c.active) continue
    stepPolice(c, st, dt)
    nearest = Math.min(nearest, Math.hypot(c.x - p.x, c.z - p.z))
  }
  st.nearestCop = nearest

  if (!st.result) {
    for (const c of st.cars) hitVehicle(st, c, 1.0, 'TE LLEVASTE PUESTO UN AUTO')
    for (const c of st.police) if (c.active) hitVehicle(st, c, 1.15, 'TE TUMBÓ UN PATRULLERO')

    st.seen = st.police.some((c) => c.active && c.seesPlayer)
    if (st.seen) {
      st.lastSeen.x = p.x
      st.lastSeen.z = p.z
      st.sinceSeen = 0
      st.evade = Math.max(0, st.evade - dt * 0.5)
    } else {
      st.sinceSeen += dt
      st.evade += dt / EVADE_TIME
    }
    const cornered = st.police.some(
      (c) => c.active && Math.hypot(c.x - p.x, c.z - p.z) < 8 && (p.v < 5 || p.crash > 0)
    )
    st.bust = cornered ? st.bust + dt / BUST_TIME : Math.max(0, st.bust - dt / 1.2)

    if (st.evade >= 1) {
      st.result = 'escaped'
      st.finishAt = st.time + 2.5
      toast(st, '¡LOS PERDISTE!', 3)
    } else if (st.bust >= 1) {
      st.result = 'busted'
      st.finishAt = st.time + 2.5
      toast(st, 'TE ATRAPARON', 3)
      for (const c of st.police) c.speed = 0
    }
  }
  if (st.finishAt !== null && st.time >= st.finishAt) {
    st.finishAt = null
    st.events.push('finish')
  }
}
